import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { Types } from 'mongoose';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { PaymentRecordModel } from '@api/modules/payments/models/payment-record.model';
import { LabResultModel } from '@api/modules/lab-results/lab-result.model';
import { ImmunizationModel } from '@api/modules/immunizations/immunization.model';
import { buildFhirBundle } from './fhir-mapper';

/**
 * Builds a comprehensive HIPAA Right of Access record covering all required data
 * elements: demographics, encounters, diagnoses, medications, lab results,
 * immunizations and billing records.
 */
export interface ComprehensiveRecord {
  patient: any;
  encounters: any[];
  diagnoses: any[];
  medications: any[];
  labResults: any[];
  immunizations: any[];
  billing: any[];
}

function strip(doc: Record<string, any>): Record<string, any> {
  if (!doc) return doc;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { __v, password, mfaSecret, ...safe } = doc;
  return safe;
}

export async function buildComprehensiveRecord(
  patientId: string,
): Promise<ComprehensiveRecord | null> {
  if (!Types.ObjectId.isValid(patientId)) return null;

  const patient = (await PatientModel.findById(patientId).lean()) as any;
  if (!patient) return null;

  const oid = new Types.ObjectId(patientId);
  const [encounters, labResults, immunizations, billing] = await Promise.all([
    EncounterModel.find({ patientId: oid }).lean(),
    LabResultModel.find({ patientId: oid }).lean(),
    ImmunizationModel.find({ patientId: oid }).lean(),
    PaymentRecordModel.find({ clinicId: patient.clinicId, patientId: oid }).lean(),
  ]);

  // Diagnoses and medications are embedded in encounters — flatten them out so
  // they appear as first-class sections in the export.
  const diagnoses: any[] = [];
  const medications: any[] = [];
  for (const enc of encounters as any[]) {
    for (const d of enc.diagnosis ?? []) diagnoses.push({ ...d, encounterId: String(enc._id), date: enc.createdAt });
    for (const p of enc.prescriptions ?? []) medications.push({ ...p, encounterId: String(enc._id), date: enc.createdAt });
  }

  return {
    patient,
    encounters: encounters as any[],
    diagnoses,
    medications,
    labResults: labResults as any[],
    immunizations: immunizations as any[],
    billing: billing as any[],
  };
}

// ─── JSON ────────────────────────────────────────────────────────────────────

export function renderJson(record: ComprehensiveRecord) {
  return {
    status: 'success',
    exportedAt: new Date().toISOString(),
    standard: 'HIPAA Right of Access — 45 CFR § 164.524',
    data: {
      demographics: strip(record.patient),
      encounters: record.encounters.map(strip),
      diagnoses: record.diagnoses,
      medications: record.medications,
      labResults: record.labResults.map(strip),
      immunizations: record.immunizations.map(strip),
      billing: record.billing.map(strip),
    },
  };
}

// ─── CSV ───────────────────────────────────────────────────────────────────-

function csvRow(values: unknown[]): string {
  return values.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
}

export function renderCsv(record: ComprehensiveRecord): string {
  const lines: string[] = [];
  const { patient } = record;

  lines.push('# DEMOGRAPHICS');
  lines.push(csvRow(['systemId', 'firstName', 'lastName', 'dateOfBirth', 'sex', 'contactNumber', 'address']));
  lines.push(
    csvRow([
      patient.systemId,
      patient.firstName,
      patient.lastName,
      patient.dateOfBirth ? new Date(patient.dateOfBirth).toISOString().split('T')[0] : '',
      patient.sex,
      patient.contactNumber,
      patient.address,
    ]),
  );
  lines.push('');

  lines.push('# ENCOUNTERS');
  lines.push(csvRow(['date', 'chiefComplaint', 'notes']));
  for (const e of record.encounters) {
    lines.push(csvRow([e.createdAt ? new Date(e.createdAt).toISOString() : '', e.chiefComplaint, e.notes]));
  }
  lines.push('');

  lines.push('# DIAGNOSES');
  lines.push(csvRow(['date', 'code', 'description']));
  for (const d of record.diagnoses) {
    lines.push(csvRow([d.date ? new Date(d.date).toISOString() : '', d.code ?? d.icdCode, d.description ?? d.name]));
  }
  lines.push('');

  lines.push('# MEDICATIONS');
  lines.push(csvRow(['date', 'name', 'dosage', 'frequency', 'route']));
  for (const m of record.medications) {
    lines.push(csvRow([m.date ? new Date(m.date).toISOString() : '', m.drugName ?? m.name, m.dosage, m.frequency, m.route]));
  }
  lines.push('');

  lines.push('# LAB RESULTS');
  lines.push(csvRow(['testName', 'status', 'orderedAt']));
  for (const l of record.labResults) {
    lines.push(csvRow([l.testName, l.status, l.createdAt ? new Date(l.createdAt).toISOString() : '']));
  }
  lines.push('');

  lines.push('# IMMUNIZATIONS');
  lines.push(csvRow(['vaccineName', 'vaccineCode', 'administeredDate']));
  for (const im of record.immunizations) {
    lines.push(csvRow([im.vaccineName, im.vaccineCode, im.administeredDate ? new Date(im.administeredDate).toISOString() : '']));
  }
  lines.push('');

  lines.push('# BILLING');
  lines.push(csvRow(['amount', 'assetCode', 'status', 'date']));
  for (const b of record.billing) {
    lines.push(csvRow([b.amount, b.assetCode, b.status, b.createdAt ? new Date(b.createdAt).toISOString() : '']));
  }

  return lines.join('\n');
}

