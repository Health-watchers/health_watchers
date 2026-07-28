import { Types } from 'mongoose';
import { EncounterModel } from '../encounters/encounter.model';
import { LabResultModel } from '../lab-results/lab-result.model';
import { ImmunizationModel } from '../immunizations/immunization.model';
import { AppointmentModel } from '../appointments/appointment.model';
import type { TimelineEvent, PortalTimelineQueryDto } from './portal.validation';

type EventType = TimelineEvent['type'];

interface TimelineFetchOptions {
  patientId: string;
  clinicId: string;
  query: PortalTimelineQueryDto;
}

interface TimelineResult {
  data: TimelineEvent[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    nextCursor: string | null;
  };
}

function buildDateFilter(startDate?: string, endDate?: string): Record<string, Date> | undefined {
  if (!startDate && !endDate) return undefined;
  const filter: Record<string, Date> = {};
  if (startDate) filter.$gte = new Date(startDate);
  if (endDate) filter.$lte = new Date(endDate);
  return filter;
}

function mapEncounterToEvent(encounter: Record<string, unknown>): TimelineEvent {
  return {
    id: String(encounter._id),
    type: 'encounter',
    date: String(encounter.createdAt),
    title: `Encounter: ${encounter.chiefComplaint ?? 'Visit'}`,
    description: `${encounter.type ?? 'Consultation'} — status: ${encounter.status ?? 'unknown'}`,
    details: {
      type: encounter.type,
      status: encounter.status,
      chiefComplaint: encounter.chiefComplaint,
      diagnosis: encounter.diagnosis,
      followUpDate: encounter.followUpDate,
      patientFriendlySummary: encounter.patientFriendlySummary ?? null,
    },
    clinicId: String(encounter.clinicId),
    createdAt: String(encounter.createdAt),
  };
}

function mapLabResultToEvent(lab: Record<string, unknown>): TimelineEvent {
  return {
    id: String(lab._id),
    type: 'lab_result',
    date: String(lab.resultedAt ?? lab.orderedAt ?? lab.createdAt),
    title: `Lab Result: ${lab.testName ?? 'Test'}`,
    description: `Status: ${lab.status}${lab.isCritical ? ' — CRITICAL' : ''}`,
    details: {
      testName: lab.testName,
      testCode: lab.testCode,
      status: lab.status,
      orderedAt: lab.orderedAt,
      resultedAt: lab.resultedAt,
      isCritical: lab.isCritical,
      results: lab.results,
    },
    clinicId: String(lab.clinicId),
    createdAt: String(lab.createdAt),
  };
}

function mapImmunizationToEvent(imm: Record<string, unknown>): TimelineEvent {
  return {
    id: String(imm._id),
    type: 'immunization',
    date: String(imm.administeredDate ?? imm.createdAt),
    title: `Vaccine: ${imm.vaccineName ?? 'Unknown vaccine'}`,
    description: `Dose ${imm.doseNumber ?? '?'}${imm.seriesComplete ? ' — Series complete' : ''}`,
    details: {
      vaccineName: imm.vaccineName,
      vaccineCode: imm.vaccineCode,
      manufacturer: imm.manufacturer,
      doseNumber: imm.doseNumber,
      seriesComplete: imm.seriesComplete,
      administeredDate: imm.administeredDate,
      site: imm.site,
      route: imm.route,
    },
    clinicId: String(imm.clinicId),
    createdAt: String(imm.createdAt),
  };
}

function mapAppointmentToEvent(appt: Record<string, unknown>): TimelineEvent {
  return {
    id: String(appt._id),
    type: 'appointment',
    date: String(appt.scheduledAt ?? appt.createdAt),
    title: `Appointment: ${appt.type ?? 'Visit'}`,
    description: `Status: ${appt.status ?? 'unknown'}${appt.chiefComplaint ? ` — ${appt.chiefComplaint}` : ''}`,
    details: {
      type: appt.type,
      status: appt.status,
      scheduledAt: appt.scheduledAt,
      chiefComplaint: appt.chiefComplaint,
    },
    clinicId: String(appt.clinicId),
    createdAt: String(appt.createdAt),
  };
}

function mapPrescriptionToEvent(
  prescription: Record<string, unknown>,
  encounterId: string,
  clinicId: string,
  patientId: string
): TimelineEvent {
  const prescribedAt = prescription.prescribedAt ?? prescription.createdAt;
  return {
    id: `${encounterId}_rx_${prescription.drugName}`,
    type: 'prescription',
    date: String(prescribedAt),
    title: `Prescription: ${prescription.drugName ?? 'Medication'}`,
    description: `${prescription.dosage ?? ''} ${prescription.frequency ?? ''}`.trim(),
    details: {
      drugName: prescription.drugName,
      genericName: prescription.genericName,
      dosage: prescription.dosage,
      frequency: prescription.frequency,
      duration: prescription.duration,
      route: prescription.route,
      instructions: prescription.instructions,
      refillsAllowed: prescription.refillsAllowed,
      prescribedAt,
      encounterId,
      patientId,
    },
    clinicId,
    createdAt: String(prescribedAt),
  };
}

