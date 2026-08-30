/**
 * Provider scheduling — reports & analytics
 * Issue #1248
 */
import { Types } from 'mongoose';
import { AppointmentModel } from '../appointments/appointment.model';
import { ProviderAvailabilityModel } from './models/provider-availability.model';
import { resolveDayBlocks, toMinutes } from './slotting';

const oid = (v: string): Types.ObjectId => new Types.ObjectId(v);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Sum of working minutes a provider's availability offers between two dates. */
function availableMinutes(
  weeklyHours: Parameters<typeof resolveDayBlocks>[1],
  overrides: Parameters<typeof resolveDayBlocks>[2],
  from: Date,
  to: Date
): number {
  let total = 0;
  const startDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let t = startDay.getTime(); t < to.getTime(); t += DAY_MS) {
    for (const b of resolveDayBlocks(new Date(t), weeklyHours, overrides)) {
      total += Math.max(0, toMinutes(b.end) - toMinutes(b.start));
    }
  }
  return total;
}

export interface ProviderUtilization {
  providerId: string;
  appointments: number;
  noShows: number;
  cancellations: number;
  bookedMinutes: number;
  availableMinutes: number;
  utilization: number; // 0..1
  noShowRate: number; // 0..1
}

export async function providerUtilization(
  clinicId: string,
  from: Date,
  to: Date
): Promise<ProviderUtilization[]> {
  const availabilities = await ProviderAvailabilityModel.find({
    clinicId: oid(clinicId),
    isActive: true,
  }).lean();

  const rows = await AppointmentModel.aggregate<{
    _id: Types.ObjectId;
    appointments: number;
    noShows: number;
    cancellations: number;
    bookedMinutes: number;
  }>([
    {
      $match: {
        clinicId: oid(clinicId),
        scheduledAt: { $gte: from, $lt: to },
      },
    },
    {
      $group: {
        _id: '$doctorId',
        appointments: {
          $sum: {
            $cond: [{ $in: ['$status', ['completed', 'confirmed', 'patient_arrived']] }, 1, 0],
          },
        },
        noShows: { $sum: { $cond: [{ $eq: ['$status', 'no-show'] }, 1, 0] } },
        cancellations: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        bookedMinutes: {
          $sum: {
            $cond: [{ $eq: ['$status', 'cancelled'] }, 0, { $ifNull: ['$duration', 30] }],
          },
        },
      },
    },
  ]);

  const byProvider = new Map(rows.map((r) => [String(r._id), r]));
  const out: ProviderUtilization[] = [];

  for (const av of availabilities) {
    const key = String(av.providerId);
    const stat = byProvider.get(key);
    const avail = availableMinutes(av.weeklyHours, av.overrides, from, to);
    const booked = stat?.bookedMinutes ?? 0;
    const appts = stat?.appointments ?? 0;
    const noShows = stat?.noShows ?? 0;
    out.push({
      providerId: key,
      appointments: appts,
      noShows,
      cancellations: stat?.cancellations ?? 0,
      bookedMinutes: booked,
      availableMinutes: avail,
      utilization: avail > 0 ? Math.min(1, booked / avail) : 0,
      noShowRate: appts + noShows > 0 ? noShows / (appts + noShows) : 0,
    });
    byProvider.delete(key);
  }

  // Providers with appointments but no availability doc still get a row.
  for (const [key, stat] of byProvider) {
    out.push({
      providerId: key,
      appointments: stat.appointments,
      noShows: stat.noShows,
      cancellations: stat.cancellations,
      bookedMinutes: stat.bookedMinutes,
      availableMinutes: 0,
      utilization: 0,
      noShowRate:
        stat.appointments + stat.noShows > 0
          ? stat.noShows / (stat.appointments + stat.noShows)
          : 0,
    });
  }

  return out;
}

export interface WaitTimeReport {
  totalAppointments: number;
  avgLeadTimeDays: number; // scheduledAt - createdAt
  medianLeadTimeDays: number;
  sameDayCount: number;
}

export async function waitTimeReport(
  clinicId: string,
  from: Date,
  to: Date
): Promise<WaitTimeReport> {
  const appts = await AppointmentModel.find({
    clinicId: oid(clinicId),
    scheduledAt: { $gte: from, $lt: to },
    status: { $ne: 'cancelled' },
  })
    .select('scheduledAt createdAt')
    .lean();

  if (appts.length === 0) {
    return { totalAppointments: 0, avgLeadTimeDays: 0, medianLeadTimeDays: 0, sameDayCount: 0 };
  }

  const leads = appts
    .map((a) => {
      const created = (a as { createdAt?: Date }).createdAt ?? a.scheduledAt;
      return (new Date(a.scheduledAt).getTime() - new Date(created).getTime()) / DAY_MS;
    })
    .map((d) => Math.max(0, d))
    .sort((x, y) => x - y);

  const sum = leads.reduce((s, d) => s + d, 0);
  const mid = Math.floor(leads.length / 2);
  const hi = leads.slice(mid, mid + 1)[0] ?? 0;
  const lo = leads.slice(mid - 1, mid)[0] ?? hi;
  const median = leads.length % 2 === 0 ? (lo + hi) / 2 : hi;

  return {
    totalAppointments: appts.length,
    avgLeadTimeDays: Math.round((sum / leads.length) * 10) / 10,
    medianLeadTimeDays: Math.round(median * 10) / 10,
    sameDayCount: leads.filter((d) => d < 1).length,
  };
}
