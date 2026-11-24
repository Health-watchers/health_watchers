/**
 * Document preview generation — Issue #1247
 *
 * Generates a small JPEG thumbnail for image documents using `sharp` (already a
 * dependency). Non-image types (PDF, DICOM) are marked "unsupported" here — a
 * renderer service can be plugged in later; the storage + status plumbing is in
 * place so the rest of the system does not care which types are covered.
 */
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { Types } from 'mongoose';
import { DocumentModel } from './models/document.model';
import { downloadFile, uploadFile } from './storage.service';
import { decryptBuffer } from './document-encryption.service';
import logger from '@api/utils/logger';

const PREVIEW_MAX_DIM = 480;

export function isPreviewable(mimeType: string): boolean {
  return /^image\/(jpeg|png|webp|tiff|gif)$/.test(mimeType);
}

export async function generatePreview(documentId: string): Promise<void> {
  const doc = await DocumentModel.findById(new Types.ObjectId(documentId));
  if (!doc) return;

  if (!isPreviewable(doc.mimeType)) {
    doc.previewStatus = 'unsupported';
    await doc.save();
    return;
  }

  doc.previewStatus = 'processing';
  await doc.save();

  try {
    let bytes = await downloadFile(doc.storageKey);
    if (doc.encryption) bytes = decryptBuffer(bytes, doc.encryption);

    const thumb = await sharp(bytes)
      .rotate()
      .resize(PREVIEW_MAX_DIM, PREVIEW_MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    const previewKey = `documents/previews/${doc.clinicId}/${crypto.randomUUID()}.jpg`;

    // Previews are re-derivable thumbnails; they inherit storage-layer encryption
    // (SSE-KMS on S3). The original bytes remain envelope-encrypted at rest.
    await uploadFile({ storageKey: previewKey, buffer: thumb, mimeType: 'image/jpeg' });

    doc.previewStorageKey = previewKey;
    doc.previewStatus = 'done';
    await doc.save();
  } catch (err) {
    logger.error({ err, documentId, ext: path.extname(doc.fileName) }, 'preview generation failed');
    doc.previewStatus = 'failed';
    await doc.save();
  }
}
