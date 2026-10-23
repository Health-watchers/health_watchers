import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { InsuranceClaimModel, CLAIM_STATUSES, type ClaimStatus } from './claim.model';
import { buildCms1500, buildEdi837 } from './claim-builder';
import { generateCms1500Pdf } from './cms1500-pdf.service';
import { claimToBillingInput, validateClaimInput } from './claim-validation';
import {
  CORRECTABLE_STATUSES,
  IN_FLIGHT_STATUSES,
  canTransition,
  encounterBillingStatusFor,
} from './claim-status';
import { postRemittance, statusEvent, syncClaim } from './claim-lifecycle.service';
import { EncounterModel } from '../encounters/encounter.model';
import { auditLog } from '../audit/audit.service';

const objectId = (v: string) => (Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null);

async function findClaim(req: Request) {
  const id = objectId(req.params.claimId);
  if (!id) return null;
  return InsuranceClaimModel.findOne({ _id: id, clinicId: req.user!.clinicId });
}

async function audit(req: Request, claimId: string, metadata: Record<string, unknown>) {
  await auditLog(
    {
      action: 'UPDATE',
      resourceType: 'InsuranceClaim',
      resourceId: claimId,
      userId: req.user?.userId,
      clinicId: req.user!.clinicId,
      outcome: 'SUCCESS',
      metadata,
    },
    req
  );
}

/**
 * GET /api/v1/billing/claims/:claimId/cms1500.pdf
 * Streams the claim as a CMS-1500 (02/12) PDF.
 */
export async function downloadCms1500(req: Request, res: Response) {
  const claim = await findClaim(req);
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });

  const resubmitted = (claim.resubmissionCount ?? 0) > 0;
  const pdf = await generateCms1500Pdf({
    claimId: String(claim._id),
    data: {
      ...(claim.cms1500Data as Record<string, unknown>),
      box29_amountPaid: claim.paidAmount || undefined,
      ...(resubmitted
        ? {
            box22_resubmissionCode: '7',
            box22_originalRefNumber: claim.clearinghouse?.payerClaimId,
          }
        : {}),
    },
    submissionLabel: resubmitted ? `CORRECTED (7) #${claim.resubmissionCount}` : 'ORIGINAL',
  });

  await auditLog(
    {
      action: 'CLAIM_FORM_EXPORT',
      resourceType: 'InsuranceClaim',
      resourceId: String(claim._id),
      userId: req.user?.userId,
      clinicId: req.user!.clinicId,
      outcome: 'SUCCESS',
      metadata: { format: 'CMS-1500 PDF' },
    },
    req
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="cms1500-${String(claim._id)}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(pdf);
}

/**
 * POST /api/v1/billing/claims/validate
 * Validates CMS-1500 fields for a claim that has not been generated yet.
 */
export async function validateClaimPayload(req: Request, res: Response) {
  const result = validateClaimInput(req.body ?? {});
  return res.status(result.valid ? 200 : 422).json({ success: result.valid, data: result });
}

/**
 * GET /api/v1/billing/claims/:claimId/validation
 * Re-validates a stored claim's CMS-1500 fields.
 */
export async function validateStoredClaim(req: Request, res: Response) {
  const claim = await findClaim(req);
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  return res.json({ success: true, data: validateClaimInput(claimToBillingInput(claim)) });
}

const transitionSchema = z.object({
  status: z.enum(CLAIM_STATUSES as [ClaimStatus, ...ClaimStatus[]]),
  note: z.string().trim().max(1000).optional(),
  reason: z.string().trim().max(1000).optional(),
  payerClaimId: z.string().trim().max(50).optional(),
});

/**
 * PATCH /api/v1/billing/claims/:claimId/status
 * Manual status update (e.g. a payer phone/portal update) enforcing the claim state machine.
 * Resubmission and write-off go through their dedicated endpoints.
 */
