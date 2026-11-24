import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PortalMessageModel } from '../portal-message.model';

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
  await PortalMessageModel.deleteMany({});
});

function baseDoc() {
  return {
    clinicId: new mongoose.Types.ObjectId(),
    patientId: new mongoose.Types.ObjectId(),
    senderId: new mongoose.Types.ObjectId(),
    senderRole: 'PATIENT' as const,
    subject: 'Question about medication',
    body: 'Can I take this with food?',
    direction: 'patient_to_staff' as const,
    threadId: new mongoose.Types.ObjectId(),
  };
}

describe('PortalMessageModel', () => {
  it('validates a complete portal message', async () => {
    const msg = new PortalMessageModel(baseDoc());
    await expect(msg.validate()).resolves.toBeUndefined();
  });

  describe('XSS sanitization', () => {
    // subject/body are interpolated directly into HTML notification emails
    // (see notifyStaffAboutPatientMessage / notifyPatientAboutStaffReply in
    // portal.controller.ts and patients.controller.ts), so unsanitized input
    // here is a stored-XSS-to-HTML-email injection vector, not just a UI risk.
    it('strips <script> tags from subject and body on save (patient -> staff)', async () => {
      const msg = await PortalMessageModel.create({
        ...baseDoc(),
        subject: '<script>alert(1)</script>Question about medication',
        body: '<img src=x onerror="evil()">Can I take this with food?',
      });

      expect(msg.subject).not.toContain('<script>');
      expect(msg.subject).toContain('Question about medication');
      expect(msg.body).toBe('Can I take this with food?');
    });

    it('strips <script> tags from subject and body on save (staff -> patient)', async () => {
      const msg = await PortalMessageModel.create({
        ...baseDoc(),
        senderRole: 'DOCTOR',
        direction: 'staff_to_patient',
        subject: '<svg onload="evil()">Re: medication</svg>',
        body: '<script>document.cookie</script>Yes, that is fine.',
      });

      expect(msg.subject).toBe('Re: medication');
      expect(msg.body).not.toContain('<script>');
      expect(msg.body).toContain('Yes, that is fine.');
    });
  });
});
