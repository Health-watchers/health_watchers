/**
 * Document OCR / content indexing — Issue #1247
 *
 * OCR itself is delegated to a pluggable provider so the platform is not tied to
 * a particular engine. The default provider is a no-op that marks image/PDF
 * documents as "skipped" (so the pipeline is wired end-to-end and a real engine
 * — Tesseract, Textract, Vision — can be dropped in via `setOcrProvider`).
 * Plain-text uploads are indexed directly with no external dependency.
 */
import { Types } from 'mongoose';
import { DocumentModel } from './models/document.model';
import { downloadFile } from './storage.service';
import { decryptBuffer } from './document-encryption.service';
import { recordDocumentAudit } from './document-audit.service';
import logger from '@api/utils/logger';

export interface OcrProvider {
  name: string;
  supports(mimeType: string): boolean;
  extractText(buffer: Buffer, mimeType: string): Promise<string>;
}

const textDecoderProvider: OcrProvider = {
  name: 'inline-text',
  supports: (mime) => mime.startsWith('text/') || mime === 'application/json',
  extractText: async (buffer) => buffer.toString('utf8'),
};

let provider: OcrProvider = textDecoderProvider;

export function setOcrProvider(p: OcrProvider): void {
  provider = p;
}

const MAX_INDEXED_CHARS = 100_000;

export async function indexDocument(documentId: string): Promise<void> {
  const doc = await DocumentModel.findById(new Types.ObjectId(documentId));
  if (!doc) return;

  if (!provider.supports(doc.mimeType)) {
    doc.ocrStatus = 'skipped';
    doc.ocrProcessedAt = new Date();
    await doc.save();
    return;
  }

  doc.ocrStatus = 'processing';
  await doc.save();

  try {
    let bytes = await downloadFile(doc.storageKey);
    if (doc.encryption) bytes = decryptBuffer(bytes, doc.encryption);

    const text = (await provider.extractText(bytes, doc.mimeType)).slice(0, MAX_INDEXED_CHARS);
    doc.ocrText = text;
    doc.ocrStatus = 'done';
    doc.ocrProcessedAt = new Date();
    await doc.save();

    await recordDocumentAudit({
      documentId: String(doc._id),
      clinicId: String(doc.clinicId),
      action: 'ocr_indexed',
      metadata: { provider: provider.name, chars: text.length },
    });
  } catch (err) {
    logger.error({ err, documentId }, 'OCR indexing failed');
    doc.ocrStatus = 'failed';
    doc.ocrProcessedAt = new Date();
    await doc.save();
  }
}