export async function transitionClaimStatus(req: Request, res: Response) {
  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
  }
  const { status, note, reason, payerClaimId } = parsed.data;
  if (status === 'resubmitted' || status === 'written_off' || status === 'draft') {
    return res.status(400).json({
      success: false,
      message: `Use the dedicated endpoint to move a claim to "${status}"`,
    });
  }
  if ((status === 'rejected' || status === 'denied') && !reason) {
    return res.status(400).json({ success: false, message: 'A reason is required' });
  }

  const claim = await findClaim(req);
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  const from = claim.status;
  if (!canTransition(from, status)) {
    return res.status(409).json({
      success: false,
      message: `Cannot move a claim from "${from}" to "${status}"`,
      data: { from, to: status },
    });
  }

  claim.status = status;
  if (status === 'submitted') claim.submittedAt = new Date();
  if (status === 'accepted') claim.acceptedAt = new Date();
  if (status === 'paid') claim.paidAt = new Date();
  if (status === 'rejected') claim.rejectionReason = reason;
  if (status === 'denied') {
    claim.denialReason = reason;
    claim.rejectionReason = reason;
  }
  if (payerClaimId) {
    if (!claim.clearinghouse?.provider) claim.set('clearinghouse.provider', 'mock');
    claim.set('clearinghouse.payerClaimId', payerClaimId);
  }
  claim.statusHistory.push(statusEvent(status, req.user?.userId, reason ?? note));
  await claim.save();

  await EncounterModel.updateOne(
    { _id: claim.encounterId },
    { $set: { 'billing.billingStatus': encounterBillingStatusFor(status) } }
  ).catch(() => undefined);
  await audit(req, String(claim._id), { statusChange: `${from} → ${status}`, reason, note });

  return res.json({ success: true, data: claim });
}

const remittanceSchema = z.object({
  eraId: z.string().trim().min(1).max(80),
  payerName: z.string().trim().max(120).optional(),
  checkNumber: z.string().trim().max(50).optional(),
  paymentMethod: z.enum(['ACH', 'CHK', 'NON']).optional(),
  claimStatusCode: z.string().trim().max(3).optional(),
  billedAmount: z.number().nonnegative(),
  allowedAmount: z.number().nonnegative().optional(),
  paidAmount: z.number().nonnegative(),
  patientResponsibility: z.number().nonnegative().default(0),
  adjustments: z
    .array(
      z.object({
        groupCode: z.enum(['CO', 'PR', 'OA', 'PI', 'CR']),
        reasonCode: z.string().trim().min(1).max(5),
        amount: z.number(),
        remarkCode: z.string().trim().max(10).optional(),
      })
    )
    .default([]),
  receivedAt: z.coerce.date().optional(),
});

/**
 * POST /api/v1/billing/claims/:claimId/remittances
 * Posts an Electronic Remittance Advice (835) entry, moving the claim to paid or denied.
 */
export async function recordRemittance(req: Request, res: Response) {
  const parsed = remittanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
  }
  const claim = await findClaim(req);
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  if (![...IN_FLIGHT_STATUSES, 'paid', 'denied'].includes(claim.status)) {
    return res.status(409).json({
      success: false,
      message: `Remittances cannot be posted to a ${claim.status} claim`,
    });
  }

  const from = claim.status;
  const updated = await postRemittance(
    claim,
    { ...parsed.data, receivedAt: parsed.data.receivedAt ?? new Date() },
    req.user?.userId
  );
  await audit(req, String(claim._id), {
    statusChange: from === updated.status ? undefined : `${from} → ${updated.status}`,
    eraId: parsed.data.eraId,
    paidAmount: parsed.data.paidAmount,
  });
  return res.status(201).json({ success: true, data: updated });
}

/**
 * POST /api/v1/billing/claims/:claimId/sync
 * Polls the clearinghouse (276/277 + 835) for one claim.
 */
