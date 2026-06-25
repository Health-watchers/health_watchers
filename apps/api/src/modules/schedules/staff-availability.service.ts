import { ScheduleModel } from './models/schedule.model';
import { CreateStaffScheduleInput, StaffAvailabilityQuery } from './schedules.validation';

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;

function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && endA > startB;
}

export async function findConflictingStaffSchedule(input: CreateStaffScheduleInput, clinicId: string) {
  const date = new Date(input.date);
  const { start, end } = dayBounds(date);
  const schedules = await ScheduleModel.find({
    userId: input.userId,
    clinicId,
    date: { $gte: start, $lte: end },
    status: { $ne: 'cancelled' },
  }).lean();

  return schedules.find((schedule) =>
    overlaps(input.shiftStart, input.shiftEnd, schedule.shiftStart, schedule.shiftEnd)
  );
}

export async function createStaffSchedule(input: CreateStaffScheduleInput, clinicId: string, createdBy: string) {
  const conflict = await findConflictingStaffSchedule(input, clinicId);
  if (conflict) return { conflict };

  const schedule = new ScheduleModel({
    ...input,
    clinicId,
    date: new Date(input.date),
    createdBy,
  });
  await schedule.save();
  return { schedule };
}

export function findStaffAvailability(query: StaffAvailabilityQuery, callerClinicId: string) {
  const filter: Record<string, unknown> = {
    clinicId: query.clinicId ?? callerClinicId,
    isAvailable: true,
    status: { $ne: 'cancelled' },
  };
  if (query.userId) filter.userId = query.userId;
  if (query.date) {
    const { start, end } = dayBounds(new Date(query.date));
    filter.date = { $gte: start, $lte: end };
  }
  return ScheduleModel.find(filter).sort({ date: 1, shiftStart: 1 }).lean();
}

export async function isStaffAvailable(userId: string, clinicId: string, date: Date): Promise<boolean> {
  const { start, end } = dayBounds(date);
  const schedule = await ScheduleModel.findOne({
    userId,
    clinicId,
    date: { $gte: start, $lte: end },
    isAvailable: true,
    status: { $ne: 'cancelled' },
  }).lean();

  if (schedule) return true;

  const recurringDay = DAYS[date.getDay()];
  const recurring = await ScheduleModel.findOne({
    userId,
    clinicId,
    isRecurring: true,
    recurringDay,
    isAvailable: true,
    status: { $ne: 'cancelled' },
  }).lean();

  return Boolean(recurring);
}