// ─── FHIR R4 ──────────────────────────────────────────────────────────────────

export function renderFhir(record: ComprehensiveRecord) {
  return buildFhirBundle(record.patient, record.encounters);
}

// ─── PDF ───────────────────────────────────────────────────────────────────-

function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.5).fontSize(13).font('Helvetica-Bold').fillColor('#1a1a2e').text(title);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor('#cccccc')
    .stroke();
  doc.fillColor('black').font('Helvetica').fontSize(10).moveDown(0.4);
}

function field(doc: PDFKit.PDFDocument, label: string, value: unknown) {
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(`${label}: `, { continued: true })
    .font('Helvetica')
    .text(String(value ?? 'N/A'));
}

export function streamPdf(res: Response, record: ComprehensiveRecord) {
  const { patient } = record;
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(20).font('Helvetica-Bold').text('Health Watchers', { align: 'center' });
  doc.fontSize(14).font('Helvetica').text('Complete Health Record (Right of Access)', { align: 'center' });
  doc
    .fontSize(9)
    .fillColor('grey')
    .text(`Generated: ${new Date().toUTCString()}  |  HIPAA — 45 CFR § 164.524`, { align: 'center' });
  doc.fillColor('black').moveDown(1);

  sectionHeader(doc, 'Demographics');
  field(doc, 'Patient ID', patient.systemId);
  field(doc, 'Name', `${patient.firstName} ${patient.lastName}`);
  field(doc, 'Date of Birth', patient.dateOfBirth ? new Date(patient.dateOfBirth).toDateString() : 'N/A');
  field(doc, 'Sex', patient.sex);
  field(doc, 'Contact', patient.contactNumber);
  field(doc, 'Address', patient.address);

  sectionHeader(doc, `Encounters (${record.encounters.length})`);
  record.encounters.forEach((e, i) => {
    field(doc, `Encounter ${i + 1}`, e.createdAt ? new Date(e.createdAt).toDateString() : 'N/A');
    field(doc, '  Chief Complaint', e.chiefComplaint);
    field(doc, '  Notes', e.notes);
  });
  if (record.encounters.length === 0) doc.text('None on record.');

  sectionHeader(doc, `Diagnoses (${record.diagnoses.length})`);
  record.diagnoses.forEach((d) => field(doc, d.code ?? d.icdCode ?? 'Diagnosis', d.description ?? d.name));
  if (record.diagnoses.length === 0) doc.text('None on record.');

  sectionHeader(doc, `Medications (${record.medications.length})`);
  record.medications.forEach((m) =>
    field(doc, m.drugName ?? m.name ?? 'Medication', [m.dosage, m.frequency, m.route].filter(Boolean).join(', ')),
  );
  if (record.medications.length === 0) doc.text('None on record.');

  sectionHeader(doc, `Lab Results (${record.labResults.length})`);
  record.labResults.forEach((l) => field(doc, l.testName ?? 'Lab', l.status));
  if (record.labResults.length === 0) doc.text('None on record.');

  sectionHeader(doc, `Immunizations (${record.immunizations.length})`);
  record.immunizations.forEach((im) =>
    field(doc, im.vaccineName ?? im.vaccineCode ?? 'Vaccine', im.administeredDate ? new Date(im.administeredDate).toDateString() : 'N/A'),
  );
  if (record.immunizations.length === 0) doc.text('None on record.');

  sectionHeader(doc, `Billing Records (${record.billing.length})`);
  record.billing.forEach((b, i) => field(doc, `Charge ${i + 1}`, `${b.amount} ${b.assetCode ?? ''} — ${b.status}`));
  if (record.billing.length === 0) doc.text('None on record.');

  doc.end();
}
