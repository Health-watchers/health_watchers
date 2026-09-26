import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { InsuranceClaimModel, CLAIM_STATUSES, type ClaimStatus } from './claim.model';
import { buildCms1500, buildEdi837 } from './claim-builder';
import { EncounterModel } from '../encounters/encounter.model';

const objectId = (v: string) => (Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null);

function historyEvent(req: Request, status: ClaimStatus, note?: string) {
  const by = req.user?.userId ? objectId(String(req.user.userId)) : null;
  return { status, at: new Date(), ...(by ? { by } : {}), ...(note ? { note } : {}) };
}

/** Keeps the source encounter's billing status in step with its claim. */
async function syncEncounterStatus(
  encounterId: unknown,
  billingStatus: 'unbilled' | 'billed' | 'paid' | 'denied',
  claimId?: string
) {
  if (!encounterId) return;
  const update: Record<string, unknown> = { 'billing.billingStatus': billingStatus };
  if (billingStatus === 'billed') update['billing.billedAt'] = new Date();
  if (claimId) update['billing.insuranceClaimId'] = claimId;
  await EncounterModel.updateOne({ _id: encounterId }, { $set: update }).catch(() => undefined);
}

/**
 * POST /api/v1/billing/encounters/:id/generate-claim
 */
export async function generateClaim(req: Request, res: Response) {
  try {
    const { id: encounterId } = req.params;
    const {
      patientId,
      clinicNpi,
      patientDob,
      patientName,
      serviceDate,
      cptCodes,
      diagnosisCodes,
      amounts,
    } = req.body;
    const clinicId = req.user?.clinicId ?? req.body.clinicId;

    const input = {
      encounterId,
      patientId,
      clinicId,
      clinicNpi,
      patientDob,
      patientName,
      serviceDate,
      cptCodes,
      diagnosisCodes,
      amounts,
    };
    const cms1500Data = buildCms1500(input);
    const edi837Data = buildEdi837(input);
    const totalAmount = (amounts as number[]).reduce((s, a) => s + a, 0);

    const claim = await InsuranceClaimModel.create({
      encounterId,
      patientId,
      clinicId,
      cptCodes,
      diagnosisCodes,
      totalAmount,
      cms1500Data,
      edi837Data,
      status: 'draft',
      statusHistory: [historyEvent(req, 'draft', 'Claim generated')],
    });

    await syncEncounterStatus(encounterId, 'billed', String(claim._id));

    return res.status(201).json({ success: true, data: claim });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/billing/claims?status=rejected,written_off&page=1&limit=50
 * `meta.total` is the full count for the filter, not just the page length.
 */
export async function listClaims(req: Request, res: Response) {
  const clinicId = req.user!.clinicId;
  const { status } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

  const filter: Record<string, unknown> = { clinicId };
  if (typeof status === 'string' && status) {
    const statuses = status.split(',').filter((s) => CLAIM_STATUSES.includes(s as ClaimStatus));
    filter.status = { $in: statuses };
  }

  const [claims, total] = await Promise.all([
    InsuranceClaimModel.find(filter)
      .select('-edi837Data')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('patientId', 'firstName lastName systemId')
      .lean(),
    InsuranceClaimModel.countDocuments(filter),
  ]);

  return res.json({ success: true, data: claims, meta: { total, page, limit } });
}

/**
 * GET /api/v1/billing/claims/counts
 * Per-status claim totals plus the unbilled encounter total, for queue tabs.
 */
export async function getClaimCounts(req: Request, res: Response) {
  const clinicId = req.user!.clinicId;
  const clinicObjectId = objectId(String(clinicId));

  const [groups, unbilled] = await Promise.all([
    InsuranceClaimModel.aggregate([
      { $match: { clinicId: clinicObjectId ?? clinicId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    EncounterModel.countDocuments({ clinicId, 'billing.billingStatus': 'unbilled' }),
  ]);

  const byStatus = Object.fromEntries(CLAIM_STATUSES.map((s) => [s, 0])) as Record<
    ClaimStatus,
    number
  >;
  for (const g of groups) byStatus[g._id as ClaimStatus] = g.count;

  return res.json({ success: true, data: { unbilled, byStatus } });
}

/**
 * GET /api/v1/billing/claims/:claimId
 */
export async function getClaim(req: Request, res: Response) {
  const id = objectId(req.params.claimId);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid claim id' });

  const claim = await InsuranceClaimModel.findOne({ _id: id, clinicId: req.user!.clinicId })
    .populate('patientId', 'firstName lastName systemId dateOfBirth')
    .lean();
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  return res.json({ success: true, data: claim });
}

const bulkSubmitSchema = z.object({ claimIds: z.array(z.string()).min(1).max(200) });

/**
 * POST /api/v1/billing/claims/submit
 * Submits every selected draft claim. Non-draft ids are reported as skipped.
 */
export async function submitClaims(req: Request, res: Response) {
  const parsed = bulkSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'claimIds must be a non-empty array' });
  }

  const ids = parsed.data.claimIds.map(objectId).filter((v): v is Types.ObjectId => !!v);
  const filter = { _id: { $in: ids }, clinicId: req.user!.clinicId, status: 'draft' };
  const eligible = await InsuranceClaimModel.find(filter).select('_id').lean();
  const eligibleIds = eligible.map((c) => c._id);

  await InsuranceClaimModel.updateMany(
    { _id: { $in: eligibleIds } },
    {
      $set: { status: 'submitted', submittedAt: new Date() },
      $push: { statusHistory: historyEvent(req, 'submitted') },
    }
  );

  const submitted = eligibleIds.map(String);
  const skipped = parsed.data.claimIds.filter((id) => !submitted.includes(id));
  return res.json({ success: true, data: { submitted, skipped } });
}

const denySchema = z.object({ reason: z.string().trim().min(1) });

/**
 * PATCH /api/v1/billing/claims/:claimId/deny
 * Records a payer denial (manual entry until a clearinghouse feed is wired up).
 */
export async function denyClaim(req: Request, res: Response) {
  const parsed = denySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'A denial reason is required' });
  }
  const claim = await InsuranceClaimModel.findOneAndUpdate(
    {
      _id: objectId(req.params.claimId),
      clinicId: req.user!.clinicId,
      status: { $in: ['submitted', 'resubmitted', 'accepted'] },
    },
    {
      $set: { status: 'rejected', rejectionReason: parsed.data.reason },
      $push: { statusHistory: historyEvent(req, 'rejected', parsed.data.reason) },
    },
    { new: true }
  );
  if (!claim) {
    return res.status(404).json({ success: false, message: 'Submitted claim not found' });
  }
  await syncEncounterStatus(claim.encounterId, 'denied');
  return res.json({ success: true, data: claim });
}

