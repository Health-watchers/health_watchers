jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../claim.model', () => ({ InsuranceClaimModel: { updateOne: jest.fn() } }));
jest.mock('../../encounters/encounter.model', () => ({
  EncounterModel: { updateOne: jest.fn().mockReturnValue({ catch: () => Promise.resolve() }) },
}));

import { InsuranceClaimModel } from '../claim.model';
import { postRemittance, transmitClaim } from '../claim-lifecycle.service';
import { setClearinghouse } from '../clearinghouse';

const baseClaim = (overrides: Record<string, unknown> = {}): any => ({
  _id: 'claim1',
  encounterId: 'enc1',
  patientId: 'pat1',
  clinicId: 'clinic1',
  totalAmount: 200,
  edi837Data: 'SV1*HC:99213*200.00~',
  status: 'submitted',
  remittances: [],
  paidAmount: 0,
  statusHistory: [],
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const era = (overrides: Record<string, unknown> = {}): any => ({
  eraId: 'ERA-1',
  billedAmount: 200,
  paidAmount: 128,
  patientResponsibility: 32,
  adjustments: [
    { groupCode: 'CO', reasonCode: '45', amount: 40 },
    { groupCode: 'PR', reasonCode: '2', amount: 32 },
  ],
  receivedAt: new Date(),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('postRemittance', () => {
  it('marks the claim paid and accumulates the paid amount', async () => {
    const claim = baseClaim({ status: 'accepted' });
    await postRemittance(claim, era(), 'user1');
    expect(claim.status).toBe('paid');
    expect(claim.paidAmount).toBe(128);
    expect(claim.paidAt).toBeInstanceOf(Date);
    expect(claim.statusHistory[0]).toMatchObject({ status: 'paid' });
    expect(claim.save).toHaveBeenCalled();
  });

  it('marks a zero-payment ERA as denied with the adjustment reasons', async () => {
    const claim = baseClaim();
    await postRemittance(
      claim,
      era({
        paidAmount: 0,
        patientResponsibility: 0,
        adjustments: [{ groupCode: 'CO', reasonCode: '50', amount: 200 }],
      })
    );
    expect(claim.status).toBe('denied');
    expect(claim.denialReason).toContain('CO-50');
  });

  it('is idempotent for the same ERA id', async () => {
    const claim = baseClaim();
    await postRemittance(claim, era());
    await postRemittance(claim, era());
    expect(claim.remittances).toHaveLength(1);
    expect(claim.paidAmount).toBe(128);
  });

  it('records a follow-up payment on an already paid claim without changing status', async () => {
    const claim = baseClaim({ status: 'paid', paidAmount: 100, statusHistory: [] });
    await postRemittance(claim, era({ eraId: 'ERA-2', paidAmount: 28 }));
    expect(claim.status).toBe('paid');
    expect(claim.paidAmount).toBe(128);
    expect(claim.statusHistory).toHaveLength(0);
  });
});

describe('transmitClaim', () => {
  afterEach(() => setClearinghouse('mock'));

  it('stores the clearinghouse submission id on acceptance', async () => {
    setClearinghouse('mock', {
      provider: 'mock',
      submitClaim: jest.fn().mockResolvedValue({ submissionId: 'SUB-1', accepted: true }),
      getClaimStatus: jest.fn(),
      fetchRemittances: jest.fn(),
    });
    const result = await transmitClaim(baseClaim(), '1', undefined, 'mock');
    expect(result).toMatchObject({ transmitted: true, submissionId: 'SUB-1' });
    expect(InsuranceClaimModel.updateOne).toHaveBeenCalledWith(
      { _id: 'claim1' },
      { $set: { clearinghouse: expect.objectContaining({ submissionId: 'SUB-1', provider: 'mock' }) } }
    );
  });

  it('moves a front-end rejection to rejected', async () => {
    setClearinghouse('mock', {
      provider: 'mock',
      submitClaim: jest
        .fn()
        .mockResolvedValue({ submissionId: 'SUB-2', accepted: false, rejectionReason: 'Bad ID' }),
      getClaimStatus: jest.fn(),
      fetchRemittances: jest.fn(),
    });
    const result = await transmitClaim(baseClaim(), '1', undefined, 'mock');
    expect(result.rejected).toBe(true);
    const update = (InsuranceClaimModel.updateOne as jest.Mock).mock.calls[0][1];
    expect(update.$set).toMatchObject({ status: 'rejected', rejectionReason: 'Bad ID' });
  });

  it('leaves the claim submitted when the clearinghouse is unreachable', async () => {
    setClearinghouse('mock', {
      provider: 'mock',
      submitClaim: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      getClaimStatus: jest.fn(),
      fetchRemittances: jest.fn(),
    });
    const result = await transmitClaim(baseClaim(), '1', undefined, 'mock');
    expect(result).toMatchObject({ transmitted: false, reason: 'ECONNREFUSED' });
    expect(InsuranceClaimModel.updateOne).not.toHaveBeenCalled();
  });
});
