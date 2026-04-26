import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { PatientModel } from '../patients/models/patient.model';
import { ClinicModel } from '../clinics/clinic.model';
import { ImmunizationModel } from './immunization.model';
import logger from '../../utils/logger';

interface CertificateOptions {
  patientId: string;
  clinicId: string;
}

/**
 * Generate an immunization certificate PDF for a patient.
 * Returns a PassThrough stream that can be piped directly to the HTTP response.
 */
export async function generateImmunizationCertificate(
  options: CertificateOptions,
): Promise<PassThrough> {
  const { patientId, clinicId } = options;

  logger.info({ patientId, clinicId }, 'Generating immunization certificate');

  const [patient, clinic, immunizations] = await Promise.all([
    PatientModel.findOne({ _id: patientId, clinicId, isActive: true }),
    ClinicModel.findById(clinicId),
    ImmunizationModel.find({ patientId, clinicId, isActive: true })
      .populate('administeredBy', 'firstName lastName')
      .sort({ administeredDate: 1 })
      .lean(),
  ]);

  if (!patient) throw new Error('Patient not found');
  if (!clinic) throw new Error('Clinic not found');

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 60, left: 50, right: 50 },
    info: {
      Title: `Immunization Certificate — ${patient.firstName} ${patient.lastName}`,
      Author: clinic.name,
      Subject: 'Immunization Record Certificate',
      Keywords: 'immunization, vaccination, certificate, healthcare',
    },
  });

  const stream = new PassThrough();
  doc.pipe(stream);

  const pageWidth = doc.page.width - 100; // account for margins

  // ── Border ────────────────────────────────────────────────────────────────
  doc
    .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
    .lineWidth(2)
    .strokeColor('#1a5276')
    .stroke();

  // ── Header ────────────────────────────────────────────────────────────────
  doc.fillColor('#1a5276').fontSize(22).font('Helvetica-Bold').text(clinic.name, { align: 'center' });
  doc.fillColor('#555').fontSize(10).font('Helvetica').text(clinic.address || '', { align: 'center' });
  doc.text(clinic.contactNumber || '', { align: 'center' });
  doc.moveDown(0.5);

  // Divider
  doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).lineWidth(1).strokeColor('#1a5276').stroke();
  doc.moveDown(0.5);

  // ── Title ─────────────────────────────────────────────────────────────────
  doc
    .fillColor('#1a5276')
    .fontSize(18)
    .font('Helvetica-Bold')
    .text('IMMUNIZATION CERTIFICATE', { align: 'center' });
  doc.moveDown(1);

  // ── Patient Info ──────────────────────────────────────────────────────────
  doc.fillColor('#000').fontSize(11).font('Helvetica-Bold').text('Patient Information');
  doc.moveDown(0.3);

  const infoY = doc.y;
  doc.font('Helvetica').fontSize(10);
  doc.text(`Patient ID:`, 50, infoY);
  doc.text(patient.systemId, 160, infoY);
  doc.text(`Full Name:`, 50, infoY + 16);
  doc.text(`${patient.firstName} ${patient.lastName}`, 160, infoY + 16);
  doc.text(`Date of Birth:`, 50, infoY + 32);
  doc.text(patient.dateOfBirth ? String(patient.dateOfBirth) : 'N/A', 160, infoY + 32);
  doc.text(`Sex:`, 50, infoY + 48);
  doc.text(patient.sex === 'M' ? 'Male' : patient.sex === 'F' ? 'Female' : 'Other', 160, infoY + 48);

  doc.moveDown(4);

  // Divider
  doc.moveTo(50, doc.y).lineTo(50 + pageWidth, doc.y).lineWidth(0.5).strokeColor('#aaa').stroke();
  doc.moveDown(0.5);

  // ── Immunization Table ────────────────────────────────────────────────────
  doc.fillColor('#000').fontSize(11).font('Helvetica-Bold').text('Vaccination History');
  doc.moveDown(0.5);

  if (immunizations.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#666').text('No immunizations recorded.', { italics: true });
  } else {
    // Table header
    const colX = { date: 50, vaccine: 130, dose: 290, lot: 340, site: 400, admin: 460 };
    const headerY = doc.y;

    doc
      .rect(50, headerY - 4, pageWidth, 18)
      .fillColor('#1a5276')
      .fill();

    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text('Date', colX.date, headerY, { width: 75 });
    doc.text('Vaccine', colX.vaccine, headerY, { width: 155 });
    doc.text('Dose', colX.dose, headerY, { width: 45 });
    doc.text('Lot #', colX.lot, headerY, { width: 55 });
    doc.text('Site', colX.site, headerY, { width: 55 });
    doc.text('Administered By', colX.admin, headerY, { width: 100 });

    doc.moveDown(0.3);

    // Table rows
    immunizations.forEach((imm, idx) => {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }

      const rowY = doc.y;
      const isEven = idx % 2 === 0;

      if (isEven) {
        doc.rect(50, rowY - 2, pageWidth, 16).fillColor('#eaf0fb').fill();
      }

      const adminBy = imm.administeredBy as any;
      const adminName = adminBy
        ? `${adminBy.firstName ?? ''} ${adminBy.lastName ?? ''}`.trim()
        : 'N/A';

      const administeredDate = imm.administeredDate
        ? new Date(imm.administeredDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
          })
        : 'N/A';

      doc.fillColor('#000').fontSize(8).font('Helvetica');
      doc.text(administeredDate, colX.date, rowY, { width: 75 });
      doc.text(
        `${imm.vaccineName}${imm.seriesComplete ? ' ✓' : ''}`,
        colX.vaccine,
        rowY,
        { width: 155 },
      );
      doc.text(`${imm.doseNumber}`, colX.dose, rowY, { width: 45 });
      doc.text(imm.lotNumber ?? 'N/A', colX.lot, rowY, { width: 55 });
      doc.text(imm.site ?? 'N/A', colX.site, rowY, { width: 55 });
      doc.text(adminName, colX.admin, rowY, { width: 100 });

      // Flag adverse reactions
      if (imm.adverseReaction) {
        doc.moveDown(0.1);
        doc
          .fillColor('#c0392b')
          .fontSize(7)
          .text(
            `  ⚠ Adverse reaction: ${imm.adverseReaction.description} (${imm.adverseReaction.severity})`,
            colX.date,
            doc.y,
            { width: pageWidth },
          );
        doc.fillColor('#000');
      }

      doc.moveDown(0.4);
    });
  }

  doc.moveDown(1);

  // ── Footer ────────────────────────────────────────────────────────────────
  doc
    .moveTo(50, doc.y)
    .lineTo(50 + pageWidth, doc.y)
    .lineWidth(0.5)
    .strokeColor('#aaa')
    .stroke();
  doc.moveDown(0.5);

  doc
    .fillColor('#555')
    .fontSize(8)
    .font('Helvetica')
    .text(
      `This certificate was generated on ${new Date().toLocaleString()} by ${clinic.name}. ` +
        'This document is confidential and intended solely for the named patient.',
      { align: 'center' },
    );

  // Page numbers
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor('#888')
      .text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 40, { align: 'center' });
  }

  doc.end();

  logger.info(
    { patientId, immunizationCount: immunizations.length },
    'Immunization certificate generated',
  );

  return stream;
}
