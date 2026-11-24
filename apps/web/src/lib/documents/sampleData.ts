import type {
  AccessLevel,
  AccessLogEntry,
  DocumentAnnotation,
  DocumentRecord,
  DocumentType,
} from './types';

/**
 * Demo document library. The page prefers `/api/v1/documents` and falls back to
 * this dataset (clearly labelled in the UI) when the API is unavailable.
 */

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  discharge_summary: 'Discharge summary',
  consent_form: 'Consent form',
  referral_letter: 'Referral letter',
  lab_report: 'Lab report',
  imaging: 'Imaging',
  identity_document: 'Identity document',
  other: 'Other',
};

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  clinic_staff: 'Clinic staff',
  restricted: 'Restricted',
  patient_visible: 'Patient visible',
};

export const SAMPLE_DOCUMENTS: DocumentRecord[] = [
  {
    id: 'doc-1',
    patientId: 'p-1001',
    fileName: 'discharge-summary-2026-08-21.pdf',
    documentType: 'discharge_summary',
    mimeType: 'application/pdf',
    sizeBytes: 284991,
    pageCount: 3,
    currentVersion: 2,
    uploadedAt: '2026-08-21T18:12:00.000Z',
    uploadedBy: 'Dr. Ngozi Eze',
    accessLevel: 'clinic_staff',
    summary: 'Inpatient discharge summary for the August 2026 admission.',
    textLines: [
      'Discharge summary. Patient: Ada Okafor. Admission: 12 August 2026. Discharge: 21 August 2026. Diagnoses: type 2 diabetes mellitus, hypertension, atrial fibrillation.',
      'Procedures: insulin regimen adjusted, anticoagulation continued. Medications on discharge: metformin 500 mg twice daily, lisinopril 10 mg once daily, warfarin 5 mg once daily.',
      'Follow-up: medical clinic on 1 October 2026. INR monitoring weekly. Contact the ward on +234 800 000 0000 if symptoms worsen.',
    ],
    versions: [
      {
        id: 'doc-1-v1',
        version: 1,
        createdAt: '2026-08-21T16:40:00.000Z',
        createdBy: 'Dr. Ngozi Eze',
        sizeBytes: 281004,
        changeNote: 'Initial upload from the ward printer.',
      },
      {
        id: 'doc-1-v2',
        version: 2,
        createdAt: '2026-08-22T09:05:00.000Z',
        createdBy: 'Dr. Ngozi Eze',
        sizeBytes: 284991,
        changeNote: 'Corrected the follow-up date after the clinic moved.',
      },
    ],
  },
  {
    id: 'doc-2',
    patientId: 'p-1001',
    fileName: 'endoscopy-consent-2026-09-03.pdf',
    documentType: 'consent_form',
    mimeType: 'application/pdf',
    sizeBytes: 96420,
    pageCount: 2,
    currentVersion: 1,
    uploadedAt: '2026-09-03T11:22:00.000Z',
    uploadedBy: 'Nurse B. Okeke',
    accessLevel: 'patient_visible',
    summary: 'Signed consent for the September endoscopy.',
    textLines: [
      'Patient consent form. Procedure: endoscopy. Clinician: Dr. Ngozi Eze. Risks discussed: bleeding, perforation, sedation-related events.',
      'The patient confirms the information was explained and questions were answered. Signed by Ada Okafor on 3 September 2026. Witnessed by Nurse B. Okeke.',
    ],
    versions: [
      {
        id: 'doc-2-v1',
        version: 1,
        createdAt: '2026-09-03T11:22:00.000Z',
        createdBy: 'Nurse B. Okeke',
        sizeBytes: 96420,
        changeNote: 'Scanned signed consent form.',
      },
    ],
  },
  {
    id: 'doc-3',
    patientId: 'p-1001',
    fileName: 'critical-lab-report-2026-09-15.pdf',
    documentType: 'lab_report',
    mimeType: 'application/pdf',
    sizeBytes: 141233,
    pageCount: 2,
    currentVersion: 2,
    uploadedAt: '2026-09-15T16:30:00.000Z',
    uploadedBy: 'HealthWatchers Clinic Laboratory',
    accessLevel: 'restricted',
    summary: 'Critical laboratory report with the acknowledged action plan.',
    textLines: [
      'Laboratory report. Haemoglobin 6.8 g/dL (reference 12-16). INR 5.4 (reference 0.8-1.2). These results were flagged critical and acknowledged by Dr. Samuel Adeyemi.',
      'Action taken: anticoagulation withheld, vitamin K considered, patient admitted for review. Repeat INR requested for 18 September 2026.',
    ],
    versions: [
      {
        id: 'doc-3-v1',
        version: 1,
        createdAt: '2026-09-15T16:20:00.000Z',
        createdBy: 'HealthWatchers Clinic Laboratory',
        sizeBytes: 138004,
        changeNote: 'Auto-released preliminary report.',
      },
      {
        id: 'doc-3-v2',
        version: 2,
        createdAt: '2026-09-15T16:30:00.000Z',
        createdBy: 'Dr. Samuel Adeyemi',
        sizeBytes: 141233,
        changeNote: 'Corrected report with the acknowledged action plan.',
      },
    ],
  },
  {
    id: 'doc-4',
    patientId: 'p-1001',
    fileName: 'chest-xray-2026-07-02.png',
    documentType: 'imaging',
    mimeType: 'image/png',
    sizeBytes: 2411776,
    pageCount: 1,
    currentVersion: 1,
    uploadedAt: '2026-07-02T14:05:00.000Z',
    uploadedBy: 'Radiology',
    accessLevel: 'clinic_staff',
    summary: 'Chest radiograph requested after a productive cough.',
    textLines: [
      'Radiology impression: no acute cardiopulmonary abnormality. Cardiomediastinal silhouette is normal.',
    ],
    versions: [
      {
        id: 'doc-4-v1',
        version: 1,
        createdAt: '2026-07-02T14:05:00.000Z',
        createdBy: 'Radiology',
        sizeBytes: 2411776,
        changeNote: 'Uploaded from the PACS export.',
      },
    ],
  },
];

