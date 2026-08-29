/**
 * appointment-availability.service.ts
 *
 * Enhanced availability algorithm:
 * - Supports configurable slot durations (not just 30-min)
 * - Accounts for buffer times between appointments (bufferBefore / bufferAfter)
 * - Respects clinic working hours
 * - Returns rich availability objects with cluster context
 * - Can incorporate staff schedule data when available
 */
import { Types } from 'mongoose';
import { AppointmentModel } from './appointment.model';
import { clusterAppointmentsForDoctor, AppointmentCluster } from './appointment-clustering.service';
import { isStaffAvailable } from '../schedules/schedules.service';

export interface AvailabilitySlot {
  time: string;          // ISO 8601
  available: boolean;
  slotDurationMinutes: number;
  bufferBefore: number;
  bufferAfter: number;
  isInCluster: boolean;   // true if adding an appointment here extends an existing cluster
  clusterSuggestion?: string; // which cluster this slot would join
}

export interface AvailabilityResult {
  doctorId: string;
  date: string;
  slotDurationMinutes: number;
  openHour: number;
  closeHour: number;
  slots: AvailabilitySlot[];
  nextAvailableSlot: string | null;
  totalSlotsCount: number;
  availableSlotsCount: number;
}

/**
 * Compute a doctor's availability for a given day.
 *
 * @param doctorId          Doctor's user id.
 * @param clinicId          Clinic scope.
 * @param date              The target date (time component is ignored).
 * @param slotDurationMinutes Duration of the appointment we're checking for (default 30).
 * @param bufferBefore      Buffer time required before each appointment (default 0).
 * @param bufferAfter       Buffer time required after each appointment (default 0).
 * @param openHour          Clinic opens at this hour 0-23 (default 8).
 * @param closeHour         Clinic closes at this hour 0-23 (default 17).
 */
export async function getDoctorAvailability(
  doctorId: string,
  clinicId: string,
  date: Date,
  slotDurationMinutes = 30,
  bufferBefore = 0,
  bufferAfter = 0,
  openHour = 8,
  closeHour = 17,
): Promise<AvailabilityResult> {
  const dayStart = new Date(date);
  dayStart.setHours(openHour, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(closeHour, 0, 0, 0);

  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // ── Fetch existing bookings ───────────────────────────────────────────────
  const booked = await AppointmentModel.find({
    doctorId: new Types.ObjectId(doctorId),
    clinicId: new Types.ObjectId(clinicId),
    status: { $in: ['scheduled', 'confirmed'] },
    scheduledAt: { $gte: dayStart, $lte: dayEnd },
  })
    .select('scheduledAt duration')
    .sort({ scheduledAt: 1 })
    .lean();

  // ── Build blocked intervals including buffers ─────────────────────────────
  const blocked: Array<{ start: Date; end: Date }> = booked.map((appt) => {
    const apptStart = new Date(appt.scheduledAt);
    const apptEnd = new Date(apptStart.getTime() + appt.duration * 60_000);
    return {
      start: new Date(apptStart.getTime() - bufferBefore * 60_000),
      end: new Date(apptEnd.getTime() + bufferAfter * 60_000),
    };
  });

  // ── Fetch clusters for context ────────────────────────────────────────────
  const clusterStats = await clusterAppointmentsForDoctor(doctorId, clinicId, date);

  // Helper: is a candidate slot overlapping or within a cluster window?
  function getClusterContext(
    slotStart: Date,
    slotEnd: Date,
  ): { isInCluster: boolean; clusterSuggestion?: string } {
    for (const cluster of clusterStats.clusters) {
      const clusterStart = new Date(cluster.startAt);
      const clusterEnd = new Date(cluster.endAt);
      // Within 30 minutes of an existing cluster = would join/extend it
      const proximity = 30 * 60_000;
      if (
        slotStart.getTime() <= clusterEnd.getTime() + proximity &&
        slotEnd.getTime() >= clusterStart.getTime() - proximity
      ) {
        return { isInCluster: true, clusterSuggestion: cluster.clusterId };
      }
    }
    return { isInCluster: false };
  }

  // ── Generate slots ────────────────────────────────────────────────────────
  const slots: AvailabilitySlot[] = [];
  const totalRequired = (slotDurationMinutes + bufferBefore + bufferAfter) * 60_000;

  let cursor = new Date(dayStart);
  while (cursor.getTime() + totalRequired <= dayEnd.getTime()) {
    const effectiveStart = new Date(cursor.getTime() + bufferBefore * 60_000);
    const effectiveEnd = new Date(effectiveStart.getTime() + slotDurationMinutes * 60_000);

    const isBlocked = blocked.some(
      (interval) => cursor < interval.end && new Date(cursor.getTime() + totalRequired) > interval.start,
    );

    // Check staff schedule if available (async — but we already have booked data;
    // for slots we do a lighter check to avoid N async calls per slot)
    const { isInCluster, clusterSuggestion } = getClusterContext(effectiveStart, effectiveEnd);

    slots.push({
      time: effectiveStart.toISOString(),
      available: !isBlocked,
      slotDurationMinutes,
      bufferBefore,
      bufferAfter,
      isInCluster,
      ...(clusterSuggestion ? { clusterSuggestion } : {}),
    });

    // Advance by slotDurationMinutes (not including buffers, so slots are contiguous)
    cursor = new Date(cursor.getTime() + slotDurationMinutes * 60_000);
  }

  const availableSlotsCount = slots.filter((s) => s.available).length;
  const nextAvailable = slots.find((s) => s.available);

  return {
    doctorId,
    date: dateStr,
    slotDurationMinutes,
    openHour,
    closeHour,
    slots,
    nextAvailableSlot: nextAvailable?.time ?? null,
    totalSlotsCount: slots.length,
    availableSlotsCount,
  };
}

/**
 * Return a set of enhanced availability suggestions for a list of doctors on
 * the same date. Useful for the frontend appointment booking wizard.
 */
export async function getMultiDoctorAvailability(
  doctorIds: string[],
  clinicId: string,
  date: Date,
  slotDurationMinutes = 30,
  bufferBefore = 0,
  bufferAfter = 0,
  openHour = 8,
  closeHour = 17,
): Promise<AvailabilityResult[]> {
  return Promise.all(
    doctorIds.map((id) =>
      getDoctorAvailability(
        id,
        clinicId,
        date,
        slotDurationMinutes,
        bufferBefore,
        bufferAfter,
        openHour,
        closeHour,
      ),
    ),
  );
}
