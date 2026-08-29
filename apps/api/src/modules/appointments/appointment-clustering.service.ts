import { Types } from 'mongoose';
import { AppointmentModel } from './appointment.model';

export interface AppointmentSlot {
  scheduledAt: Date;
  durationMinutes: number;
  endAt: Date;
}

export interface AppointmentCluster {
  clusterId: string;
  doctorId: string;
  date: string;        // YYYY-MM-DD
  startAt: Date;
  endAt: Date;
  totalDurationMinutes: number;
  appointmentCount: number;
  appointments: Array<{
    id: string;
    scheduledAt: Date;
    durationMinutes: number;
    type: string;
    status: string;
  }>;
  gapMinutes: number;   // idle time within the cluster window
  utilizationRate: number; // booked / total cluster window (0–100)
}

export interface ClusteringStats {
  doctorId: string;
  date: string;
  clusters: AppointmentCluster[];
  totalAppointments: number;
  totalBookedMinutes: number;
  totalClusterWindowMinutes: number;
  overallUtilization: number;
}

const CLUSTER_GAP_THRESHOLD_MINUTES = 30; // gaps ≤ this value belong to the same cluster

/**
 * Identify appointment clusters for a doctor on a given date.
 *
 * Two appointments belong to the same cluster when the gap between the end of
 * one and the start of the next is ≤ CLUSTER_GAP_THRESHOLD_MINUTES.
 *
 * This helps the scheduler identify "busy windows" vs. isolated slots and
 * suggests contiguous scheduling to reduce doctor idle time.
 */
export async function clusterAppointmentsForDoctor(
  doctorId: string,
  clinicId: string,
  date: Date,
): Promise<ClusteringStats> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const appointments = await AppointmentModel.find({
    doctorId: new Types.ObjectId(doctorId),
    clinicId: new Types.ObjectId(clinicId),
    status: { $in: ['scheduled', 'confirmed', 'completed', 'patient_arrived'] },
    scheduledAt: { $gte: dayStart, $lte: dayEnd },
  })
    .select('_id scheduledAt duration type status')
    .sort({ scheduledAt: 1 })
    .lean();

  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  if (appointments.length === 0) {
    return {
      doctorId,
      date: dateStr,
      clusters: [],
      totalAppointments: 0,
      totalBookedMinutes: 0,
      totalClusterWindowMinutes: 0,
      overallUtilization: 0,
    };
  }

  // Build slots with computed end times
  const slots: Array<{
    id: string;
    scheduledAt: Date;
    durationMinutes: number;
    endAt: Date;
    type: string;
    status: string;
  }> = appointments.map((appt) => ({
    id: String(appt._id),
    scheduledAt: new Date(appt.scheduledAt),
    durationMinutes: appt.duration,
    endAt: new Date(new Date(appt.scheduledAt).getTime() + appt.duration * 60_000),
    type: appt.type,
    status: appt.status,
  }));

  // ── Greedy clustering ─────────────────────────────────────────────────────
  const clusters: AppointmentCluster[] = [];
  let clusterIndex = 0;

  let currentClusterSlots = [slots[0]];
  let currentClusterEnd = slots[0].endAt;

  for (let i = 1; i < slots.length; i++) {
    const slot = slots[i];
    const gapMinutes =
      (slot.scheduledAt.getTime() - currentClusterEnd.getTime()) / 60_000;

    if (gapMinutes <= CLUSTER_GAP_THRESHOLD_MINUTES) {
      // Same cluster — extend end if necessary
      currentClusterSlots.push(slot);
      if (slot.endAt > currentClusterEnd) currentClusterEnd = slot.endAt;
    } else {
      // Flush current cluster
      clusters.push(buildCluster(clusterIndex++, doctorId, dateStr, currentClusterSlots));
      currentClusterSlots = [slot];
      currentClusterEnd = slot.endAt;
    }
  }

  // Flush final cluster
  clusters.push(buildCluster(clusterIndex, doctorId, dateStr, currentClusterSlots));

  const totalBookedMinutes = slots.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalClusterWindowMinutes = clusters.reduce(
    (sum, c) => sum + Math.round((c.endAt.getTime() - c.startAt.getTime()) / 60_000),
    0,
  );
  const overallUtilization =
    totalClusterWindowMinutes > 0
      ? Math.round((totalBookedMinutes / totalClusterWindowMinutes) * 10000) / 100
      : 0;

  return {
    doctorId,
    date: dateStr,
    clusters,
    totalAppointments: appointments.length,
    totalBookedMinutes,
    totalClusterWindowMinutes,
    overallUtilization,
  };
}

/**
 * Build an AppointmentCluster from an ordered array of slots.
 */
function buildCluster(
  index: number,
  doctorId: string,
  date: string,
  slots: Array<{
    id: string;
    scheduledAt: Date;
    durationMinutes: number;
    endAt: Date;
    type: string;
    status: string;
  }>,
): AppointmentCluster {
  const startAt = slots[0].scheduledAt;
  const endAt = slots.reduce<Date>((latest, s) => (s.endAt > latest ? s.endAt : latest), slots[0].endAt);
  const windowMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60_000);
  const bookedMinutes = slots.reduce((sum, s) => sum + s.durationMinutes, 0);
  const gapMinutes = Math.max(0, windowMinutes - bookedMinutes);

  return {
    clusterId: `${doctorId}-${date}-${index}`,
    doctorId,
    date,
    startAt,
    endAt,
    totalDurationMinutes: bookedMinutes,
    appointmentCount: slots.length,
    appointments: slots.map((s) => ({
      id: s.id,
      scheduledAt: s.scheduledAt,
      durationMinutes: s.durationMinutes,
      type: s.type,
      status: s.status,
    })),
    gapMinutes,
    utilizationRate:
      windowMinutes > 0
        ? Math.round((bookedMinutes / windowMinutes) * 10000) / 100
        : 100,
  };
}

/**
 * Suggest the best time slot for a new appointment by finding the smallest
 * contiguous gap within an existing cluster (avoids fragmenting the schedule)
 * or proposing a slot adjacent to the last cluster of the day.
 *
 * Returns null when no suitable slot is found within clinic hours.
 */
export async function suggestOptimalSlot(
  doctorId: string,
  clinicId: string,
  date: Date,
  durationMinutes: number,
  clinicOpenHour = 8,
  clinicCloseHour = 17,
): Promise<Date | null> {
  const stats = await clusterAppointmentsForDoctor(doctorId, clinicId, date);

  const dayStart = new Date(date);
  dayStart.setHours(clinicOpenHour, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(clinicCloseHour, 0, 0, 0);

  // Collect busy intervals (start → end) across all clusters
  const busyIntervals: Array<{ start: Date; end: Date }> = [];
  for (const cluster of stats.clusters) {
    for (const appt of cluster.appointments) {
      const end = new Date(new Date(appt.scheduledAt).getTime() + appt.durationMinutes * 60_000);
      busyIntervals.push({ start: new Date(appt.scheduledAt), end });
    }
  }
  busyIntervals.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Walk through clinic hours in 5-minute increments to find the first free slot
  const stepMs = 5 * 60_000;
  const requiredMs = durationMinutes * 60_000;

  let candidate = new Date(dayStart);
  while (candidate.getTime() + requiredMs <= dayEnd.getTime()) {
    const candidateEnd = new Date(candidate.getTime() + requiredMs);
    const overlaps = busyIntervals.some(
      (interval) => candidate < interval.end && candidateEnd > interval.start,
    );
    if (!overlaps) return candidate;
    candidate = new Date(candidate.getTime() + stepMs);
  }

  return null; // No slot available
}