export const SAMPLE_ANNOTATIONS: DocumentAnnotation[] = [
  {
    id: 'ann-sample-1',
    documentId: 'doc-1',
    page: 2,
    type: 'highlight',
    text: '',
    quote: 'warfarin 5 mg once daily',
    createdAt: '2026-08-22T09:12:00.000Z',
    createdBy: 'Dr. Ngozi Eze',
  },
  {
    id: 'ann-sample-2',
    documentId: 'doc-1',
    page: 3,
    type: 'note',
    text: 'Book the INR slot before the clinic appointment.',
    quote: '',
    createdAt: '2026-08-22T09:15:00.000Z',
    createdBy: 'Dr. Ngozi Eze',
  },
  {
    id: 'ann-sample-3',
    documentId: 'doc-3',
    page: 2,
    type: 'highlight',
    text: '',
    quote: 'anticoagulation withheld',
    createdAt: '2026-09-15T16:45:00.000Z',
    createdBy: 'Dr. Samuel Adeyemi',
  },
];

export const SAMPLE_ACCESS_LOG: AccessLogEntry[] = [
  {
    id: 'acc-sample-1',
    documentId: 'doc-1',
    documentName: 'discharge-summary-2026-08-21.pdf',
    action: 'viewed',
    at: '2026-08-22T08:50:00.000Z',
    actor: 'Dr. Ngozi Eze',
    detail: 'Opened version 2, page 1.',
  },
  {
    id: 'acc-sample-2',
    documentId: 'doc-1',
    documentName: 'discharge-summary-2026-08-21.pdf',
    action: 'searched',
    at: '2026-08-22T08:54:00.000Z',
    actor: 'Dr. Ngozi Eze',
    detail: 'Searched for “warfarin”.',
  },
  {
    id: 'acc-sample-3',
    documentId: 'doc-1',
    documentName: 'discharge-summary-2026-08-21.pdf',
    action: 'printed',
    at: '2026-08-22T09:02:00.000Z',
    actor: 'Nurse B. Okeke',
    detail: 'Printed pages 1-3.',
  },
  {
    id: 'acc-sample-4',
    documentId: 'doc-3',
    documentName: 'critical-lab-report-2026-09-15.pdf',
    action: 'viewed',
    at: '2026-09-15T16:40:00.000Z',
    actor: 'Dr. Samuel Adeyemi',
    detail: 'Opened version 2, page 1.',
  },
  {
    id: 'acc-sample-5',
    documentId: 'doc-3',
    documentName: 'critical-lab-report-2026-09-15.pdf',
    action: 'downloaded',
    at: '2026-09-15T16:52:00.000Z',
    actor: 'Dr. Samuel Adeyemi',
    detail: 'Downloaded the corrected report.',
  },
];

export function getSampleDocuments(patientId: string): DocumentRecord[] {
  return SAMPLE_DOCUMENTS.filter((document) => document.patientId === patientId);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

