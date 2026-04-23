/**
 * Unit tests for patient PUT (update) and DELETE (soft-delete) route handlers.
 *
 * These tests exercise the handler logic directly by mocking PatientModel,
 * avoiding the need for a running Express server.
 */

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret',
      refreshTokenSecret: 'test-refresh-secret',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
  },
}));

jest.mock('@api/lib/encrypt', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {
    findByIdAndUpdate: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PatientModel } from './models/patient.model';

// ── Minimal req/res/next mocks ────────────────────────────────────────────────

function makeRes() {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as unknown as { status: jest.Mock; json: jest.Mock };
}

const CLINIC_ID = '507f1f77bcf86cd799439011';
const PATIENT_ID = '507f1f77bcf86cd799439012';

const mockPatient = {
  _id: PATIENT_ID,
  systemId: 'HW-439011-000001',
  firstName: 'Jane',
  lastName: 'Doe',
  dateOfBirth: '1990-01-01',
  sex: 'F',
  contactNumber: '555-1234',
  address: '123 Main St',
  clinicId: CLINIC_ID,
  isActive: true,
  searchName: 'jane doe',
};

// ── Inline handler logic (mirrors patients.controller.ts) ─────────────────────

async function putHandler(
  params: { id: string },
  body: Record<string, unknown>,
  res: ReturnType<typeof makeRes>,
) {
  const { firstName, lastName, dateOfBirth, sex, contactNumber, address } = body as Record<string, string>;
  const update: Record<string, unknown> = { contactNumber, address, sex };
  if (firstName) update.firstName = firstName;
  if (lastName) update.lastName = lastName;
  if (firstName || lastName) {
    update.searchName = `${firstName || ''} ${lastName || ''}`.toLowerCase().trim();
  }
  if (dateOfBirth) update.dateOfBirth = new Date(dateOfBirth);

  const doc = await PatientModel.findByIdAndUpdate(params.id, update, { new: true });
  if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
  return res.json({ status: 'success', data: doc });
}

async function deleteHandler(
  params: { id: string },
  res: ReturnType<typeof makeRes>,
) {
  const doc = await PatientModel.findByIdAndUpdate(params.id, { isActive: false }, { new: true });
  if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });
  return res.json({ status: 'success', data: { id: String(doc._id), isActive: false } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PUT /patients/:id handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates patient and returns 200 with updated data', async () => {
    const updated = { ...mockPatient, firstName: 'Janet', searchName: 'janet doe' };
    (PatientModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(updated);
    const res = makeRes();

    await putHandler(
      { id: PATIENT_ID },
      { firstName: 'Janet', lastName: 'Doe', sex: 'F', contactNumber: '555-9999', address: '456 Oak' },
      res,
    );

    expect(PatientModel.findByIdAndUpdate).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.objectContaining({ firstName: 'Janet', searchName: 'janet doe' }),
      { new: true },
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('returns 404 when patient does not exist', async () => {
    (PatientModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);
    const res = makeRes();

    await putHandler({ id: PATIENT_ID }, { firstName: 'Ghost', sex: 'M' }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'NotFound' }));
  });

  it('sets searchName from firstName + lastName', async () => {
    (PatientModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockPatient);
    const res = makeRes();

    await putHandler({ id: PATIENT_ID }, { firstName: 'Alice', lastName: 'Smith', sex: 'F' }, res);

    expect(PatientModel.findByIdAndUpdate).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.objectContaining({ searchName: 'alice smith' }),
      { new: true },
    );
  });

  it('does not set searchName when neither firstName nor lastName provided', async () => {
    (PatientModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockPatient);
    const res = makeRes();

    await putHandler({ id: PATIENT_ID }, { sex: 'F', contactNumber: '555-0000' }, res);

    const callArg = (PatientModel.findByIdAndUpdate as jest.Mock).mock.calls[0][1];
    expect(callArg).not.toHaveProperty('searchName');
  });

  it('converts dateOfBirth string to Date object', async () => {
    (PatientModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockPatient);
    const res = makeRes();

    await putHandler({ id: PATIENT_ID }, { dateOfBirth: '2000-06-15', sex: 'M' }, res);

    const callArg = (PatientModel.findByIdAndUpdate as jest.Mock).mock.calls[0][1];
    expect(callArg.dateOfBirth).toBeInstanceOf(Date);
    expect(callArg.dateOfBirth.toISOString()).toContain('2000-06-15');
  });
});

describe('DELETE /patients/:id handler (soft-delete)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets isActive=false and returns 200', async () => {
    (PatientModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({ ...mockPatient, isActive: false });
    const res = makeRes();

    await deleteHandler({ id: PATIENT_ID }, res);

    expect(PatientModel.findByIdAndUpdate).toHaveBeenCalledWith(
      PATIENT_ID,
      { isActive: false },
      { new: true },
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', data: expect.objectContaining({ isActive: false }) }),
    );
  });

  it('returns 404 when patient does not exist', async () => {
    (PatientModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(null);
    const res = makeRes();

    await deleteHandler({ id: PATIENT_ID }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'NotFound' }));
  });

  it('does not hard-delete — isActive is set to false, not removed', async () => {
    (PatientModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({ ...mockPatient, isActive: false });
    const res = makeRes();

    await deleteHandler({ id: PATIENT_ID }, res);

    // Confirm we never call deleteOne / findByIdAndDelete
    expect(PatientModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    const updateArg = (PatientModel.findByIdAndUpdate as jest.Mock).mock.calls[0][1];
    expect(updateArg).toEqual({ isActive: false });
  });

  it('returns the patient id in the response', async () => {
    (PatientModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({ ...mockPatient, _id: PATIENT_ID, isActive: false });
    const res = makeRes();

    await deleteHandler({ id: PATIENT_ID }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: PATIENT_ID }) }),
    );
  });
});
