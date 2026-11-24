/**
 * Vaccine adverse event tracking (Issue #1246)
 *
 * Records and manages adverse events following immunization (AEFI) reported
 * by clinical staff, including VAERS reporting status.
 */
import { VaccineAdverseEventModel } from './adverse-event.model';

export interface ReportAdverseEventInput {
  clinicId: string;
  patientId: string;
  immunizationId?: string;
  vaccineCode: string;
  vaccineName: string;
  lotNumber?: string;
  description: string;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  onsetDate: Date;
  resolvedDate?: Date;
  outcome: 'recovered' | 'recovering' | 'ongoing' | 'fatal' | 'unknown';
  reportedToVAERS: boolean;
  vaersReportId?: string;
  reportedBy: string;
  notes?: string;
}

export interface UpdateAdverseEventInput {
  resolvedDate?: Date;
  outcome?: 'recovered' | 'recovering' | 'ongoing' | 'fatal' | 'unknown';
  reportedToVAERS?: boolean;
  vaersReportId?: string;
  notes?: string;
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export async function reportAdverseEvent(input: ReportAdverseEventInput) {
  return VaccineAdverseEventModel.create({
    clinicId: input.clinicId,
    patientId: input.patientId,
    immunizationId: input.immunizationId,
    vaccineCode: input.vaccineCode,
    vaccineName: input.vaccineName,
    lotNumber: input.lotNumber,
    description: input.description,
    severity: input.severity,
    onsetDate: input.onsetDate,
    resolvedDate: input.resolvedDate,
    outcome: input.outcome,
    reportedToVAERS: input.reportedToVAERS,
    vaersReportId: input.vaersReportId,
    reportedDate: input.reportedToVAERS ? new Date() : undefined,
    reportedBy: input.reportedBy,
    notes: input.notes,
  });
}

export async function listAdverseEvents(
  clinicId: string,
  options: {
    patientId?: string;
    vaccineCode?: string;
    severity?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  } = {}
) {
  const filter: Record<string, any> = { clinicId };
  if (options.patientId) filter.patientId = options.patientId;
  if (options.vaccineCode) filter.vaccineCode = options.vaccineCode;
  if (options.severity) filter.severity = options.severity;
  if (options.from || options.to) {
    filter.onsetDate = {};
    if (options.from) filter.onsetDate.$gte = options.from;
    if (options.to) filter.onsetDate.$lte = options.to;
  }

  return VaccineAdverseEventModel.find(filter)
    .sort({ onsetDate: -1 })
    .limit(options.limit ?? 50)
    .populate('patientId', 'firstName lastName systemId')
    .lean();
}

export async function getAdverseEvent(eventId: string, clinicId: string) {
  const event = await VaccineAdverseEventModel.findOne({ _id: eventId, clinicId })
    .populate('patientId', 'firstName lastName systemId')
    .lean();
  if (!event) throw httpError(404, 'Adverse event not found');
  return event;
}

export async function updateAdverseEvent(
  eventId: string,
  clinicId: string,
  input: UpdateAdverseEventInput
) {
  const update: Record<string, unknown> = { ...input };
  if (input.reportedToVAERS && !update.reportedDate) {
    update.reportedDate = new Date();
  }

  const event = await VaccineAdverseEventModel.findOneAndUpdate(
    { _id: eventId, clinicId },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!event) throw httpError(404, 'Adverse event not found');
  return event;
}
