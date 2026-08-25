import mongoose from 'mongoose';
import { BAAModel } from '../baa.model';

const clinicId = new mongoose.Types.ObjectId();

describe('BAAModel', () => {
  it('validates a minimal valid BAA record', async () => {
    const baa = new BAAModel({ clinicId, businessAssociate: 'MongoDB Atlas' });
    await expect(baa.validate()).resolves.toBeUndefined();
  });

  it('requires businessAssociate', async () => {
    const baa = new BAAModel({ clinicId });
    await expect(baa.validate()).rejects.toThrow(/businessAssociate/);
  });

  it('requires clinicId', async () => {
    const baa = new BAAModel({ businessAssociate: 'Stellar' });
    await expect(baa.validate()).rejects.toThrow(/clinicId/);
  });

  it('defaults status to pending', () => {
    const baa = new BAAModel({ clinicId, businessAssociate: 'Google Gemini' });
    expect(baa.status).toBe('pending');
  });

  it('rejects an invalid status value', async () => {
    const baa = new BAAModel({ clinicId, businessAssociate: 'Google Gemini', status: 'active' });
    await expect(baa.validate()).rejects.toThrow();
  });
});
