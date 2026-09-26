import {
  verifyInsurance,
  simulatedVerificationProvider,
  getLatestVerification,
  listVerifications,
} from '../insurance-verification.service';

jest.mock('../../patients/models/patient.model', () => ({
  PatientModel: { findById: jest.fn() },
}));

jest.mock('../insurance-verification.model', () => ({
  InsuranceVerificationModel: {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  },
}));

import { PatientModel } from '../../patients/models/patient.model';
import { InsuranceVerificationModel } from '../insurance-verification.model';

const CLINIC_ID = '507f1f77bcf86cd799439011';
const PATIENT_ID = '507f1f77bcf86cd799439012';
const USER_ID = '507f1f77bcf86cd799439013';

function makePatient(insurance: unknown[] = []) {
  return { _id: PATIENT_ID, firstName: 'Jane', lastName: 'Doe', insurance };
}

/** Mock PatientModel.findById so the chained .lean() resolves to the given patient. */
function mockPatientLookup(insurance: unknown[]) {
  (PatientModel.findById as jest.Mock).mockReturnValue({
    lean: jest.fn().mockResolvedValue(makePatient(insurance)),
  });
}

describe('simulatedVerificationProvider', () => {
  it('is deterministic for the same policy number', async () => {
    const input = { provider: 'Aetna', policyNumber: 'POL-123456', coverageType: 'PPO' };
    const first = await simulatedVerificationProvider(input);
    const second = await simulatedVerificationProvider(input);
    expect(first.status).toBe(second.status);
  });

  it('verifies more than 90% of policies (acceptance criterion)', async () => {
    let verified = 0;
    const total = 500;
    for (let i = 0; i < total; i++) {
      const result = await simulatedVerificationProvider({
        provider: 'Test',
        policyNumber: `POL-${String(i).padStart(6, '0')}`,
        coverageType: 'PPO',
      });
      if (result.status === 'verified') verified++;
    }
    expect(verified / total).toBeGreaterThan(0.9);
  });

  it('returns coverage details for verified policies', async () => {
    const result = await simulatedVerificationProvider({
      provider: 'Aetna',
      policyNumber: 'POL-VERIFIED-1',
      coverageType: 'PPO',
    });
    expect(result.coverageDetails).toMatchObject({
      coverageType: 'PPO',
      coveragePercentage: 80,
    });
  });
});

describe('verifyInsurance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws 404 when patient is not found', async () => {
    (PatientModel.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    await expect(
      verifyInsurance({ clinicId: CLINIC_ID, patientId: PATIENT_ID, requestedBy: USER_ID })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when patient has no insurance on file', async () => {
    mockPatientLookup([]);

    await expect(
      verifyInsurance({ clinicId: CLINIC_ID, patientId: PATIENT_ID, requestedBy: USER_ID })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates a verification record using the primary insurance', async () => {
    const patient = makePatient([
      { provider: 'Old Ins', policyNumber: 'SECONDARY-1', coverageType: 'HMO', isPrimary: false },
      { provider: 'Aetna', policyNumber: 'PRIMARY-1', coverageType: 'PPO', isPrimary: true },
    ]);
    mockPatientLookup(patient.insurance as unknown[]);
    (InsuranceVerificationModel.create as jest.Mock).mockResolvedValue({ requestId: 'req-1' });

    await verifyInsurance({ clinicId: CLINIC_ID, patientId: PATIENT_ID, requestedBy: USER_ID });

    expect(InsuranceVerificationModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'Aetna',
        memberId: 'PRIMARY-1',
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        requestedBy: USER_ID,
        status: expect.stringMatching(/^(verified|not_verified)$/),
      })
    );
  });

  it('masks the policy number on the stored record', async () => {
    mockPatientLookup([
      { provider: 'Aetna', policyNumber: 'ABCD1234', coverageType: 'PPO', isPrimary: true },
    ]);
    (InsuranceVerificationModel.create as jest.Mock).mockImplementation(
      (doc: Record<string, unknown>) => Promise.resolve(doc)
    );

    const record = await verifyInsurance({
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      requestedBy: USER_ID,
    });

    expect(record.policyNumber).toBe('****1234');
    expect(record.policyNumber).not.toContain('ABCD');
  });

  it('sets verifiedAt and expiresAt only for verified outcomes', async () => {
    mockPatientLookup([
      { provider: 'Aetna', policyNumber: 'ABCD1234', coverageType: 'PPO', isPrimary: true },
    ]);
    (InsuranceVerificationModel.create as jest.Mock).mockImplementation(
      (doc: Record<string, unknown>) => Promise.resolve(doc)
    );

    const record = await verifyInsurance({
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      requestedBy: USER_ID,
    });

    if (record.status === 'verified') {
      expect(record.verifiedAt).toBeInstanceOf(Date);
      expect(record.expiresAt).toBeInstanceOf(Date);
    } else {
      expect(record.verifiedAt).toBeUndefined();
      expect(record.expiresAt).toBeUndefined();
    }
  });

  it('supports injecting a custom provider', async () => {
    mockPatientLookup([
      { provider: 'Aetna', policyNumber: 'POL-1', coverageType: 'PPO', isPrimary: true },
    ]);
    const customProvider = jest.fn().mockResolvedValue({
      status: 'verified',
      coverageDetails: { isActive: true, coveragePercentage: 100 },
    });
    (InsuranceVerificationModel.create as jest.Mock).mockResolvedValue({ requestId: 'req-2' });

    await verifyInsurance(
      { clinicId: CLINIC_ID, patientId: PATIENT_ID, requestedBy: USER_ID },
      customProvider
    );

    expect(customProvider).toHaveBeenCalledWith({
      provider: 'Aetna',
      policyNumber: 'POL-1',
      coverageType: 'PPO',
    });
  });
});

describe('getLatestVerification / listVerifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the most recent verification for a patient', async () => {
    (InsuranceVerificationModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ requestId: 'req-latest' }),
      }),
    });

    const result = await getLatestVerification(CLINIC_ID, PATIENT_ID);
    expect(result).toEqual({ requestId: 'req-latest' });
  });

  it('lists verifications scoped to the clinic', async () => {
    (InsuranceVerificationModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ requestId: 'req-1' }]),
        }),
      }),
    });

    const result = await listVerifications(CLINIC_ID, { limit: 10 });
    expect(result).toHaveLength(1);
    expect(InsuranceVerificationModel.find).toHaveBeenCalledWith({ clinicId: CLINIC_ID });
  });
});
