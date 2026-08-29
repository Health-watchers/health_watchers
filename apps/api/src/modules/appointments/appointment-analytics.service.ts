import { Types } from 'mongoose';
import { AppointmentModel } from './appointment.model';

export interface AppointmentAnalyticsSummary {
  totalAppointments: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  noShowRate: number;
  cancellationRate: number;
  completionRate: number;
  avgDurationMinutes: number;
  telemedicineCount: number;
  telemedicineRate: number;
}

export interface DailyStats {
  date: string;
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

export interface DoctorStats {
  doctorId: string;
  total: number;
  completed: number;
  noShow: number;
  noShowRate: number;
  avgDurationMinutes: number;
}

export interface AppointmentAnalyticsResult {
  summary: AppointmentAnalyticsSummary;
  dailyBreakdown: DailyStats[];
  byDoctor: DoctorStats[];
  periodDays: number;
}

/**
 * Compute appointment analytics for a clinic over a date range.
 */
export async function getAppointmentAnalytics(
  clinicId: string,
  dateFrom: Date,
  dateTo: Date,
  doctorId?: string,
): Promise<AppointmentAnalyticsResult> {
  const matchStage: Record<string, unknown> = {
    clinicId: new Types.ObjectId(clinicId),
    scheduledAt: { $gte: dateFrom, $lte: dateTo },
  };
  if (doctorId) {
    matchStage.doctorId = new Types.ObjectId(doctorId);
  }

  // ── Aggregate by status ───────────────────────────────────────────────────
  const statusAgg = await AppointmentModel.aggregate([
    { $match: matchStage },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus: Record<string, number> = {};
  let totalAppointments = 0;
  for (const s of statusAgg) {
    byStatus[s._id as string] = s.count as number;
    totalAppointments += s.count as number;
  }

  // ── Aggregate by type ─────────────────────────────────────────────────────
  const typeAgg = await AppointmentModel.aggregate([
    { $match: matchStage },
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ]);

  const byType: Record<string, number> = {};
  for (const t of typeAgg) {
    byType[t._id as string] = t.count as number;
  }

  // ── Compute rates ─────────────────────────────────────────────────────────
  const noShowCount = byStatus['no-show'] ?? 0;
  const cancelledCount = byStatus['cancelled'] ?? 0;
  const completedCount = byStatus['completed'] ?? 0;

  const noShowRate = totalAppointments > 0 ? (noShowCount / totalAppointments) * 100 : 0;
  const cancellationRate =
    totalAppointments > 0 ? (cancelledCount / totalAppointments) * 100 : 0;
  const completionRate =
    totalAppointments > 0 ? (completedCount / totalAppointments) * 100 : 0;

  // ── Average duration ──────────────────────────────────────────────────────
  const durationAgg = await AppointmentModel.aggregate([
    { $match: { ...matchStage, status: 'completed' } },
    { $group: { _id: null, avgDuration: { $avg: '$duration' } } },
  ]);
  const avgDurationMinutes: number =
    durationAgg.length > 0 ? Math.round((durationAgg[0].avgDuration as number) ?? 0) : 0;

  // ── Telemedicine count ────────────────────────────────────────────────────
  const telemedicineCount: number = await AppointmentModel.countDocuments({
    ...matchStage,
    isTelemedicine: true,
  });
  const telemedicineRate =
    totalAppointments > 0 ? (telemedicineCount / totalAppointments) * 100 : 0;

  // ── Daily breakdown ───────────────────────────────────────────────────────
  const dailyAgg = await AppointmentModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $year: '$scheduledAt' },
          month: { $month: '$scheduledAt' },
          day: { $dayOfMonth: '$scheduledAt' },
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
  ]);

  // Build a map of date → status counts
  const dailyMap: Record<string, { total: number; completed: number; cancelled: number; noShow: number }> =
    {};
  for (const d of dailyAgg) {
    const { year, month, day, status } = d._id as {
      year: number;
      month: number;
      day: number;
      status: string;
    };
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { total: 0, completed: 0, cancelled: 0, noShow: 0 };
    }
    dailyMap[dateKey].total += d.count as number;
    if (status === 'completed') dailyMap[dateKey].completed += d.count as number;
    if (status === 'cancelled') dailyMap[dateKey].cancelled += d.count as number;
    if (status === 'no-show') dailyMap[dateKey].noShow += d.count as number;
  }

  const dailyBreakdown: DailyStats[] = Object.entries(dailyMap).map(([date, counts]) => ({
    date,
    ...counts,
  }));

  // ── Per-doctor stats ──────────────────────────────────────────────────────
  const doctorAgg = await AppointmentModel.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { doctorId: '$doctorId', status: '$status' },
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
      },
    },
  ]);

  const doctorMap: Record<
    string,
    { total: number; completed: number; noShow: number; durationSum: number; durationCount: number }
  > = {};
  for (const d of doctorAgg) {
    const key = String((d._id as { doctorId: Types.ObjectId }).doctorId);
    const status = (d._id as { status: string }).status;
    if (!doctorMap[key]) {
      doctorMap[key] = { total: 0, completed: 0, noShow: 0, durationSum: 0, durationCount: 0 };
    }
    doctorMap[key].total += d.count as number;
    if (status === 'completed') {
      doctorMap[key].completed += d.count as number;
      doctorMap[key].durationSum += ((d.avgDuration as number) ?? 0) * (d.count as number);
      doctorMap[key].durationCount += d.count as number;
    }
    if (status === 'no-show') doctorMap[key].noShow += d.count as number;
  }

  const byDoctor: DoctorStats[] = Object.entries(doctorMap).map(([docId, stats]) => ({
    doctorId: docId,
    total: stats.total,
    completed: stats.completed,
    noShow: stats.noShow,
    noShowRate: stats.total > 0 ? Math.round((stats.noShow / stats.total) * 10000) / 100 : 0,
    avgDurationMinutes:
      stats.durationCount > 0
        ? Math.round(stats.durationSum / stats.durationCount)
        : 0,
  }));

  const periodDays = Math.max(
    1,
    Math.round((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)),
  );

  return {
    summary: {
      totalAppointments,
      byStatus,
      byType,
      noShowRate: Math.round(noShowRate * 100) / 100,
      cancellationRate: Math.round(cancellationRate * 100) / 100,
      completionRate: Math.round(completionRate * 100) / 100,
      avgDurationMinutes,
      telemedicineCount,
      telemedicineRate: Math.round(telemedicineRate * 100) / 100,
    },
    dailyBreakdown,
    byDoctor,
    periodDays,
  };
}
