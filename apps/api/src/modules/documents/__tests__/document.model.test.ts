import mongoose from 'mongoose';
import { DocumentModel } from '../models/document.model';

const baseDoc = {
  patientId: new mongoose.Types.ObjectId(),
  clinicId: new mongoose.Types.ObjectId(),
  uploadedBy: new mongoose.Types.ObjectId(),
  fileName: 'lab-result.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  storageKey: 'clinics/c1/documents/doc1.pdf',
  documentType: 'lab_result',
};

describe('DocumentModel', () => {
  it('validates a complete document record', async () => {
    const doc = new DocumentModel(baseDoc);
    await expect(doc.validate()).resolves.toBeUndefined();
  });

  it('requires fileName', async () => {
    const doc = new DocumentModel({ ...baseDoc, fileName: undefined });
    await expect(doc.validate()).rejects.toThrow(/fileName/);
  });

  it('rejects an invalid documentType', async () => {
    const doc = new DocumentModel({ ...baseDoc, documentType: 'x-ray' });
    await expect(doc.validate()).rejects.toThrow();
  });

  it('defaults currentVersion and versionCount to 1', () => {
    const doc = new DocumentModel(baseDoc);
    expect(doc.currentVersion).toBe(1);
    expect(doc.versionCount).toBe(1);
  });
});