async function fetchEncounterEvents(
  patientId: Types.ObjectId,
  clinicId: Types.ObjectId,
  dateFilter: Record<string, Date> | undefined
): Promise<TimelineEvent[]> {
  const filter: Record<string, unknown> = {
    patientId,
    clinicId,
    isActive: true,
  };
  if (dateFilter) filter.createdAt = dateFilter;

  const encounters = (await EncounterModel.find(filter)
    .sort({ createdAt: -1 })
    .lean()) as Record<string, unknown>[];

  return encounters.map(mapEncounterToEvent);
}

async function fetchLabResultEvents(
  patientId: Types.ObjectId,
  clinicId: Types.ObjectId,
  dateFilter: Record<string, Date> | undefined
): Promise<TimelineEvent[]> {
  const filter: Record<string, unknown> = { patientId, clinicId };
  if (dateFilter) filter.createdAt = dateFilter;

  const labs = (await LabResultModel.find(filter)
    .sort({ createdAt: -1 })
    .lean()) as Record<string, unknown>[];

  return labs.map(mapLabResultToEvent);
}

async function fetchImmunizationEvents(
  patientId: Types.ObjectId,
  clinicId: Types.ObjectId,
  dateFilter: Record<string, Date> | undefined
): Promise<TimelineEvent[]> {
  const filter: Record<string, unknown> = {
    patientId,
    clinicId,
    isActive: true,
  };
  if (dateFilter) filter.administeredDate = dateFilter;

  const immunizations = (await ImmunizationModel.find(filter)
    .sort({ administeredDate: -1 })
    .lean()) as Record<string, unknown>[];

  return immunizations.map(mapImmunizationToEvent);
}

async function fetchAppointmentEvents(
  patientId: Types.ObjectId,
  clinicId: Types.ObjectId,
  dateFilter: Record<string, Date> | undefined
): Promise<TimelineEvent[]> {
  const filter: Record<string, unknown> = { patientId, clinicId };
  if (dateFilter) filter.scheduledAt = dateFilter;

  const appointments = (await AppointmentModel.find(filter)
    .sort({ scheduledAt: -1 })
    .lean()) as Record<string, unknown>[];

  return appointments.map(mapAppointmentToEvent);
}

async function fetchPrescriptionEvents(
  patientId: Types.ObjectId,
  clinicId: Types.ObjectId,
  dateFilter: Record<string, Date> | undefined
): Promise<TimelineEvent[]> {
  const filter: Record<string, unknown> = {
    patientId,
    clinicId,
    isActive: true,
    prescriptions: { $exists: true, $ne: [] },
  };
  if (dateFilter) filter.createdAt = dateFilter;

  const encounters = (await EncounterModel.find(filter)
    .sort({ createdAt: -1 })
    .lean()) as Record<string, unknown>[];

  const events: TimelineEvent[] = [];
  for (const encounter of encounters) {
    const prescriptions = encounter.prescriptions as Record<string, unknown>[] | undefined;
    if (!prescriptions?.length) continue;
    for (const rx of prescriptions) {
      events.push(
        mapPrescriptionToEvent(rx, String(encounter._id), String(encounter.clinicId), String(encounter.patientId))
      );
    }
  }

  return events;
}

export async function getPatientTimeline(options: TimelineFetchOptions): Promise<TimelineResult> {
  const { patientId, clinicId, query } = options;
  const page = Math.max(1, parseInt(String(query.page ?? '1')) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? '20')) || 20));

  const patientOid = new Types.ObjectId(patientId);
  const clinicOid = new Types.ObjectId(clinicId);
  const dateFilter = buildDateFilter(query.startDate, query.endDate);

  const typesToFetch: EventType[] = query.eventType
    ? [query.eventType as EventType]
    : ['encounter', 'lab_result', 'immunization', 'prescription', 'appointment'];

  const fetchers: Array<Promise<TimelineEvent[]>> = [];

  if (typesToFetch.includes('encounter')) {
    fetchers.push(fetchEncounterEvents(patientOid, clinicOid, dateFilter));
  }
  if (typesToFetch.includes('lab_result')) {
    fetchers.push(fetchLabResultEvents(patientOid, clinicOid, dateFilter));
  }
  if (typesToFetch.includes('immunization')) {
    fetchers.push(fetchImmunizationEvents(patientOid, clinicOid, dateFilter));
  }
  if (typesToFetch.includes('prescription')) {
    fetchers.push(fetchPrescriptionEvents(patientOid, clinicOid, dateFilter));
  }
  if (typesToFetch.includes('appointment')) {
    fetchers.push(fetchAppointmentEvents(patientOid, clinicOid, dateFilter));
  }

  const results = await Promise.all(fetchers);
  const allEvents = ([] as TimelineEvent[]).concat(...results);

  // Sort all events chronologically, most recent first
  allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const total = allEvents.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const start = (page - 1) * limit;
  const pageData = allEvents.slice(start, start + limit);

  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  const lastItem = pageData[pageData.length - 1];
  const nextCursor = hasNextPage && lastItem ? lastItem.id : null;

  return {
    data: pageData,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage,
      hasPrevPage,
      nextCursor,
    },
  };
}