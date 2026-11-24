/**
 * Tests for Issue #1431 — Portal document upload notifications
 * Covers: in-app notification creation, Socket.IO event emission,
 * optional email queuing, and private-visibility skip logic.
 */

import { uploadDocument, listMyDocuments } from '../portal-documents.controller';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../portal-document.model', () => ({
  PortalDocumentModel: {
    create: jest.fn(),
    findByIdAndUpdate: jest.fn().mockResolvedValue(null),
    find: jest.fn(),
  },
}));

jest.mock('../document-validation', () => ({
  validateUploadedFile: jest.fn().mockReturnValue({ valid: true }),
}));

jest.mock('../../notifications/notification.service', () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));

jest.mock('@api/realtime/socket', () => ({
  emitToClinic: jest.fn(),
}));

jest.mock('../../auth/models/user.model', () => ({
  UserModel: {
    find: jest.fn(),
  },
}));

jest.mock('@api/utils/email-queue', () => ({
  enqueueEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import { PortalDocumentModel } from '../portal-document.model';
import { validateUploadedFile } from '../document-validation';
import { createNotification } from '../../notifications/notification.service';
import { emitToClinic } from '@api/realtime/socket';
import { UserModel } from '../../auth/models/user.model';
import { enqueueEmail } from '@api/utils/email-queue';

const mockCreateNotification = createNotification as jest.MockedFunction<typeof createNotification>;
const mockEmitToClinic = emitToClinic as jest.MockedFunction<typeof emitToClinic>;
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

function makeUploadReq(overrides: Record<string, any> = {}) {
  return {
    user: { patientId: 'patient1', clinicId: 'clinic1' },
    file: {
      originalname: 'insurance_card.jpg',
      mimetype: 'image/jpeg',
      size: 50000,
    },
    body: { category: 'insurance_card', visibility: 'care_team' },
    ...overrides,
  } as any;
}

function makeRes() {
  const res: any = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return res;
}

const fakeCareTeam = [
  { _id: 'doctor1', fullName: 'Dr. Smith', email: 'doctor@clinic.com', role: 'DOCTOR', preferences: { emailNotifications: true } },
  { _id: 'nurse1', fullName: 'Nurse Jones', email: 'nurse@clinic.com', role: 'NURSE', preferences: { emailNotifications: false } },
];

const fakeDoc = {
  _id: 'doc1',
  patientId: 'patient1',
  clinicId: 'clinic1',
  fileName: 'insurance_card.jpg',
  category: 'insurance_card',
  visibility: 'care_team',
};

beforeEach(() => {
  jest.clearAllMocks();

  (PortalDocumentModel.create as jest.Mock).mockResolvedValue(fakeDoc);
  (UserModel.find as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(fakeCareTeam),
    }),
  });
});

// ── uploadDocument ────────────────────────────────────────────────────────────

describe('uploadDocument', () => {
  it('creates in-app notifications for each care team member', async () => {
    const req = makeUploadReq();
    const res = makeRes();

    await uploadDocument(req, res);

    // Allow async notification dispatch to complete
    await new Promise((r) => setImmediate(r));

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'doctor1',
        clinicId: 'clinic1',
        type: 'system',
        title: 'Patient Document Uploaded',
      })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'nurse1' })
    );
  });

  it('emits a Socket.IO event to the clinic room', async () => {
    const req = makeUploadReq();
    const res = makeRes();

    await uploadDocument(req, res);
    await new Promise((r) => setImmediate(r));

    expect(mockEmitToClinic).toHaveBeenCalledWith(
      'clinic1',
      'document:uploaded',
      expect.objectContaining({
        documentId: 'doc1',
        patientId: 'patient1',
        fileName: 'insurance_card.jpg',
        category: 'insurance_card',
      })
    );
  });

  it('sends email only to members with emailNotifications enabled', async () => {
    const req = makeUploadReq();
    const res = makeRes();

    await uploadDocument(req, res);
    await new Promise((r) => setImmediate(r));

    // Only doctor1 has emailNotifications: true
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'doctor@clinic.com' })
    );
  });

  it('skips all notifications when visibility is "private"', async () => {
    const req = makeUploadReq({ body: { category: 'id_document', visibility: 'private' } });
    const res = makeRes();

    await uploadDocument(req, res);
    await new Promise((r) => setImmediate(r));

    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockEmitToClinic).not.toHaveBeenCalled();
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it('returns 400 when no file is provided', async () => {
    const req = { ...makeUploadReq(), file: undefined };
    const res = makeRes();

    await uploadDocument(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'No file provided.' })
    );
  });

  it('returns 400 when file validation fails', async () => {
    (validateUploadedFile as jest.Mock).mockReturnValueOnce({
      valid: false,
      reason: 'File type not allowed',
    });
    const req = makeUploadReq();
    const res = makeRes();

    await uploadDocument(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'File type not allowed' })
    );
  });

  it('returns 201 with the created document', async () => {
    const req = makeUploadReq();
    const res = makeRes();

    await uploadDocument(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeDoc })
    );
  });

  it('does not fail the upload response if notifications error', async () => {
    mockCreateNotification.mockRejectedValue(new Error('Notification DB error'));

    const req = makeUploadReq();
    const res = makeRes();

    await uploadDocument(req, res);

    // The upload should still succeed
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ── listMyDocuments ───────────────────────────────────────────────────────────

describe('listMyDocuments', () => {
  it('returns documents for the authenticated patient', async () => {
    const docs = [{ _id: 'doc2', fileName: 'lab.pdf' }];
    (PortalDocumentModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(docs),
    });

    const req: any = {
      user: { patientId: 'patient2' },
      query: {},
    };
    const res = makeRes();

    await listMyDocuments(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: docs });
  });
});
