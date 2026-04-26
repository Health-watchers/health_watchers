# Requirements Document

## Introduction

This feature adds clinical document attachment support to the Health Watchers platform. Doctors need to attach files to encounters — scanned lab reports, X-ray images, referral letters, and consent forms. The system provides secure file upload to S3 with server-side encryption, pre-signed URL downloads with audit logging, attachment listing by encounter or patient, and a drag-and-drop frontend with image preview and PDF viewing.

## Glossary

- **Attachment**: A clinical document file associated with an encounter and/or patient, stored in S3 and tracked in the `Attachment` collection.
- **Attachment_Category**: One of `lab_report`, `imaging`, `referral`, `consent`, or `other`, classifying the clinical purpose of an attachment.
- **Storage_Key**: The S3 object key used to locate the file in the configured S3 bucket.
- **Pre_Signed_URL**: A time-limited S3 URL granting temporary read access to a stored file without requiring AWS credentials.
- **Malware_Scanner**: A stub service that inspects uploaded file buffers and returns a pass/fail result before the file is persisted to S3.
- **Attachment_Uploader**: The API component responsible for receiving multipart uploads, validating, scanning, and storing attachments.
- **Attachment_Downloader**: The API component responsible for generating pre-signed URLs and logging download events.
- **Attachment_Lister**: The API component responsible for returning paginated attachment lists scoped to an encounter or patient.
- **Attachment_Deleter**: The API component responsible for removing attachments from both S3 and the database.
- **Audit_Log**: The immutable record of system actions written via the existing `auditLog` service.
- **Doctor**: A user with the `DOCTOR` role.
- **Clinic_Admin**: A user with the `CLINIC_ADMIN` role.
- **Nurse**: A user with the `NURSE` role.

---

## Requirements

### Requirement 1: Attachment Data Model

**User Story:** As a developer, I want a well-defined attachment data model, so that attachment metadata is stored consistently and can be queried by encounter, patient, or clinic.

#### Acceptance Criteria

1. THE Attachment SHALL include an `encounterId` field referencing an `Encounter` document (optional, for encounter-scoped attachments).
2. THE Attachment SHALL include a `patientId` field referencing a `Patient` document (required).
3. THE Attachment SHALL include a `clinicId` field referencing a `Clinic` document (required).
4. THE Attachment SHALL include an `uploadedBy` field referencing the `User` who uploaded the file (required).
5. THE Attachment SHALL include a `fileName` field storing the sanitized storage filename (required).
6. THE Attachment SHALL include an `originalName` field storing the original filename as provided by the uploader (required).
7. THE Attachment SHALL include a `mimeType` field storing the MIME type of the uploaded file (required).
8. THE Attachment SHALL include a `fileSize` field storing the file size in bytes (required).
9. THE Attachment SHALL include a `storageKey` field storing the S3 object key (required).
10. THE Attachment SHALL include a `category` field accepting exactly one of: `lab_report`, `imaging`, `referral`, `consent`, or `other` (required).
11. THE Attachment SHALL include an `isDeleted` boolean field defaulting to `false`.
12. THE Attachment SHALL include a `deletedAt` date field populated when the attachment is deleted.
13. THE Attachment SHALL include a `deletedBy` field referencing the `User` who deleted the attachment.

---

### Requirement 2: File Upload Endpoint

**User Story:** As a doctor, I want to upload clinical documents to an encounter, so that all relevant files are stored securely alongside the clinical record.

#### Acceptance Criteria

1. WHEN a `POST /api/v1/attachments` request is received with a `multipart/form-data` body, THE Attachment_Uploader SHALL accept the file and associated metadata fields (`encounterId`, `patientId`, `clinicId`, `category`).
2. WHEN the uploaded file's MIME type is not one of `application/pdf`, `image/jpeg`, `image/png`, or `application/dicom`, THE Attachment_Uploader SHALL reject the request with a 400 status and an `InvalidFileType` error.
3. WHEN the uploaded file's extension is not one of `.pdf`, `.jpg`, `.jpeg`, `.png`, or `.dcm`, THE Attachment_Uploader SHALL reject the request with a 400 status and an `InvalidFileType` error.
4. WHEN the uploaded file exceeds 20 MB, THE Attachment_Uploader SHALL reject the request with a 413 status and a `FileTooLarge` error.
5. WHEN the file passes type and size validation, THE Attachment_Uploader SHALL pass the file buffer through the Malware_Scanner before uploading to S3.
6. IF the Malware_Scanner returns a positive result, THEN THE Attachment_Uploader SHALL reject the request with a 422 status and a `MalwareDetected` error, and SHALL NOT store the file.
7. WHEN the file passes all validation and scanning, THE Attachment_Uploader SHALL upload the file to S3 using server-side encryption (`AES256`) with a storage key in the format `attachments/{clinicId}/{patientId}/{uuid}{ext}`.
8. WHEN the upload to S3 succeeds, THE Attachment_Uploader SHALL create an `Attachment` document and return it with a 201 status.
9. WHEN the `encounterId` is provided, THE Attachment_Uploader SHALL verify the encounter belongs to the authenticated clinic before saving, and return a 404 if it does not.
10. THE Attachment_Uploader SHALL require the requesting user to have the `DOCTOR`, `NURSE`, or `CLINIC_ADMIN` role.

---

### Requirement 3: Secure Download Endpoint

**User Story:** As a doctor, I want to securely download an attachment, so that I can view clinical documents without exposing permanent S3 URLs.

#### Acceptance Criteria

