import PDFDocument from 'pdfkit';
import archiver from 'archiver';
import { Response } from 'express';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { PaymentRecordModel } from '@api/modules/payments/models/payment-record.model';
import { UserModel } from '@api/modules/auth/models/user.model';
import { Types } from 'mongoose';
import logger from '@api/utils/logger';

// ─── Sanitization ──────────────────────────────────────────────────────────

/** Strip internal Mongoose fields and any secret fields from exported data */
function sanitize(doc: Record<string, any>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, __v, password, mfaSecret, resetPasswordTokenHash, resetPasswordExpiresAt, ...safe } =
    doc;
  return safe;
}

function sanitizeAll(docs: Record<string, any>[]): Record<string, any>[] {
  return docs.map(sanitize);
}

// ─── Patient export helpers ────────────────────────────────────────────────

export async function buildPatientRecord(patientId: string) {
  if (!Types.ObjectId.isValid(patientId)) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patient = (await PatientModel.findById(patientId).lean()) as any;
  if (!patient) return null;

  const [encounters, payments] = await Promise.all([
    EncounterModel.find({ patientId: new Types.ObjectId(patientId) }).lean(),
    PaymentRecordModel.find({ clinicId: patient.clinicId }).lean(),
  ]);

  return { patient, encounters, payments };
}

/** Stream a sanitized JSON response for a patient record */
export function sendPatientJson(
  res: Response,
  rawData: NonNullable<Awaited<ReturnType<typeof buildPatientRecord>>>
) {
  const data = {
    patient: sanitize(rawData.patient as any),
    encounters: sanitizeAll(rawData.encounters as any[]),
    payments: sanitizeAll(rawData.payments as any[]),
  };

  const patientSystemId = (rawData.patient as any).systemId || 'unknown';
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="patient-${patientSystemId}-export.json"`
  );
  res.json({ status: 'success', exportedAt: new Date().toISOString(), data });
}

/** Stream a PDF response for a patient record */
export function sendPatientPdf(
  res: Response,
  record: Awaited<ReturnType<typeof buildPatientRecord>>
) {
  if (!record) throw new Error('No record');
  const { patient, encounters, payments } = record;

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="patient-${patient.systemId}-export.pdf"`
  );
  doc.pipe(res);

  // ── Header ──
  doc.fontSize(20).font('Helvetica-Bold').text('Health Watchers', { align: 'center' });
  doc.fontSize(14).font('Helvetica').text('Patient Health Record Export', { align: 'center' });
  doc
    .fontSize(9)
    .fillColor('grey')
    .text(`Generated: ${new Date().toUTCString()}  |  HIPAA Right of Access — 45 CFR § 164.524`, {
      align: 'center',
    });
  doc.fillColor('black').moveDown(1.5);

  // ── Patient Information ──
  sectionHeader(doc, 'Patient Information');
  field(doc, 'Patient ID', patient.systemId);
  field(doc, 'Full Name', `${patient.firstName} ${patient.lastName}`);
  field(
    doc,
    'Date of Birth',
    patient.dateOfBirth ? new Date(patient.dateOfBirth).toDateString() : 'N/A'
  );
  field(doc, 'Sex', patient.sex);
  field(doc, 'Contact', patient.contactNumber || 'N/A');
  field(doc, 'Address', patient.address || 'N/A');
  field(doc, 'Status', patient.isActive ? 'Active' : 'Inactive');
  doc.moveDown(1);

  // ── Medical History ──
  sectionHeader(
    doc,
    `Medical History (${encounters.length} encounter${encounters.length !== 1 ? 's' : ''})`
  );
  if (encounters.length === 0) {
    doc.fontSize(10).text('No encounters on record.');
  } else {
    encounters.forEach((enc, i) => {
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(`Encounter ${i + 1}`);
      doc.font('Helvetica');
      field(doc, 'Date', enc.createdAt ? new Date(enc.createdAt).toDateString() : 'N/A');
      field(doc, 'Chief Complaint', enc.chiefComplaint);
      field(doc, 'Notes', enc.notes || 'None');
      doc.moveDown(0.5);
    });
  }
  doc.moveDown(1);

  // ── Payments ──
  sectionHeader(doc, `Payment Records (${payments.length})`);
  if (payments.length === 0) {
    doc.fontSize(10).text('No payment records on file.');
  } else {
    payments.forEach((pay, i) => {
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(`Payment ${i + 1}`);
      doc.font('Helvetica');
      field(doc, 'Amount', pay.amount);
      field(doc, 'Status', pay.status);
      field(doc, 'Memo', pay.memo || 'N/A');
      field(
        doc,
        'Date',
        (pay as any).createdAt ? new Date((pay as any).createdAt).toDateString() : 'N/A'
      );
      doc.moveDown(0.5);
    });
  }

  doc.end();
}

// ─── Clinic export helper ──────────────────────────────────────────────────

export async function buildClinicRecord(clinicId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patients = (await PatientModel.find({ clinicId }).lean()) as any[];
  const patientIds = patients.map((p: any) => p._id);

  const [encounters, payments, staff] = await Promise.all([
    EncounterModel.find({ patientId: { $in: patientIds } }).lean(),
    PaymentRecordModel.find({ clinicId }).lean(),
    // Staff = users belonging to this clinic; sensitive fields excluded
    UserModel.find({ clinicId })
      .select('-password -mfaSecret -resetPasswordTokenHash -resetPasswordExpiresAt')
      .lean(),
  ]);

  return { patients, encounters, payments, staff };
}

/** Stream a ZIP archive for a clinic export */
export function sendClinicZip(
  res: Response,
  clinicId: string,
  record: Awaited<ReturnType<typeof buildClinicRecord>>
) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="clinic-${clinicId}-export.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err: Error) => {
    logger.error({ err }, 'Archiver error during clinic export');
    res.destroy(err);
  });

  archive.pipe(res);

  archive.append(JSON.stringify(sanitizeAll(record.patients as any[]), null, 2), {
    name: 'patients.json',
  });
  archive.append(JSON.stringify(sanitizeAll(record.encounters as any[]), null, 2), {
    name: 'encounters.json',
  });
  archive.append(JSON.stringify(sanitizeAll(record.payments as any[]), null, 2), {
    name: 'payments.json',
  });
  archive.append(JSON.stringify(sanitizeAll(record.staff as any[]), null, 2), {
    name: 'staff.json',
  });
  archive.append(buildPatientCsv(record.patients as any[]), { name: 'patients-summary.csv' });

  archive.finalize();
}

// ─── Private helpers ───────────────────────────────────────────────────────

function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a1a2e').text(title);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor('#cccccc')
    .stroke();
  doc.fillColor('black').font('Helvetica').fontSize(10).moveDown(0.4);
}

function field(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(`${label}: `, { continued: true })
    .font('Helvetica')
    .text(value);
}

function buildPatientCsv(patients: any[]): string {
  const header =
    'systemId,firstName,lastName,dateOfBirth,sex,contactNumber,address,isActive,createdAt';
  const rows = patients.map((p) =>
    [
      p.systemId,
      p.firstName,
      p.lastName,
      p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().split('T')[0] : '',
      p.sex,
      p.contactNumber || '',
      p.address || '',
      p.isActive,
      p.createdAt ? new Date(p.createdAt).toISOString() : '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
  );
  return [header, ...rows].join('\n');
}