const resubmitSchema = z
  .object({
    cptCodes: z.array(z.string().min(1)).min(1).optional(),
    diagnosisCodes: z.array(z.string().min(1)).optional(),
    amounts: z.array(z.number().nonnegative()).optional(),
    note: z.string().optional(),
  })
  .refine((b) => !b.amounts || (b.cptCodes && b.cptCodes.length === b.amounts.length), {
    message: 'amounts must have one entry per CPT code',
  });

/**
 * PATCH /api/v1/billing/claims/:claimId/resubmit
 * Optionally applies corrections to line items / diagnoses before resubmitting.
 */
export async function resubmitClaim(req: Request, res: Response) {
  const parsed = resubmitSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
  }
  const claim = await InsuranceClaimModel.findOne({
    _id: objectId(req.params.claimId),
    clinicId: req.user!.clinicId,
  });
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  if (claim.status !== 'rejected') {
    return res.status(409).json({ success: false, message: 'Only denied claims can be resubmitted' });
  }

  const { cptCodes, diagnosisCodes, amounts, note } = parsed.data;
  if (cptCodes || diagnosisCodes || amounts) {
    const cms = (claim.cms1500Data ?? {}) as Record<string, any>;
    const lines: Array<Record<string, any>> = cms.box24_servicelines ?? [];
    const nextCpt = cptCodes ?? claim.cptCodes;
    const nextAmounts = amounts ?? nextCpt.map((_, i) => Number(lines[i]?.charges ?? 0));
    const nextDx = diagnosisCodes ?? claim.diagnosisCodes;
    const input = {
      encounterId: String(claim.encounterId),
      patientId: String(claim.patientId),
      clinicId: String(claim.clinicId),
      clinicNpi: String(cms.box33_billingProviderNpi ?? ''),
      patientDob: String(cms.box3_patientDob ?? ''),
      patientName: String(cms.box2_patientName ?? ''),
      serviceDate: String(lines[0]?.dateOfService ?? new Date().toISOString().slice(0, 10)),
      cptCodes: nextCpt,
      diagnosisCodes: nextDx,
      amounts: nextAmounts,
    };
    claim.cptCodes = nextCpt;
    claim.diagnosisCodes = nextDx;
    claim.totalAmount = nextAmounts.reduce((s, a) => s + a, 0);
    claim.cms1500Data = buildCms1500(input);
    claim.edi837Data = buildEdi837(input);
  }

  claim.status = 'resubmitted';
  claim.rejectionReason = undefined;
  claim.submittedAt = new Date();
  claim.resubmissionCount = (claim.resubmissionCount ?? 0) + 1;
  claim.statusHistory.push(historyEvent(req, 'resubmitted', note || 'Corrected and resubmitted'));
  await claim.save();
  await syncEncounterStatus(claim.encounterId, 'billed');

  return res.json({ success: true, data: claim });
}

const writeOffSchema = z.object({ reason: z.string().trim().min(3) });

/**
 * PATCH /api/v1/billing/claims/:claimId/write-off
 */
export async function writeOffClaim(req: Request, res: Response) {
  const parsed = writeOffSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'A write-off reason is required' });
  }
  const claim = await InsuranceClaimModel.findOneAndUpdate(
    {
      _id: objectId(req.params.claimId),
      clinicId: req.user!.clinicId,
      status: { $nin: ['paid', 'written_off'] },
    },
    {
      $set: { status: 'written_off', writeOffReason: parsed.data.reason, writtenOffAt: new Date() },
      $push: { statusHistory: historyEvent(req, 'written_off', parsed.data.reason) },
    },
    { new: true }
  );
  if (!claim) return res.status(404).json({ success: false, message: 'Open claim not found' });
  return res.json({ success: true, data: claim });
}

const attachmentSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().url(),
  mimeType: z.string().optional(),
});

/**
 * POST /api/v1/billing/claims/:claimId/attachments
 * Links an already-uploaded document (e.g. from /documents) to the claim.
 */
export async function addClaimAttachment(req: Request, res: Response) {
  const parsed = attachmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'name and a valid url are required' });
  }
  const uploadedBy = req.user?.userId ? objectId(String(req.user.userId)) : null;
  const claim = await InsuranceClaimModel.findOneAndUpdate(
    { _id: objectId(req.params.claimId), clinicId: req.user!.clinicId },
    {
      $push: {
        attachments: {
          ...parsed.data,
          uploadedAt: new Date(),
          ...(uploadedBy ? { uploadedBy } : {}),
        },
      },
    },
    { new: true }
  );
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  return res.status(201).json({ success: true, data: claim });
}
