/**
 * Tests for Issue #1429 — Claims API: webhook events and audit logs
 * Covers submitClaims (claim.submitted), denyClaim (claim.denied),
 * and audit log creation on state changes.
 */

import { submitClaims, denyClaim, resubmitClaim, writeOffClaim, generateClaim } from '../claim.controller';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../claim.model', () => ({
  InsuranceClaimModel: {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    }),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    countDocuments: jest.fn(),
  },
  CLAIM_STATUSES: ['draft', 'submitted', 'accepted', 'rejected', 'denied', 'paid', 'resubmitted', 'written_off'],
}));

jest.mock('../claim-lifecycle.service', () => ({
  transmitClaim: jest.fn().mockImplementation(async (claim: any) => ({
    claimId: String(claim._id),
    transmitted: true,
  })),
}));

jest.mock('../../encounters/encounter.model', () => ({
  EncounterModel: {
    updateOne: jest.fn().mockReturnValue({ catch: jest.fn().mockReturnValue(Promise.resolve(undefined)) }),
    countDocuments: jest.fn(),
    find: jest.fn(),
    populate: jest.fn(),
  },
}));

jest.mock('../../audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../webhooks/webhook.model', () => ({
  WebhookModel: {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    }),
  },
}));

jest.mock('../../webhooks/webhook.service', () => ({
  enqueueWebhookDelivery: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../claim-builder', () => ({
  buildCms1500: jest.fn().mockReturnValue({ box28_totalCharge: 200 }),
  buildEdi837: jest.fn().mockReturnValue('ISA*00*...'),
}));

import { InsuranceClaimModel } from '../claim.model';
import { auditLog } from '../../audit/audit.service';
import { WebhookModel } from '../../webhooks/webhook.model';
import { enqueueWebhookDelivery } from '../../webhooks/webhook.service';

const mockAuditLog = auditLog as jest.MockedFunction<typeof auditLog>;
const mockEnqueueWebhook = enqueueWebhookDelivery as jest.MockedFunction<typeof enqueueWebhookDelivery>;

function makeReqRes(body: Record<string, any> = {}, user: Record<string, any> = {}, params: Record<string, string> = {}) {
  const req: any = {
    body,
    user: { userId: 'user1', clinicId: 'clinic1', role: 'CLINIC_ADMIN', ...user },
    params,
  };
  const res: any = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return { req, res };
}

/** A draft claim whose stored CMS-1500 data passes field validation */
function validDraft(id: string) {
  return {
    _id: { toString: () => id },
    encounterId: 'enc1',
    patientId: 'pat1',
    clinicId: 'clinic1',
    cptCodes: ['99213'],
    diagnosisCodes: ['J06.9'],
    totalAmount: 150,
    cms1500Data: {
      box2_patientName: 'Doe, Jane',
      box3_patientDob: '1980-01-01',
      box33_billingProviderNpi: '1234567893',
      box24_servicelines: [{ dateOfService: '2024-03-01', cptCode: '99213', charges: 150 }],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── submitClaims ──────────────────────────────────────────────────────────────

describe('submitClaims', () => {
  it('emits claim.submitted webhook for each eligible claim', async () => {
    const eligibleId = validDraft('claimId1');
    (InsuranceClaimModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([eligibleId]) }),
    });
    (InsuranceClaimModel.updateMany as jest.Mock).mockResolvedValue({});
    (InsuranceClaimModel.findById as jest.Mock).mockResolvedValue({
      _id: 'claimId1',
      clinicId: 'clinic1',
      patientId: 'pat1',
      totalAmount: 200,
    });

    // Make WebhookModel.find return a webhook
    (WebhookModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'wh1', url: 'https://example.com/hook', secret: 'secret123', events: ['claim.submitted'] },
        ]),
      }),
    });

    const { req, res } = makeReqRes({ claimIds: ['claimId1'] });
    await submitClaims(req, res);

    expect(mockEnqueueWebhook).toHaveBeenCalledWith(
      'wh1',
      'claim.submitted',
      'https://example.com/hook',
      'secret123',
      expect.objectContaining({ claimId: 'claimId1' })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ submitted: ['claimId1'] }) })
    );
  });

  it('records audit log for each submitted claim', async () => {
    const eligibleId = validDraft('claimId2');
    (InsuranceClaimModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([eligibleId]) }),
    });
    (InsuranceClaimModel.updateMany as jest.Mock).mockResolvedValue({});
    (InsuranceClaimModel.findById as jest.Mock).mockResolvedValue({
      _id: 'claimId2', clinicId: 'clinic1', patientId: 'pat2', totalAmount: 150,
    });

    const { req, res } = makeReqRes({ claimIds: ['claimId2'] });
    await submitClaims(req, res);

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'InsuranceClaim',
        resourceId: 'claimId2',
        outcome: 'SUCCESS',
      }),
      req
    );
  });

  it('returns 400 for missing claimIds', async () => {
    const { req, res } = makeReqRes({});
    await submitClaims(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('skips non-eligible (non-draft) claim ids', async () => {
    (InsuranceClaimModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    });
    (InsuranceClaimModel.updateMany as jest.Mock).mockResolvedValue({});

    const { req, res } = makeReqRes({ claimIds: ['nonDraftId'] });
    await submitClaims(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ submitted: [], skipped: ['nonDraftId'] }) })
    );
  });
});

