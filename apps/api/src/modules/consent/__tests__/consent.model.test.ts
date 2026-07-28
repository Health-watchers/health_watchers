import mongoose from 'mongoose';
import { ConsentModel, CONSENT_TEMPLATES } from '../consent.model';

const patientId = new mongoose.Types.ObjectId();
const clinicId = new mongoose.Types.ObjectId();

describe('ConsentModel', () => {
  it('validates a minimal valid consent record', async () => {
    const consent = new ConsentModel({ patientId, clinicId, type: 'treatment' });
    await expect(consent.validate()).resolves.toBeUndefined();
  });

  it('requires a type', async () => {
    const consent = new ConsentModel({ patientId, clinicId });
    await expect(consent.validate()).rejects.toThrow(/type/);
  });

  it('rejects an invalid consent type', async () => {
    const consent = new ConsentModel({ patientId, clinicId, type: 'unknown' });
    await expect(consent.validate()).rejects.toThrow();
  });

  it('defaults status to pending and version to 1.0', () => {
    const consent = new ConsentModel({ patientId, clinicId, type: 'research' });
    expect(consent.status).toBe('pending');
    expect(consent.version).toBe('1.0');
  });
});

describe('CONSENT_TEMPLATES', () => {
  it('defines a template for every consent type', () => {
    const types: Array<keyof typeof CONSENT_TEMPLATES> = [
      'treatment',
      'data_sharing',
      'ai_analysis',
      'research',
      'marketing',
    ];
    for (const type of types) {
      expect(CONSENT_TEMPLATES[type]).toEqual(
        expect.objectContaining({ version: expect.any(String), title: expect.any(String), text: expect.any(String) })
      );
    }
  });
});
