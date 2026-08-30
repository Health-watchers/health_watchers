/**
 * Provider scheduling system — service layer
 * Issue #1248
 *
 * Ties the availability / time-off / rotation / on-call models to the pure slot
 * maths in ./slotting and the optimizer in ./schedule-optimizer.
 */
import { Types } from 'mongoose';
import { AppointmentModel } from '../appointments/appointment.model';
import { ProviderAvailabilityModel } from './models/provider-availability.model';
import { ScheduleTemplateModel } from './models/schedule-template.model';
import { ShiftRotationModel } from './models/shift-rotation.model';
import { TimeOffModel } from './models/time-off.model';
import { OnCallScheduleModel } from './models/on-call-schedule.model';
import { generateFreeSlots, overlaps, type Interval, type Slot } from './slotting';

const oid = (v: string | Types.ObjectId): Types.ObjectId => new Types.ObjectId(v);

const ACTIVE_APPT_STATUSES = ['scheduled', 'confirmed', 'patient_arrived'];

// ── Availability ────────────────────────────────────────────────────────────

export async function upsertAvailability(input: {
  providerId: string;
  clinicId: string;
  timezone?: string;
  weeklyHours?: unknown;
  slotDurationMinutes?: number;
  bufferMinutes?: number;
  maxDailyAppointments?: number;
  overrides?: unknown;
  isActive?: boolean;
  updatedBy: string;
}): Promise<Record<string, unknown> | null> {
  const { providerId, clinicId, updatedBy, ...rest } = input;
  const doc = await ProviderAvailabilityModel.findOneAndUpdate(
    { providerId: oid(providerId), clinicId: oid(clinicId) },
    { $set: { ...rest, updatedBy: oid(updatedBy) } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  return doc as Record<string, unknown> | null;
}

export async function getAvailability(
  providerId: string,
  clinicId: string
): Promise<Record<string, unknown> | null> {
  const doc = await ProviderAvailabilityModel.findOne({
    providerId: oid(providerId),
    clinicId: oid(clinicId),
  }).lean();
  return doc as Record<string, unknown> | null;
}

// ── Busy intervals (appointments + approved time-off) ───────────────────────

export async function getBusyIntervals(
  providerId: string,
  clinicId: string,
  from: Date,
  to: Date
): Promise<Interval[]> {
  const [appts, timeOff] = await Promise.all([
    AppointmentModel.find({
      doctorId: oid(providerId),
      clinicId: oid(clinicId),
      status: { $in: ACTIVE_APPT_STATUSES },
      scheduledAt: { $lt: to },
    })
      .select('scheduledAt duration')
      .lean(),
    TimeOffModel.find({
      providerId: oid(providerId),
      clinicId: oid(clinicId),
      status: 'approved',
      start: { $lt: to },
      end: { $gt: from },
    })
      .select('start end')
      .lean(),
  ]);

  const apptIntervals: Interval[] = appts
    .map((a) => {
      const start = new Date(a.scheduledAt);
      const end = new Date(start.getTime() + (a.duration ?? 30) * 60_000);
      return { start, end };
    })
    .filter((iv) => iv.end > from);

  const offIntervals: Interval[] = timeOff.map((t) => ({
    start: new Date(t.start),
    end: new Date(t.end),
  }));

  return [...apptIntervals, ...offIntervals];
}

// ── Slot generation ────────────────────────────────────────────────────────

export async function generateSlots(params: {
  providerId: string;
  clinicId: string;
  from: Date;
  to: Date;
}): Promise<{ slots: Slot[]; availabilityFound: boolean }> {
  const availability = await ProviderAvailabilityModel.findOne({
    providerId: oid(params.providerId),
    clinicId: oid(params.clinicId),
    isActive: true,
  }).lean();

  if (!availability) return { slots: [], availabilityFound: false };

  const busy = await getBusyIntervals(params.providerId, params.clinicId, params.from, params.to);

  const slots = generateFreeSlots({
    from: params.from,
    to: params.to,
    weeklyHours: availability.weeklyHours,
    overrides: availability.overrides,
    slotMinutes: availability.slotDurationMinutes,
    bufferMinutes: availability.bufferMinutes,
    maxPerDay: availability.maxDailyAppointments,
    busy,
  });

  return { slots, availabilityFound: true };
}

// ── Conflict detection ─────────────────────────────────────────────────────

export interface ScheduleConflict {
  kind: 'appointment' | 'time_off';
  start: Date;
  end: Date;
  ref?: string;
}

export async function detectConflicts(params: {
  providerId: string;
  clinicId: string;
  start: Date;
  end: Date;
  excludeAppointmentId?: string;
}): Promise<ScheduleConflict[]> {
  const target: Interval = { start: params.start, end: params.end };

  const apptQuery: Record<string, unknown> = {
    doctorId: oid(params.providerId),
    clinicId: oid(params.clinicId),
    status: { $in: ACTIVE_APPT_STATUSES },
    scheduledAt: { $lt: params.end },
  };
  if (params.excludeAppointmentId) {
    apptQuery._id = { $ne: oid(params.excludeAppointmentId) };
  }

  const [appts, timeOff] = await Promise.all([
    AppointmentModel.find(apptQuery).select('scheduledAt duration').lean(),
    TimeOffModel.find({
      providerId: oid(params.providerId),
      clinicId: oid(params.clinicId),
      status: 'approved',
      start: { $lt: params.end },
      end: { $gt: params.start },
    })
      .select('start end')
      .lean(),
  ]);

  const conflicts: ScheduleConflict[] = [];

  for (const a of appts) {
    const start = new Date(a.scheduledAt);
    const end = new Date(start.getTime() + (a.duration ?? 30) * 60_000);
    if (overlaps(target, { start, end })) {
      conflicts.push({ kind: 'appointment', start, end, ref: String((a as { _id: unknown })._id) });
    }
  }
  for (const t of timeOff) {
    conflicts.push({
      kind: 'time_off',
      start: new Date(t.start),
      end: new Date(t.end),
      ref: String((t as { _id: unknown })._id),
    });
  }

  return conflicts;
}

/** Throws if the window is not free — call before creating an appointment. */
export async function assertSlotFree(params: {
  providerId: string;
  clinicId: string;
  start: Date;
  end: Date;
  excludeAppointmentId?: string;
}): Promise<void> {
  const conflicts = await detectConflicts(params);
  if (conflicts.length > 0) {
    const err = new Error('SlotUnavailable') as Error & {
      code: string;
      conflicts: ScheduleConflict[];
    };
    err.code = 'SLOT_UNAVAILABLE';
    err.conflicts = conflicts;
    throw err;
  }
}

// ── Templates ──────────────────────────────────────────────────────────────

export async function applyTemplateToProviders(
  templateId: string,
  clinicId: string,
  providerIds: string[],
  updatedBy: string
): Promise<Array<Record<string, unknown> | null>> {
  const template = await ScheduleTemplateModel.findOne({
    _id: oid(templateId),
    clinicId: oid(clinicId),
  }).lean();
  if (!template) {
    const err = new Error('TemplateNotFound') as Error & { code: string };
    err.code = 'TEMPLATE_NOT_FOUND';
    throw err;
  }

  const results = [];
  for (const providerId of providerIds) {
    const doc = await upsertAvailability({
      providerId,
      clinicId,
      weeklyHours: template.weeklyHours,
      slotDurationMinutes: template.slotDurationMinutes,
      bufferMinutes: template.bufferMinutes,
      updatedBy,
    });
    results.push(doc);
  }
  return results;
}

// ── Shift rotation ─────────────────────────────────────────────────────────

export async function providerOnRotationDate(
  rotationId: string,
  date: Date
): Promise<{
  rotationId: string;
  date: Date;
  cycleDayOffset?: number;
  assignments: Array<{ providerId: string; role: string }>;
} | null> {
  const rotation = await ShiftRotationModel.findById(oid(rotationId)).lean();
  if (!rotation) return null;

  const dayMs = 24 * 60 * 60 * 1000;
  const daysSinceStart = Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(
        rotation.startDate.getUTCFullYear(),
        rotation.startDate.getUTCMonth(),
        rotation.startDate.getUTCDate()
      )) /
      dayMs
  );
  if (daysSinceStart < 0) return { rotationId, date, assignments: [] };

  const offset =
    ((daysSinceStart % rotation.cycleLengthDays) + rotation.cycleLengthDays) %
    rotation.cycleLengthDays;

  const assignments = rotation.pattern
    .filter((p) => p.dayOffset === offset)
    .map((p) => ({ providerId: String(p.providerId), role: p.role }));

  return { rotationId, date, cycleDayOffset: offset, assignments };
}