// ── denyClaim ─────────────────────────────────────────────────────────────────

describe('denyClaim', () => {
  it('emits claim.denied webhook on denial', async () => {
    const deniedClaim = {
      _id: 'claimId3',
      status: 'submitted',
      clinicId: 'clinic1',
      patientId: 'pat3',
      encounterId: 'enc1',
    };
    (InsuranceClaimModel.findOneAndUpdate as jest.Mock).mockResolvedValue(deniedClaim);
    (WebhookModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'wh2', url: 'https://example.com/deny-hook', secret: 'sec2', events: ['claim.denied'] },
        ]),
      }),
    });

    const { req, res } = makeReqRes({ reason: 'Coverage expired' }, {}, { claimId: 'claimId3' });
    await denyClaim(req, res);

    expect(mockEnqueueWebhook).toHaveBeenCalledWith(
      'wh2',
      'claim.denied',
      'https://example.com/deny-hook',
      'sec2',
      expect.objectContaining({ claimId: 'claimId3', denialReason: 'Coverage expired' })
    );
  });

  it('records audit log on claim denial', async () => {
    const deniedClaim = {
      _id: 'claimId4',
      status: 'submitted',
      clinicId: 'clinic1',
      patientId: 'pat4',
      encounterId: 'enc2',
    };
    (InsuranceClaimModel.findOneAndUpdate as jest.Mock).mockResolvedValue(deniedClaim);

    const { req, res } = makeReqRes({ reason: 'Patient not eligible' }, {}, { claimId: 'claimId4' });
    await denyClaim(req, res);

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'InsuranceClaim',
        resourceId: 'claimId4',
        metadata: expect.objectContaining({ reason: 'Patient not eligible' }),
      }),
      req
    );
  });

  it('returns 400 when reason is missing', async () => {
    const { req, res } = makeReqRes({}, {}, { claimId: 'claimId5' });
    await denyClaim(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when claim not found', async () => {
    (InsuranceClaimModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
    const { req, res } = makeReqRes({ reason: 'Reason' }, {}, { claimId: 'nonexistent' });
    await denyClaim(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── resubmitClaim ─────────────────────────────────────────────────────────────

describe('resubmitClaim', () => {
  it('records audit log on resubmission', async () => {
    const claim: any = {
      _id: 'claimId6',
      status: 'rejected',
      clinicId: 'clinic1',
      patientId: 'pat5',
      encounterId: 'enc3',
      cptCodes: ['99213'],
      diagnosisCodes: ['Z00.00'],
      totalAmount: 150,
      resubmissionCount: 0,
      statusHistory: [],
      cms1500Data: { box24_servicelines: [], box33_billingProviderNpi: '123' },
      save: jest.fn().mockResolvedValue(undefined),
    };
    (InsuranceClaimModel.findOne as jest.Mock).mockResolvedValue(claim);

    const { req, res } = makeReqRes({}, {}, { claimId: 'claimId6' });
    await resubmitClaim(req, res);

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'InsuranceClaim',
        resourceId: 'claimId6',
        metadata: expect.objectContaining({ statusChange: 'rejected → resubmitted' }),
      }),
      req
    );
  });

  it('returns 409 when claim is not rejected', async () => {
    (InsuranceClaimModel.findOne as jest.Mock).mockResolvedValue({
      _id: 'c1', status: 'submitted', clinicId: 'clinic1',
    });
    const { req, res } = makeReqRes({}, {}, { claimId: 'c1' });
    await resubmitClaim(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

// ── writeOffClaim ─────────────────────────────────────────────────────────────

describe('writeOffClaim', () => {
  it('records audit log on write-off', async () => {
    const claim = { _id: 'claimId7', status: 'rejected', clinicId: 'clinic1' };
    (InsuranceClaimModel.findOneAndUpdate as jest.Mock).mockResolvedValue(claim);

    const { req, res } = makeReqRes({ reason: 'Patient deceased' }, {}, { claimId: 'claimId7' });
    await writeOffClaim(req, res);

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        resourceType: 'InsuranceClaim',
        resourceId: 'claimId7',
        metadata: expect.objectContaining({ reason: 'Patient deceased' }),
      }),
      req
    );
  });

  it('returns 400 when reason is too short', async () => {
    const { req, res } = makeReqRes({ reason: 'ab' }, {}, { claimId: 'c1' });
    await writeOffClaim(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── #1689: validation & clearinghouse transmission ────────────────────────────

describe('submitClaims — field validation (#1689)', () => {
  it('holds back drafts with invalid CMS-1500 fields and reports their errors', async () => {
    const bad = { ...validDraft('badClaim'), diagnosisCodes: [] };
    (InsuranceClaimModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([bad]) }),
    });
    (InsuranceClaimModel.updateMany as jest.Mock).mockResolvedValue({});

    const { req, res } = makeReqRes({ claimIds: ['badClaim'] });
    await submitClaims(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.data.submitted).toEqual([]);
    expect(body.data.invalid[0]).toMatchObject({
      claimId: 'badClaim',
      errors: expect.arrayContaining([expect.objectContaining({ field: '21' })]),
    });
  });

  it('transmits each valid claim to the clearinghouse as an original claim', async () => {
    const { transmitClaim } = jest.requireMock('../claim-lifecycle.service');
    (InsuranceClaimModel.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([validDraft('ok1')]) }),
    });
    (InsuranceClaimModel.updateMany as jest.Mock).mockResolvedValue({});
    (InsuranceClaimModel.findById as jest.Mock).mockResolvedValue(null);

    const { req, res } = makeReqRes({ claimIds: ['ok1'] });
    await submitClaims(req, res);

    expect(transmitClaim).toHaveBeenCalledWith(expect.anything(), '1', 'user1');
  });
});

describe('generateClaim — field validation (#1689)', () => {
  it('returns 422 with field errors for an invalid claim', async () => {
    const { req, res } = makeReqRes(
      {
        patientId: 'pat1',
        clinicNpi: '1234567890',
        patientDob: '1980-01-01',
        patientName: 'Doe, Jane',
        serviceDate: '2024-03-01',
        cptCodes: ['99213'],
        diagnosisCodes: ['J06.9'],
        amounts: [150],
      },
      {},
      { id: 'enc1' }
    );
    await generateClaim(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(InsuranceClaimModel.create).not.toHaveBeenCalled();
  });
});

describe('denyClaim — status (#1689)', () => {
  it('moves the claim to denied', async () => {
    (InsuranceClaimModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
      _id: 'c9',
      status: 'denied',
      clinicId: 'clinic1',
      patientId: 'p9',
    });
    const { req, res } = makeReqRes({ reason: 'CO-50 not medically necessary' }, {}, { claimId: 'c9' });
    await denyClaim(req, res);
    const update = (InsuranceClaimModel.findOneAndUpdate as jest.Mock).mock.calls[0][1];
    expect(update.$set.status).toBe('denied');
    expect(update.$push.statusHistory.status).toBe('denied');
  });
});

describe('resubmitClaim — denied claims (#1689)', () => {
  it('allows resubmitting a denied claim and sends it as a replacement', async () => {
    const { transmitClaim } = jest.requireMock('../claim-lifecycle.service');
    const claim: any = {
      _id: 'c10',
      status: 'denied',
      clinicId: 'clinic1',
      patientId: 'p10',
      encounterId: 'e10',
      cptCodes: ['99213'],
      diagnosisCodes: ['J06.9'],
      resubmissionCount: 0,
      statusHistory: [],
      cms1500Data: {},
      save: jest.fn().mockResolvedValue(undefined),
    };
    (InsuranceClaimModel.findOne as jest.Mock).mockResolvedValue(claim);

    const { req, res } = makeReqRes({ note: 'Added modifier 25' }, {}, { claimId: 'c10' });
    await resubmitClaim(req, res);

    expect(claim.status).toBe('resubmitted');
    expect(transmitClaim).toHaveBeenCalledWith(claim, '7', 'user1');
  });
});