export async function syncClaimStatus(req: Request, res: Response) {
  const claim = await findClaim(req);
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  if (!claim.clearinghouse?.submissionId) {
    return res.status(409).json({ success: false, message: 'Claim has not been sent to a clearinghouse' });
  }
  const result = await syncClaim(claim, req.user?.userId);
  if (result.previousStatus !== result.status) {
    await audit(req, String(claim._id), {
      statusChange: `${result.previousStatus} → ${result.status}`,
      source: 'clearinghouse',
    });
  }
  return res.json({ success: true, data: { ...result, claim } });
}

/**
 * POST /api/v1/billing/claims/sync
 * Polls the clearinghouse for every in-flight claim in the clinic (max 200 per call).
 */
export async function syncOpenClaims(req: Request, res: Response) {
  const claims = await InsuranceClaimModel.find({
    clinicId: req.user!.clinicId,
    status: { $in: IN_FLIGHT_STATUSES },
    'clearinghouse.submissionId': { $exists: true },
  })
    .sort({ submittedAt: 1 })
    .limit(200);

  const results = [];
  for (const claim of claims) {
    try {
      results.push(await syncClaim(claim, req.user?.userId));
    } catch (err) {
      results.push({ claimId: String(claim._id), error: (err as Error).message });
    }
  }
  const changed = results.filter((r: any) => r.status && r.status !== r.previousStatus);
  return res.json({ success: true, data: { checked: results.length, changed: changed.length, results } });
}

const correctionSchema = z
  .object({
    cptCodes: z.array(z.string().trim().min(1)).min(1).optional(),
    diagnosisCodes: z.array(z.string().trim().min(1)).optional(),
    amounts: z.array(z.number().nonnegative()).optional(),
    patientName: z.string().trim().min(1).optional(),
    patientDob: z.string().trim().optional(),
    serviceDate: z.string().trim().optional(),
    clinicNpi: z.string().trim().optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((b) => !b.amounts || (b.cptCodes && b.cptCodes.length === b.amounts.length), {
    message: 'amounts must have one entry per CPT code',
  });

/**
 * PATCH /api/v1/billing/claims/:claimId/correct
 * Applies corrections to a draft, rejected or denied claim without sending it. The corrected
 * fields are validated and every change is recorded in `corrections` for the audit trail.
 * Use /resubmit to send the corrected claim.
 */
export async function correctClaim(req: Request, res: Response) {
  const parsed = correctionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0].message });
  }
  const claim = await findClaim(req);
  if (!claim) return res.status(404).json({ success: false, message: 'Claim not found' });
  if (!CORRECTABLE_STATUSES.includes(claim.status)) {
    return res.status(409).json({
      success: false,
      message: 'Only draft, rejected or denied claims can be corrected',
    });
  }

  const current = claimToBillingInput(claim);
  const { note, ...patch } = parsed.data;
  const next = {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  };
  if (patch.cptCodes && !patch.amounts) {
    next.amounts = patch.cptCodes.map((_, i) => current.amounts[i] ?? 0);
  }

  const validation = validateClaimInput(next);
  if (!validation.valid) {
    return res.status(422).json({ success: false, message: 'Claim has invalid fields', data: validation });
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(patch) as (keyof typeof current)[]) {
    if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) {
      changes[key] = { from: current[key], to: next[key] };
    }
  }
  if (!Object.keys(changes).length) {
    return res.status(400).json({ success: false, message: 'No changes to apply' });
  }

  claim.cptCodes = next.cptCodes;
  claim.diagnosisCodes = next.diagnosisCodes;
  claim.totalAmount = next.amounts.reduce((s, a) => s + a, 0);
  claim.cms1500Data = buildCms1500(next);
  claim.edi837Data = buildEdi837(next);
  const by = req.user?.userId ? objectId(String(req.user.userId)) : null;
  claim.corrections = [
    ...(claim.corrections ?? []),
    { at: new Date(), ...(by ? { by } : {}), ...(note ? { note } : {}), changes },
  ];
  await claim.save();

  await audit(req, String(claim._id), { correction: Object.keys(changes), note });
  return res.json({ success: true, data: claim });
}

