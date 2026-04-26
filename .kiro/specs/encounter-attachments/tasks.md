# Implementation Plan: Encounter Attachments

## Overview

Implement clinical document attachment support end-to-end: MongoDB model, API endpoints (upload, download, list, delete), S3 storage with server-side encryption, audit logging, and a drag-and-drop frontend with image preview and PDF viewer integrated into the encounter detail page.

## Tasks

- [ ] 1. Extend audit model and storage service
  - [ ] 1.1 Add `ATTACHMENT_DOWNLOAD` and `ATTACHMENT_DELETE` to the `AuditAction` union type and enum array in `apps/api/src/modules/audit/audit.model.ts`
    - _Requirements: 3.5_
  - [ ] 1.2 Extend `uploadFile` in `apps/api/src/modules/documents/storage.service.ts` to accept an optional `serverSideEncryption` field and pass it as `ServerSideEncryption` in the `PutObjectCommand`; add a `deleteFile(storageKey: string)` function using `DeleteObjectCommand`
    - _Requirements: 2.7, 5.3_

- [ ] 2. Implement the Attachment data model
  - [ ] 2.1 Create `apps/api/src/modules/attachments/attachment.model.ts` with the `IAttachment` interface and Mongoose schema including all fields from Requirements 1.1–1.13, the `AttachmentCategory` enum, compound indexes `{ encounterId, isDeleted, createdAt }`, `{ patientId, clinicId, isDeleted, createdAt }`, and `{ clinicId }`
    - _Requirements: 1.1–1.13_
  - [ ]* 2.2 Write property test for attachment model field completeness
    - **Property 3: Upload round-trip — metadata consistency**
    - **Validates: Requirements 1.1–1.13, 2.7, 2.8**

- [ ] 3. Implement the malware scanner stub
  - [ ] 3.1 Create `apps/api/src/modules/attachments/malware.service.ts` exporting `scanBuffer(buffer: Buffer): Promise<{ clean: boolean }>` that always returns `{ clean: true }`
    - _Requirements: 2.5, 2.6_

- [ ] 4. Implement attachment service
  - [ ] 4.1 Create `apps/api/src/modules/attachments/attachment.service.ts` with `upload()` method: validate MIME type against `{application/pdf, image/jpeg, image/png, application/dicom}` and extension against `{.pdf, .jpg, .jpeg, .png, .dcm}`, call `scanBuffer`, build storage key `attachments/{clinicId}/{patientId}/{uuid}{ext}`, call `uploadFile` with `serverSideEncryption: 'AES256'`, create and return `AttachmentModel` document
    - _Requirements: 2.1–2.10_
  - [ ]* 4.2 Write property test for invalid file type rejection
    - **Property 1: Invalid file type rejection**
    - **Validates: Requirements 2.2, 2.3**
  - [ ]* 4.3 Write property test for file size rejection
    - **Property 2: File size rejection**
    - **Validates: Requirements 2.4**
  - [ ]* 4.4 Write property test for upload round-trip metadata consistency
    - **Property 3: Upload round-trip — metadata consistency**
    - **Validates: Requirements 2.7, 2.8**
  - [ ] 4.5 Add `getDownloadUrl()` method to attachment service: look up attachment, check `isDeleted` and `clinicId`, call `storage.service.getDownloadUrl()`, call `auditLog` with `ATTACHMENT_DOWNLOAD` action including `attachmentId`, `userId`, `clinicId`, `patientId` in metadata, return the pre-signed URL
    - _Requirements: 3.1–3.7_
  - [ ]* 4.6 Write property test for download audit log invariant
    - **Property 4: Download audit log invariant**
    - **Validates: Requirements 3.5**
  - [ ]* 4.7 Write property test for pre-signed URL expiry
    - **Property 5: Pre-signed URL expiry**
    - **Validates: Requirements 3.4**
  - [ ] 4.8 Add `listByEncounter()` and `listByPatient()` methods: query `AttachmentModel` with `{ encounterId/patientId, clinicId, isDeleted: false }`, apply optional `category` filter, use `paginate()` utility with `{ createdAt: -1 }` sort, verify encounter/patient belongs to clinic (return 404 if not)
    - _Requirements: 4.1–4.7_
  - [ ]* 4.9 Write property test for listing never returns deleted attachments
    - **Property 6: Listing never returns deleted attachments**
    - **Validates: Requirements 4.1, 4.2**
  - [ ]* 4.10 Write property test for category filter correctness
    - **Property 7: Category filter correctness**
    - **Validates: Requirements 4.3**
  - [ ]* 4.11 Write property test for pagination invariant
    - **Property 8: Pagination invariant**
    - **Validates: Requirements 4.4**
  - [ ]* 4.12 Write property test for sort order invariant
    - **Property 9: Sort order invariant**
    - **Validates: Requirements 4.5**
  - [ ] 4.13 Add `deleteAttachment()` method: look up attachment and verify clinic ownership, call `storage.service.deleteFile()`, update document with `{ isDeleted: true, deletedAt: new Date(), deletedBy: userId }`, call `auditLog` with `ATTACHMENT_DELETE`
    - _Requirements: 5.1–5.6_
  - [ ]* 4.14 Write property test for deletion marks all soft-delete fields
    - **Property 10: Deletion marks all soft-delete fields**
    - **Validates: Requirements 5.3, 5.4**

