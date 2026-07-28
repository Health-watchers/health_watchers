import mongoose from 'mongoose';
import { CommunicationLogModel } from '../communication-log.model';

const patientId = new mongoose.Types.ObjectId();
const clinicId = new mongoose.Types.ObjectId();
const sentBy = new mongoose.Types.ObjectId();

const baseDoc = {
  patientId,
  clinicId,
  sentBy,
  channel: 'sms',
  direction: 'outbound',
  content: 'Your appointment is confirmed',
  status: 'sent',
  sentAt: new Date('2026-01-01'),
};

describe('CommunicationLogModel', () => {
  it('validates a complete communication log', async () => {
    const log = new CommunicationLogModel(baseDoc);
    await expect(log.validate()).resolves.toBeUndefined();
  });

  it('requires content', async () => {
    const log = new CommunicationLogModel({ ...baseDoc, content: undefined });
    await expect(log.validate()).rejects.toThrow(/content/);
  });

  it('rejects an invalid channel', async () => {
    const log = new CommunicationLogModel({ ...baseDoc, channel: 'carrier_pigeon' });
    await expect(log.validate()).rejects.toThrow();
  });

  it('rejects an invalid direction', async () => {
    const log = new CommunicationLogModel({ ...baseDoc, direction: 'sideways' });
    await expect(log.validate()).rejects.toThrow();
  });

  it('requires status', async () => {
    const log = new CommunicationLogModel({ ...baseDoc, status: undefined });
    await expect(log.validate()).rejects.toThrow(/status/);
  });
});
