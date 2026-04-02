import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import { Response } from 'express';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { PaymentRecordModel } from '@api/modules/payments/models/payment-record.model';
import { Types } from 'mongoose';

// ─── Patient export helpers ────────────────────────────────────────────────

export async function buildPatientRecord(patientId: string) {
  const patient = await PatientModel.findById(patientId).lean();
  if (!patient) return null;

  const encounters = await EncounterModel.find({ patientId: new Types.ObjectId(patientId) }).lean();

  return { patient, encounters };
}

/** Stream a JSON response for a patient record */
export function sendPatientJson(res: Response, data: object) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="patient-export.json"');
  res.json({ status: 'success', exportedAt: new Date().toISOString(), data });
}

/** Stream a PDF response for a patient record */
export function sendPatientPdf(res: Response, record: Awaited<ReturnType<typeof buildPatientRecord>>) {
  if (!record) throw new Error('No record');
  const { patient, encounters } = record;

  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="patient-${patient.systemId}-export.pdf"`);
  doc.pipe(res);

  // ── Header ──
  doc.fontSize(20).font('Helvetica-Bold').text('Health Watchers', { align: 'center' });
  doc.fontSize(14).font('Helvetica').text('Patient Health Record Export', { align: 'center' });
  doc.fontSize(9).fillColor('grey').text(`Generated: ${new Date().toUTCString()}  |  HIPAA Right of Access — 45 CFR § 164.524`, { align: 'center' });
  doc.fillColor('black').moveDown(1.5);

  // ── Patient Bio ──
  sectionHeader(doc, 'Patient Information');
  field(doc, 'Patient ID',    patient.systemId);
  field(doc, 'Full Name',     `${patient.firstName} ${patient.lastName}`);
  field(doc, 'Date of Birth', patient.dateOfBirth ? new Date(patient.dateOfBirth).toDateString() : 'N/A');
  field(doc, 'Sex',           patient.sex);
  field(doc, 'Contact',       patient.contactNumber || 'N/A');
  field(doc, 'Address',       patient.address || 'N/A');
  field(doc, 'Status',        patient.isActive ? 'Active' : 'Inactive');
  doc.moveDown(1);

  // ── Encounters / Medical History ──
  sectionHeader(doc, `Medical History (${encounters.length} encounter${encounters.length !== 1 ? 's' : ''})`);
  if (encounters.length === 0) {
    doc.fontSize(10).text('No encounters on record.');
  } else {
    encounters.forEach((enc, i) => {
      doc.fontSize(11).font('Helvetica-Bold').text(`Encounter ${i + 1}`, { continued: false });
      doc.font('Helvetica');
      field(doc, 'Date',             enc.createdAt ? new Date(enc.createdAt).toDateString() : 'N/A');
      field(doc, 'Chief Complaint',  enc.chiefComplaint);
      field(doc, 'Notes',            enc.notes || 'None');
      doc.moveDown(0.5);
    });
  }

  doc.end();
}

// ─── Clinic export helper ──────────────────────────────────────────────────

export async function buildClinicRecord(clinicId: string) {
  const patients  = await PatientModel.find({ clinicId }).lean();
  const patientIds = patients.map(p => p._id);

  const encounters = await EncounterModel.find({
    patientId: { $in: patientIds },
  }).lean();

  const payments = await PaymentRecordModel.find({ clinicId }).lean();

  return { patients, encounters, payments };
}

/** Stream a ZIP archive for a clinic export */
export function sendClinicZip(res: Response, clinicId: string, record: Awaited<ReturnType<typeof buildClinicRecord>>) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="clinic-${clinicId}-export.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  archive.append(JSON.stringify(record.patients, null, 2),  { name: 'patients.json' });
  archive.append(JSON.stringify(record.encounters, null, 2),{ name: 'encounters.json' });
  archive.append(JSON.stringify(record.payments, null, 2),  { name: 'payments.json' });

  // Also include a CSV summary of patients
  const csv = buildPatientCsv(record.patients);
  archive.append(csv, { name: 'patients-summary.csv' });

  archive.finalize();
}

// ─── Private helpers ───────────────────────────────────────────────────────

function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a1a2e').text(title);
  doc.moveTo(doc.page.margins.left, doc.y)
     .lineTo(doc.page.width - doc.page.margins.right, doc.y)
     .strokeColor('#cccccc').stroke();
  doc.fillColor('black').font('Helvetica').fontSize(10).moveDown(0.4);
}

function field(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.fontSize(10)
     .font('Helvetica-Bold').text(`${label}: `, { continued: true })
     .font('Helvetica').text(value);
}

function buildPatientCsv(patients: any[]): string {
  const header = 'systemId,firstName,lastName,dateOfBirth,sex,contactNumber,address,isActive,createdAt';
  const rows = patients.map(p =>
    [
      p.systemId, p.firstName, p.lastName,
      p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split('T')[0] : '',
      p.sex, p.contactNumber || '', p.address || '',
      p.isActive, p.createdAt ? new Date(p.createdAt).toISOString() : '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  );
  return [header, ...rows].join('\n');
}
