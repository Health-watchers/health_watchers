
import mongoose, { Types } from 'mongoose';
import { StaffScheduleModel, IStaffSchedule, RecurrenceType } from './models/staff-schedule.model';

/**
 * Helper to convert HH:mm string to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Check if a schedule falls within a date range
 */
function isScheduleInDateRange(
  schedule: IStaffSchedule,
  dateFrom: Date,
  dateTo: Date,
): boolean {
  const dateFromStart = new Date(dateFrom);
  dateFromStart.setHours(0, 0, 0, 0);
  const dateToEnd = new Date(dateTo);
  dateToEnd.setHours(23, 59, 59, 999);

  if (schedule.recurrence === 'none' && schedule.date) {
    const scheduleDate = new Date(schedule.date);
    scheduleDate.setHours(0, 0, 0, 0);
    return scheduleDate >= dateFromStart && scheduleDate <= dateToEnd;
  }

  if (schedule.dayOfWeek !== undefined) {
    const startCheck = schedule.createdAt || new Date(0);
    const endCheck = schedule.recurrenceEndDate || new Date(8640000000000000);
    const checkStart = new Date(Math.max(startCheck.getTime(), dateFromStart.getTime()));
    const checkEnd = new Date(Math.min(endCheck.getTime(), dateToEnd.getTime()));
    
    // Check if any day in the range matches the dayOfWeek
    for (let d = new Date(checkStart); d <= checkEnd; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === schedule.dayOfWeek) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check for schedule conflicts
 */
export async function checkScheduleConflict(
  userId: string,
  clinicId: string,
  startTime: string,
  endTime: string,
  date?: Date,
  dayOfWeek?: number,
  recurrence?: RecurrenceType,
  excludeId?: string,
): Promise<boolean> {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes >= endMinutes) {
    return true; // Invalid time range
  }

  const filter: Record<string, unknown> = {
    userId: new Types.ObjectId(userId),
    clinicId: new Types.ObjectId(clinicId),
  };
  if (excludeId) {
    filter._id = { $ne: new Types.ObjectId(excludeId) };
  }

  const schedules = await StaffScheduleModel.find(filter).lean();

  return schedules.some((existing) => {
    const existingStart = timeToMinutes(existing.startTime);
    const existingEnd = timeToMinutes(existing.endTime);

    // Check if times overlap
    const timeOverlap = !(endMinutes <= existingStart || startMinutes >= existingEnd);
    if (!timeOverlap) return false;

    // Check if date/dayOfWeek applies
    if (date && existing.recurrence === 'none' && existing.date) {
      const existingDate = new Date(existing.date);
      existingDate.setHours(0, 0, 0, 0);
      const newDate = new Date(date);
      newDate.setHours(0, 0, 0, 0);
      return existingDate.getTime() === newDate.getTime();
    }

    if (dayOfWeek !== undefined && existing.dayOfWeek !== undefined) {
      return existing.dayOfWeek === dayOfWeek;
    }

    // If one is one-time and the other is recurring, assume no conflict for simplicity
    return false;
  });
}

/**
 * Check if a schedule falls within a date range
 */
export function isScheduleInDateRange(
  schedule: IStaffSchedule,
  dateFrom: Date,
  dateTo: Date,
): boolean {
  const dateFromStart = new Date(dateFrom);
  dateFromStart.setHours(0, 0, 0, 0);
  const dateToEnd = new Date(dateTo);
  dateToEnd.setHours(23, 59, 59, 999);

  if (schedule.recurrence === 'none' && schedule.date) {
    const scheduleDate = new Date(schedule.date);
    scheduleDate.setHours(0, 0, 0, 0);
    return scheduleDate >= dateFromStart && scheduleDate <= dateToEnd;
  }

  if (schedule.dayOfWeek !== undefined) {
    const startCheck = schedule.createdAt || new Date(0);
    const endCheck = schedule.recurrenceEndDate || new Date(8640000000000000);
    const checkStart = new Date(Math.max(startCheck.getTime(), dateFromStart.getTime()));
    const checkEnd = new Date(Math.min(endCheck.getTime(), dateToEnd.getTime()));
    
    // Check if any day in the range matches the dayOfWeek
    for (let d = new Date(checkStart); d <= checkEnd; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === schedule.dayOfWeek) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a staff member is available at a specific time
 */
export async function isStaffAvailable(
  userId: string,
  clinicId: string,
  dateTime: Date,
  durationMinutes: number = 30,
): Promise<boolean> {
  const date = new Date(dateTime);
  const dayOfWeek = date.getDay();
  const startTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const endDate = new Date(date.getTime() + durationMinutes * 60000);
  const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  const schedules = await StaffScheduleModel.find({
    userId: new Types.ObjectId(userId),
    clinicId: new Types.ObjectId(clinicId),
  }).lean();

  let isAvailable = true;
  let hasSchedule = false;

  for (const schedule of schedules) {
    let appliesToDate = false;

    if (schedule.recurrence === 'none' && schedule.date) {
      const scheduleDate = new Date(schedule.date);
      scheduleDate.setHours(0, 0, 0, 0);
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);
      appliesToDate = scheduleDate.getTime() === checkDate.getTime();
    } else if (schedule.dayOfWeek !== undefined) {
      const startCheck = schedule.createdAt || new Date(0);
      const endCheck = schedule.recurrenceEndDate || new Date(8640000000000000);
      if (date >= startCheck && date <= endCheck) {
        appliesToDate = schedule.dayOfWeek === dayOfWeek;
      }
    }

    if (appliesToDate) {
      hasSchedule = true;
      const schedStart = timeToMinutes(schedule.startTime);
      const schedEnd = timeToMinutes(schedule.endTime);
      
      if (startMinutes >= schedStart && endMinutes <= schedEnd) {
        isAvailable = schedule.isAvailable;
      } else {
        // Partial overlap - check if it's outside
        if (!schedule.isAvailable) {
          isAvailable = false;
        }
      }
    }
  }

  // If no schedules, assume default availability (9-5)
  if (!hasSchedule) {
    const defaultStart = 9 * 60; // 09:00
    const defaultEnd = 17 * 60; // 17:00
    return startMinutes >= defaultStart && endMinutes <= defaultEnd;
  }

  return isAvailable;
}
