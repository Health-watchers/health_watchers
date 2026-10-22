/**
 * Issue #1316 — secure document viewer domain types.
 * Optional data is modelled as `T | null` so these types satisfy the monorepo
 * `exactOptionalPropertyTypes` setting.
 */

export type DocumentType =
  | 'discharge_summary'
  | 'consent_form'
  | 'referral_letter'
  | 'lab_report'
  | 'imaging'
  | 'identity_document'
  | 'other';

/** Every action the viewer records in the audit trail. */
export type ViewerAction =
  | 'viewed'
  | 'page_changed'
  | 'zoomed'
  | 'rotated'
  | 'searched'
  | 'downloaded'
  | 'printed'
  | 'annotated'
  | 'annotation_deleted'
  | 'version_restored';

export type AccessLevel = 'clinic_staff' | 'restricted' | 'patient_visible';

export type AnnotationType = 'highlight' | 'note';

export interface DocumentVersion {
  id: string;
  version: number;
  createdAt: string;
  createdBy: string;
  sizeBytes: number;
  changeNote: string;
}

export interface DocumentAnnotation {
  id: string;
  documentId: string;
  page: number;
  type: AnnotationType;
  text: string;
  quote: string;
  createdAt: string;
  createdBy: string;
}

export interface AccessLogEntry {
  id: string;
  documentId: string;
  documentName: string;
  action: ViewerAction;
  at: string;
  actor: string;
  detail: string;
}

export interface SearchMatch {
  page: number;
  lineNumber: number;
  line: string;
  /** The line with the surrounding context for display. */
  snippet: string;
  matchStart: number;
  matchLength: number;
}

export interface DocumentRecord {
  id: string;
  patientId: string;
  fileName: string;
  documentType: DocumentType;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  currentVersion: number;
  uploadedAt: string;
  uploadedBy: string;
  accessLevel: AccessLevel;
  summary: string;
  /** Extracted text, one entry per page (index + 1 is the page number). */
  textLines: string[];
  versions: DocumentVersion[];
}

export interface AccessSummary {
  total: number;
  viewed: number;
  downloaded: number;
  printed: number;
  searches: number;
  annotations: number;
  lastAccessedAt: string | null;
  distinctActors: number;
}