- [ ] 5. Checkpoint — Ensure all service-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement the attachments controller and wire routes
  - [ ] 6.1 Create `apps/api/src/modules/attachments/attachment.validation.ts` with Zod schemas for upload body (`patientId`, `clinicId`, `category`, optional `encounterId`), list query (`page`, `limit`, `category`), and id param
    - _Requirements: 2.1, 4.3, 4.4_
  - [ ] 6.2 Create `apps/api/src/modules/attachments/attachments.controller.ts` with an Express Router implementing all five endpoints: `POST /`, `GET /:id/download`, `GET /` (not used directly — see encounter/patient routes), `DELETE /:id`. Apply `authenticate`, `requireRoles`, multer middleware (memory storage, 20 MB limit, MIME+extension filter), and `validate` middleware. Map multer errors to 400/413 responses. Return 302 redirect for download. Do not include `storageKey` in response objects.
    - _Requirements: 2.1–2.10, 3.1–3.7, 5.1–5.6_
  - [ ] 6.3 Add encounter attachment list route to `apps/api/src/modules/encounters/encounters.controller.ts`: `GET /encounters/:id/attachments` calling `attachmentService.listByEncounter()`
    - _Requirements: 4.1_
  - [ ] 6.4 Add patient attachment list route to `apps/api/src/modules/patients/patients.controller.ts`: `GET /patients/:id/attachments` calling `attachmentService.listByPatient()`
    - _Requirements: 4.2_
  - [ ] 6.5 Register `attachmentRoutes` in `apps/api/src/app.ts` at `/api/v1/attachments`, and update the Content-Type middleware to allow `multipart/form-data` on the upload route
    - _Requirements: 2.1_

- [ ] 7. Checkpoint — Ensure all API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement frontend API client and query hooks
  - [ ] 8.1 Add `attachments` key to `apps/web/src/lib/queryKeys.ts`: `byEncounter(encounterId)`, `byPatient(patientId)`
    - _Requirements: 6.6, 7.5_
  - [ ] 8.2 Create `apps/web/src/lib/queries/attachments.ts` with:
    - `useEncounterAttachments(encounterId)` — React Query `useQuery` calling `GET /api/v1/encounters/:id/attachments`
    - `useUploadAttachment()` — `useMutation` posting `multipart/form-data` to `POST /api/v1/attachments`, invalidates encounter attachments query on success
    - `useDeleteAttachment()` — `useMutation` calling `DELETE /api/v1/attachments/:id`, invalidates encounter attachments query on success
    - `getAttachmentDownloadUrl(id)` — plain async function calling `GET /api/v1/attachments/:id/download` and returning the redirect URL
    - _Requirements: 6.6, 7.1–7.5_

- [ ] 9. Implement frontend attachment components
  - [ ] 9.1 Create `apps/web/src/components/encounters/attachments/AttachmentUploader.tsx`: drag-and-drop zone using HTML5 drag events, file input fallback, client-side validation (MIME type and 20 MB size check before calling `useUploadAttachment`), upload progress via `XMLHttpRequest` with `onprogress` event, inline error display on validation failure or upload error
    - _Requirements: 6.1–6.7_
  - [ ]* 9.2 Write unit tests for AttachmentUploader client-side validation
    - **Property 12: Client-side validation prevents invalid uploads**
    - **Validates: Requirements 6.3, 6.4**
  - [ ] 9.3 Create `apps/web/src/components/encounters/attachments/ImagePreview.tsx`: modal component that accepts a `src` URL and renders an `<img>` tag with alt text derived from `originalName`
    - _Requirements: 7.2_
  - [ ] 9.4 Create `apps/web/src/components/encounters/attachments/PdfViewer.tsx`: component that renders an `<iframe>` with the pre-signed URL as `src` for PDF viewing
    - _Requirements: 7.3_
  - [ ] 9.5 Create `apps/web/src/components/encounters/attachments/AttachmentList.tsx`: renders each attachment with `originalName`, `category`, `fileSize` (formatted), and `createdAt` (formatted); shows image preview button for `image/jpeg` and `image/png`; shows PDF viewer button for `application/pdf`; shows delete button (CLINIC_ADMIN only) with confirmation dialog before calling `useDeleteAttachment`
    - _Requirements: 7.1–7.5_
  - [ ]* 9.6 Write unit tests for AttachmentList rendering
    - **Property 11: Attachment list UI reflects server state**
    - **Validates: Requirements 6.6, 7.5**

- [ ] 10. Integrate attachment components into EncounterDetail
  - [ ] 10.1 Update `apps/web/src/components/encounters/EncounterDetail.tsx` to import and render `AttachmentUploader` and `AttachmentList` components, passing `encounterId` and `patientId` as props; add an "Attachments" section below the existing content sections
    - _Requirements: 6.1, 7.1_

- [ ] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `storageKey` must never be returned in API responses — it is an internal field
- The malware scanner in `malware.service.ts` is a stub; replace with ClamAV integration when ready
- Property tests use `fast-check` (add as dev dependency: `npm install --save-dev fast-check` in `apps/api`)
- The Content-Type middleware in `app.ts` currently rejects non-JSON bodies on POST — it must be updated to allow `multipart/form-data` specifically for the attachment upload route
- The existing `storage.service.ts` in the `documents` module is shared; changes to it affect both modules — consider moving it to a shared location or duplicating it for the attachments module
