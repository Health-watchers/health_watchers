import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { CommunicationLogModel } from '../communication-log.model';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await CommunicationLogModel.deleteMany({});
});

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

  it('strips <script> tags from content on save (stored XSS prevention)', async () => {
    const log = await CommunicationLogModel.create({
      ...baseDoc,
      content: '<script>alert(1)</script>Your appointment is confirmed',
    });
    expect(log.content).not.toContain('<script>');
    expect(log.content).toContain('Your appointment is confirmed');
  });

  it('strips all HTML tags from content, including on* handlers', async () => {
    const log = await CommunicationLogModel.create({
      ...baseDoc,
      content: '<img src=x onerror="evil()">reminder text',
    });
    expect(log.content).toBe('reminder text');
  });
});
