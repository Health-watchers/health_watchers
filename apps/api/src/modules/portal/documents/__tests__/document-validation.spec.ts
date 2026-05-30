import { validateUploadedFile, MAX_SIZE_BYTES } from '../document-validation';
import mongoose from 'mongoose';
import { PortalDocumentModel } from '../portal-document.model';

describe('validateUploadedFile', () => {
  it('accepts valid PDF', () => expect(validateUploadedFile('application/pdf', 1024, 'report.pdf').valid).toBe(true));
  it('accepts JPEG', () => expect(validateUploadedFile('image/jpeg', 1024, 'card.jpg').valid).toBe(true));
  it('accepts PNG', () => expect(validateUploadedFile('image/png', 512, 'scan.png').valid).toBe(true));
  it('rejects disallowed MIME type', () => {
    const r = validateUploadedFile('application/zip', 1024, 'archive.zip');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('not allowed');
  });
  it('rejects file over 10MB', () => {
    const r = validateUploadedFile('application/pdf', MAX_SIZE_BYTES + 1, 'big.pdf');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('10MB');
  });
  it('accepts file exactly at 10MB limit', () => expect(validateUploadedFile('image/png', MAX_SIZE_BYTES, 'exact.png').valid).toBe(true));
  it('rejects file at limit + 1 byte', () => expect(validateUploadedFile('image/png', MAX_SIZE_BYTES + 1, 'over.png').valid).toBe(false));
  it('rejects empty file name', () => expect(validateUploadedFile('application/pdf', 1024, '').valid).toBe(false));
  it('rejects path traversal in file name', () => expect(validateUploadedFile('application/pdf', 1024, '../etc/passwd').valid).toBe(false));
});

describe('PortalDocumentModel schema', () => {
  const patientId = new mongoose.Types.ObjectId();
  const clinicId  = new mongoose.Types.ObjectId();
  const base = { patientId, clinicId, fileName: 'lab.pdf', mimeType: 'application/pdf', sizeBytes: 2048, category: 'lab_result', storageKey: 'portal/p1/lab.pdf' };

  it('validates a complete document entry', async () => {
    await expect(new PortalDocumentModel(base).validate()).resolves.toBeUndefined();
  });
  it('rejects invalid category', async () => {
    await expect(new PortalDocumentModel({ ...base, category: 'selfie' }).validate()).rejects.toThrow();
  });
  it('defaults visibility to care_team', () => {
    expect(new PortalDocumentModel(base).visibility).toBe('care_team');
  });
  it('requires storageKey', async () => {
    await expect(new PortalDocumentModel({ ...base, storageKey: undefined }).validate()).rejects.toThrow(/storageKey/);
  });
});