// ── On-call ────────────────────────────────────────────────────────────────

export async function onCallForInstant(
  clinicId: string,
  at: Date
): Promise<Array<Record<string, unknown>>> {
  const rows = await OnCallScheduleModel.find({
    clinicId: oid(clinicId),
    start: { $lte: at },
    end: { $gt: at },
  })
    .sort({ role: 1 })
    .lean();
  return rows as Array<Record<string, unknown>>;
}

// ── Load balancing ─────────────────────────────────────────────────────────

export async function providerLoadForDay(
  clinicId: string,
  providerIds: string[],
  day: Date
): Promise<Record<string, number>> {
  const dayStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const rows = await AppointmentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        clinicId: oid(clinicId),
        doctorId: { $in: providerIds.map(oid) },
        status: { $in: ACTIVE_APPT_STATUSES },
        scheduledAt: { $gte: dayStart, $lt: dayEnd },
      },
    },
    { $group: { _id: '$doctorId', count: { $sum: 1 } } },
  ]);

  const load = new Map<string, number>(providerIds.map((p) => [p, 0]));
  for (const r of rows) load.set(String(r._id), r.count);
  return Object.fromEntries(load);
}

/** Least-loaded provider for a day; ties broken by input order. */
export async function pickLeastLoadedProvider(
  clinicId: string,
  providerIds: string[],
  day: Date
): Promise<string | null> {
  if (providerIds.length === 0) return null;
  const load = new Map(Object.entries(await providerLoadForDay(clinicId, providerIds, day)));
  const at = (id: string): number => load.get(id) ?? Number.POSITIVE_INFINITY;
  return providerIds.reduce((best, id) => (at(id) < at(best) ? id : best), providerIds[0]);
}
