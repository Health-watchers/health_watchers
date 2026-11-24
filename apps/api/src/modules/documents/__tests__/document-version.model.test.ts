import mongoose from 'mongoose';
import { DocumentVersionModel } from '../models/document-version.model';

const baseDoc = {
  documentId: new mongoose.Types.ObjectId(),
  patientId: new mongoose.Types.ObjectId(),
  clinicId: new mongoose.Types.ObjectId(),
  uploadedBy: new mongoose.Types.ObjectId(),
  fileName: 'lab-result-v2.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  storageKey: 'clinics/c1/documents/doc1-v2.pdf',
  documentType: 'lab_result',
};

describe('DocumentVersionModel', () => {
  it('validates a complete document version record', async () => {
    const version = new DocumentVersionModel(baseDoc);
    await expect(version.validate()).resolves.toBeUndefined();
  });

  it('defaults version to 1 and isCurrentVersion to true', () => {
    const version = new DocumentVersionModel(baseDoc);
    expect(version.version).toBe(1);
    expect(version.isCurrentVersion).toBe(true);
  });

  it('requires storageKey', async () => {
    const version = new DocumentVersionModel({ ...baseDoc, storageKey: undefined });
    await expect(version.validate()).rejects.toThrow(/storageKey/);
  });

  it('allows marking a version as replaced', async () => {
    const replacedBy = new mongoose.Types.ObjectId();
    const version = new DocumentVersionModel({
      ...baseDoc,
      isCurrentVersion: false,
      replacedAt: new Date(),
      replacedBy,
    });
    await expect(version.validate()).resolves.toBeUndefined();
    expect(version.isCurrentVersion).toBe(false);
  });
});