1. WHEN a `GET /api/v1/attachments/:id/download` request is received, THE Attachment_Downloader SHALL look up the attachment by ID.
2. IF the attachment does not exist or `isDeleted` is `true`, THEN THE Attachment_Downloader SHALL return a 404 response.
3. IF the attachment's `clinicId` does not match the authenticated user's clinic, THEN THE Attachment_Downloader SHALL return a 403 response.
4. WHEN the attachment is found and the user is authorized, THE Attachment_Downloader SHALL generate a Pre_Signed_URL for the S3 object that expires in 15 minutes.
5. WHEN the Pre_Signed_URL is generated, THE Attachment_Downloader SHALL write an `ATTACHMENT_DOWNLOAD` entry to the Audit_Log including `attachmentId`, `userId`, `clinicId`, and `patientId`.
6. WHEN the Pre_Signed_URL is generated, THE Attachment_Downloader SHALL return a redirect (302) to the Pre_Signed_URL.
7. THE Attachment_Downloader SHALL require the requesting user to have the `DOCTOR`, `NURSE`, or `CLINIC_ADMIN` role.

---

### Requirement 4: Attachment List Endpoints

**User Story:** As a doctor, I want to list all attachments for an encounter or a patient, so that I can quickly find relevant clinical documents.

#### Acceptance Criteria

1. WHEN a `GET /api/v1/encounters/:id/attachments` request is received, THE Attachment_Lister SHALL return all non-deleted attachments associated with the specified encounter, scoped to the authenticated clinic.
2. WHEN a `GET /api/v1/patients/:id/attachments` request is received, THE Attachment_Lister SHALL return all non-deleted attachments associated with the specified patient, scoped to the authenticated clinic.
3. THE Attachment_Lister SHALL support a `category` query parameter to filter results by `Attachment_Category`.
4. THE Attachment_Lister SHALL support `page` and `limit` query parameters for pagination, with a default limit of 20 and a maximum of 100.
5. THE Attachment_Lister SHALL sort results by `createdAt` descending (most recent first).
6. THE Attachment_Lister SHALL require the requesting user to have the `DOCTOR`, `NURSE`, or `CLINIC_ADMIN` role.
7. IF the encounter or patient does not belong to the authenticated clinic, THEN THE Attachment_Lister SHALL return a 404 response.

---

### Requirement 5: Attachment Deletion

**User Story:** As a clinic administrator, I want to delete an attachment, so that incorrect or sensitive files can be permanently removed from storage.

#### Acceptance Criteria

1. WHEN a `DELETE /api/v1/attachments/:id` request is received, THE Attachment_Deleter SHALL verify the attachment exists and belongs to the authenticated clinic.
2. IF the attachment does not exist or belongs to a different clinic, THEN THE Attachment_Deleter SHALL return a 404 response.
3. WHEN the attachment is found, THE Attachment_Deleter SHALL delete the file from S3 using the `storageKey`.
4. WHEN the S3 deletion succeeds, THE Attachment_Deleter SHALL mark the attachment as deleted by setting `isDeleted` to `true`, `deletedAt` to the current timestamp, and `deletedBy` to the requesting user's ID.
5. THE Attachment_Deleter SHALL require the requesting user to have the `CLINIC_ADMIN` or `SUPER_ADMIN` role.
6. WHEN deletion succeeds, THE Attachment_Deleter SHALL return a 200 response confirming the deletion.

---

### Requirement 6: Frontend Drag-and-Drop Upload

**User Story:** As a doctor, I want to drag and drop files onto the encounter form, so that I can attach clinical documents without navigating away from the encounter.

#### Acceptance Criteria

1. WHEN the encounter detail page is displayed, THE Encounter_Form SHALL render an `AttachmentUploader` component with a drag-and-drop zone.
2. WHEN a user drags a file over the drop zone, THE Encounter_Form SHALL provide visual feedback indicating the drop target is active.
3. WHEN a user drops or selects a file, THE Encounter_Form SHALL validate the file type (PDF, JPEG, PNG, DICOM) and size (max 20 MB) on the client before initiating the upload.
4. IF client-side validation fails, THEN THE Encounter_Form SHALL display an inline error message and SHALL NOT initiate the upload request.
5. WHEN a valid file is selected, THE Encounter_Form SHALL display an upload progress indicator while the upload is in progress.
6. WHEN the upload completes successfully, THE Encounter_Form SHALL add the new attachment to the attachment list without requiring a full page reload.
7. WHEN the upload fails, THE Encounter_Form SHALL display an error message describing the failure reason.

---

### Requirement 7: Attachment List Display with Preview

**User Story:** As a doctor, I want to view and preview attachments on the encounter page, so that I can quickly review clinical documents without downloading them.

#### Acceptance Criteria

1. WHEN the encounter detail page is displayed, THE Attachment_List_Component SHALL render all non-deleted attachments for the encounter, showing `originalName`, `category`, `fileSize`, and `createdAt` for each.
2. WHEN an attachment with MIME type `image/jpeg` or `image/png` is selected, THE Attachment_List_Component SHALL display an inline image preview using the pre-signed download URL.
3. WHEN an attachment with MIME type `application/pdf` is selected, THE Attachment_List_Component SHALL open a PDF viewer using the pre-signed download URL.
4. WHEN a delete action is triggered on an attachment, THE Attachment_List_Component SHALL prompt the user for confirmation before calling the delete endpoint.
5. WHEN the delete is confirmed and succeeds, THE Attachment_List_Component SHALL remove the attachment from the list without requiring a full page reload.
