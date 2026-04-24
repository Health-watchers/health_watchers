import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { PatientModel } from '../patients/models/patient.model';
import { EncounterModel } from '../encounters/encounter.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { ClinicModel } from '../clinics/clinic.model';
import logger from '../../utils/logger';

interface PDFGenerationOptions {
  patientId: string;
  clinicId: string;
}

/**
 * Generate a PDF medical record for a patient
 * Returns a readable stream that can be piped to the response
 */
export async function generatePatientPDF(options: PDFGenerationOptions): Promise<PassThrough> {
  const { patientId, clinicId } = options;

  logger.info({ patientId, clinicId }, 'Generating patient PDF export');

  // Fetch all required data
  const [patient, clinic, encounters, payments] = await Promise.all([
    PatientModel.findOne({ _id: patientId, clinicId, isActive: true }),
    ClinicModel.findById(clinicId),
    EncounterModel.find({ patientId, clinicId, isActive: true })
      .populate('attendingDoctorId', 'firstName lastName')
      .populate('prescriptions.prescribedBy', 'firstName lastName')
      .sort({ createdAt: -1 }),
    PaymentRecordModel.find({ patientId, clinicId })
      .sort({ createdAt: -1 })
      .limit(50),
  ]);

  if (!patient) {
    throw new Error('Patient not found');
  }

  if (!clinic) {
    throw new Error('Clinic not found');
  }

  // Create PDF document
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `Medical Record - ${patient.firstName} ${patient.lastName}`,
      Author: clinic.name,
      Subject: 'Patient Medical Record',
      Keywords: 'medical record, patient, healthcare',
    },
  });

  // Create a pass-through stream to pipe the PDF
  const stream = new PassThrough();
  doc.pipe(stream);

  // Add watermark
  doc.save();
  doc.opacity(0.1);
  doc.fontSize(60);
  doc.text('CONFIDENTIAL - MEDICAL RECORD', 50, 400, {
    align: 'center',
    angle: 45,
  });
  doc.restore();

  // Header - Clinic Information
  doc.fontSize(20).text(clinic.name, { align: 'center' });
  doc.fontSize(10).text(clinic.address || 'Address not available', { align: 'center' });
  doc.fontSize(10).text(clinic.contactNumber || 'Contact not available', { align: 'center' });
  doc.moveDown(2);

  // Title
  doc.fontSize(16).text('PATIENT MEDICAL RECORD', { align: 'center', underline: true });
  doc.moveDown(2);

  // Patient Demographics
  doc.fontSize(14).text('Patient Information', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10);
  doc.text(`Patient ID: ${patient.systemId}`);
  doc.text(`Name: ${patient.firstName} ${patient.lastName}`);
  doc.text(`Date of Birth: ${patient.dateOfBirth.toLocaleDateString()}`);
  doc.text(`Sex: ${patient.sex}`);
  doc.text(`Contact: ${patient.contactNumber || 'N/A'}`);
  doc.text(`Address: ${patient.address || 'N/A'}`);
  doc.moveDown(2);

  // Encounters Section
  doc.fontSize(14).text('Medical Encounters', { underline: true });
  doc.moveDown(0.5);

  if (encounters.length === 0) {
    doc.fontSize(10).text('No encounters recorded', { italics: true });
  } else {
    encounters.forEach((encounter, index) => {
      if (index > 0) doc.moveDown(1);

      doc.fontSize(12).text(`Encounter ${index + 1} - ${encounter.createdAt.toLocaleDateString()}`, {
        underline: true,
      });
      doc.fontSize(10);
      doc.text(`Doctor: ${(encounter.attendingDoctorId as any)?.firstName || 'Unknown'} ${(encounter.attendingDoctorId as any)?.lastName || ''}`);
      doc.text(`Chief Complaint: ${encounter.chiefComplaint}`);
      doc.text(`Status: ${encounter.status}`);

      if (encounter.diagnosis && encounter.diagnosis.length > 0) {
        doc.text('Diagnosis:');
        encounter.diagnosis.forEach((diag) => {
          doc.text(`  - ${diag.description} (${diag.code})${diag.isPrimary ? ' [Primary]' : ''}`);
        });
      }

      if (encounter.treatmentPlan) {
        doc.text(`Treatment Plan: ${encounter.treatmentPlan}`);
      }

      if (encounter.prescriptions && encounter.prescriptions.length > 0) {
        doc.text('Prescriptions:');
        encounter.prescriptions.forEach((rx) => {
          doc.text(`  - ${rx.drugName} ${rx.dosage}, ${rx.frequency} for ${rx.duration}`);
          if (rx.instructions) {
            doc.text(`    Instructions: ${rx.instructions}`);
          }
        });
      }

      if (encounter.aiSummary) {
        doc.text(`AI Summary: ${encounter.aiSummary}`);
      }

      // Add page break if needed
      if (doc.y > 700 && index < encounters.length - 1) {
        doc.addPage();
      }
    });
  }

  doc.moveDown(2);

  // Payment History Section
  if (doc.y > 650) {
    doc.addPage();
  }

  doc.fontSize(14).text('Payment History', { underline: true });
  doc.moveDown(0.5);

  if (payments.length === 0) {
    doc.fontSize(10).text('No payments recorded', { italics: true });
  } else {
    doc.fontSize(10);
    payments.slice(0, 20).forEach((payment, index) => {
      doc.text(
        `${index + 1}. ${payment.createdAt.toLocaleDateString()} - ${payment.amountXlm} XLM - ${payment.status}`
      );
    });

    if (payments.length > 20) {
      doc.text(`... and ${payments.length - 20} more payments`);
    }
  }

  // Footer
  doc.moveDown(2);
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.fontSize(8);
    doc.text(
      `Generated on ${new Date().toLocaleString()} | Page ${i + 1} of ${pageCount}`,
      50,
      doc.page.height - 50,
      { align: 'center' }
    );
  }

  // Finalize the PDF
  doc.end();

  logger.info({ patientId, encounterCount: encounters.length }, 'PDF generation completed');

  return stream;
}