/**
 * GET /api/v1/billing/claims/era?from=&to=&page=&limit=
 * ERA dashboard: remittance totals, denial rate, top adjustment reasons and the remittance feed.
 */
export async function getEraDashboard(req: Request, res: Response) {
  const clinicId = objectId(String(req.user!.clinicId)) ?? req.user!.clinicId;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const range: Record<string, Date> = {};
  for (const [key, op] of [
    ['from', '$gte'],
    ['to', '$lte'],
  ] as const) {
    const raw = req.query[key];
    if (typeof raw !== 'string' || !raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ success: false, message: `Invalid ${key} date` });
    }
    range[op] = d;
  }
  const eraMatch = Object.keys(range).length ? { 'remittances.receivedAt': range } : {};

  const base = [
    { $match: { clinicId } },
    { $unwind: '$remittances' },
    { $match: eraMatch },
  ];

  const [totals] = await InsuranceClaimModel.aggregate([
    ...base,
    {
      $group: {
        _id: null,
        remittanceCount: { $sum: 1 },
        billed: { $sum: '$remittances.billedAmount' },
        allowed: { $sum: { $ifNull: ['$remittances.allowedAmount', 0] } },
        paid: { $sum: '$remittances.paidAmount' },
        patientResponsibility: { $sum: '$remittances.patientResponsibility' },
        deniedCount: { $sum: { $cond: [{ $eq: ['$remittances.paidAmount', 0] }, 1, 0] } },
      },
    },
  ]);

  const topAdjustments = await InsuranceClaimModel.aggregate([
    ...base,
    { $unwind: '$remittances.adjustments' },
    {
      $group: {
        _id: {
          groupCode: '$remittances.adjustments.groupCode',
          reasonCode: '$remittances.adjustments.reasonCode',
        },
        count: { $sum: 1 },
        amount: { $sum: '$remittances.adjustments.amount' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  const [feed] = await InsuranceClaimModel.aggregate([
    ...base,
    { $sort: { 'remittances.receivedAt': -1 } },
    {
      $facet: {
        items: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: {
              from: 'patients',
              localField: 'patientId',
              foreignField: '_id',
              as: 'patient',
              pipeline: [{ $project: { firstName: 1, lastName: 1, systemId: 1 } }],
            },
          },
          {
            $project: {
              _id: 0,
              claimId: '$_id',
              claimStatus: '$status',
              patient: { $first: '$patient' },
              remittance: '$remittances',
            },
          },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);

  const statusCounts = await InsuranceClaimModel.aggregate([
    { $match: { clinicId, status: { $in: ['submitted', 'resubmitted', 'accepted', 'rejected', 'denied', 'paid'] } } },
    { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } },
  ]);

  const remittanceCount = totals?.remittanceCount ?? 0;
  return res.json({
    success: true,
    data: {
      summary: {
        remittanceCount,
        billed: totals?.billed ?? 0,
        allowed: totals?.allowed ?? 0,
        paid: totals?.paid ?? 0,
        patientResponsibility: totals?.patientResponsibility ?? 0,
        adjustments: (totals?.billed ?? 0) - (totals?.paid ?? 0) - (totals?.patientResponsibility ?? 0),
        denialRate: remittanceCount ? (totals?.deniedCount ?? 0) / remittanceCount : 0,
        collectionRate: totals?.billed ? (totals?.paid ?? 0) / totals.billed : 0,
      },
      byStatus: Object.fromEntries(statusCounts.map((s: any) => [s._id, { count: s.count, amount: s.amount }])),
      topAdjustments: topAdjustments.map((a: any) => ({
        groupCode: a._id.groupCode,
        reasonCode: a._id.reasonCode,
        count: a.count,
        amount: a.amount,
      })),
      remittances: feed?.items ?? [],
      meta: { total: feed?.total?.[0]?.n ?? 0, page, limit },
    },
  });
}
