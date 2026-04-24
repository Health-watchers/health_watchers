/**
 * File Upload Security Configuration (Issue #351)
 *
 * This module provides a secure multer configuration stub for future file upload endpoints.
 * When file uploads are added (e.g., patient photos, lab results), use this configuration.
 *
 * Usage:
 *   import { documentUpload, imageUpload } from '@api/middlewares/upload.middleware';
 *   router.post('/upload', documentUpload.single('file'), handler);
 */

// NOTE: Install multer before enabling: npm install multer @types/multer
// import multer from 'multer';
// import path from 'path';

/** Allowed MIME types for document uploads */
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

/** Allowed MIME types for image uploads */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Max file sizes */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; //  5 MB

/*
 * Uncomment and use when multer is installed:
 *
 * const storage = multer.memoryStorage(); // Never use diskStorage — store in S3/object storage
 *
 * function fileFilter(allowedTypes: readonly string[]) {
 *   return (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
 *     if (allowedTypes.includes(file.mimetype)) {
 *       cb(null, true);
 *     } else {
 *       cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`));
 *     }
 *   };
 * }
 *
 * export const documentUpload = multer({
 *   storage,
 *   limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
 *   fileFilter: fileFilter(ALLOWED_DOCUMENT_TYPES),
 * });
 *
 * export const imageUpload = multer({
 *   storage,
 *   limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
 *   fileFilter: fileFilter(ALLOWED_IMAGE_TYPES),
 * });
 *
 * // ClamAV malware scan stub — integrate with clamscan or clamav-js
 * export async function scanForMalware(buffer: Buffer): Promise<boolean> {
 *   // TODO: integrate ClamAV: const result = await clamscan.scanBuffer(buffer);
 *   // return result.isInfected === false;
 *   return true; // stub: assume clean
 * }
 *
 * // After upload, store in S3 and return a pre-signed URL:
 * // const s3Key = `uploads/${clinicId}/${Date.now()}-${file.originalname}`;
 * // await s3.putObject({ Bucket: process.env.S3_BUCKET, Key: s3Key, Body: file.buffer }).promise();
 * // const url = await s3.getSignedUrlPromise('getObject', { Bucket, Key: s3Key, Expires: 3600 });
 */
