import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { PreAuthModel } from './pre-auth.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { createPreAuthSchema, approvePreAuthSchema } from './pre-auth.validation';
import { stellarClient } from '@api/modules/payments/services/stellar-client';
import { dispatchNotification } from '@api/modules/notifications/notification.service';
import { NotificationHandler } from '@api/modules/notifications/notification.handler';
import logger from '@api/utils/logger';

const router = Router();
router.use(authenticate);

const PRE_AUTH_EXPIRY_DAYS = 90;

type PreAuthStatus =
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'denied'
  | 'more-info-needed'
  | 'claimed';

// Allowed state transitions for the pre-authorization workflow.
const ALLOWED_TRANSITIONS: Record<PreAuthStatus, PreAuthStatus[]> = {
  pending: ['submitted'],
  submitted: ['approved', 'denied', 'more-info-needed'],
  'more-info-needed': ['submitted'],
  approved: ['denied', 'claimed'],
  denied: [],
  claimed: [],
};

function canTransition(from: PreAuthStatus, to: PreAuthStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

function isExpired(preAuth: any): boolean {
  if (!preAuth) return false;
  if (preAuth.status === 'approved' && preAuth.approvedAt) {
    const expiry = new Date(preAuth.approvedAt);
    expiry.setDate(expiry.getDate() + PRE_AUTH_EXPIRY_DAYS);
    return new Date() > expiry;
  }
  return preAuth.expiresAt ? new Date() > new Date(preAuth.expiresAt) : false;
}

/**
 * Billing guard: ensures a pre-authorization is approved and not expired before
 * a claim can be submitted. Throws an error with a `status` property on failure.
 */
export async function assertPreAuthApproved(
  preAuthId: string,
  clinicId: string
): Promise<any> {
  const preAuth = await PreAuthModel.findOne({ _id: preAuthId, clinicId });
  if (!preAuth) {
    const err: any = new Error('Pre-authorization not found');
    err.status = 404;
    err.code = 'NotFound';
    throw err;
  }
  if (preAuth.status !== 'approved') {
    const err: any = new Error(
      `Pre-authorization must be approved before claim submission (current status: '${preAuth.status}')`
    );
    err.status = 409;
    err.code = 'PreAuthNotApproved';
    throw err;
  }
  if (isExpired(preAuth)) {
    const err: any = new Error('Pre-authorization has expired');
    err.status = 410;
    err.code = 'Expired';
    throw err;
  }
  return preAuth;
}

async function notifyStatusChange(
  preAuth: any,
  previousStatus: PreAuthStatus,
  newStatus: PreAuthStatus,
  actorId?: string
): Promise<void> {
  try {
    await dispatchNotification({
      type: 'pre_auth_status_change',
      clinicId: preAuth.clinicId,
      recipientRoles: ['CLINIC_ADMIN', 'CLINIC_STAFF'],
      data: {
        preAuthId: String(preAuth._id),
        patientId: preAuth.patientId,
        procedureCode: preAuth.procedureCode,
        previousStatus,
        newStatus,
        actorId,
      },
    });
  } catch (err) {
    logger.error({ err, preAuthId: preAuth._id }, 'Failed to dispatch pre-auth notification');
  }

  try {
    NotificationHandler.emit('pre_auth_status_change', {
      preAuthId: String(preAuth._id),
      clinicId: preAuth.clinicId,
      previousStatus,
      newStatus,
    });
  } catch (err) {
    logger.error({ err, preAuthId: preAuth._id }, 'Failed to emit pre-auth realtime event');
  }
}

async function transitionStatus(
  preAuth: any,
  newStatus: PreAuthStatus,
  actorId?: string
): Promise<void> {
  const previousStatus = preAuth.status as PreAuthStatus;
  preAuth.status = newStatus;
  await preAuth.save();
  await notifyStatusChange(preAuth, previousStatus, newStatus, actorId);
}

// POST /pre-auth — create pre-authorization request and lock funds in escrow
router.post(
  '/',
  validateRequest({ body: createPreAuthSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const {
      patientId,
      encounterId,
      procedureCode,
      estimatedAmount,
      insuranceProvider,
      patientPublicKey,
    } = req.body;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + PRE_AUTH_EXPIRY_DAYS);

    // Create a claimable balance on Stellar:
    // - claimant (clinic) can claim after approval
    // - patient can reclaim after expiry
    let claimableBalanceId: string | undefined;
    try {
      const result = await stellarClient.createClaimableBalance({
        fromPublicKey: patientPublicKey,
        amount: estimatedAmount,
        claimantPublicKey: patientPublicKey, // patient reclaims if denied/expired
        claimableUntil: expiresAt.toISOString(),
        memo: `PRE-AUTH:${procedureCode}`,
      });
      claimableBalanceId = result.balanceId;
    } catch (err: any) {
      logger.error(
        { err, patientId, procedureCode },
        'Failed to create claimable balance for pre-auth'
      );
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }

    const preAuth = await PreAuthModel.create({
      patientId,
      clinicId,
      encounterId,
      procedureCode,
      estimatedAmount,
      insuranceProvider,
      claimableBalanceId,
      status: 'pending',
      expiresAt,
    });

    logger.info({ preAuthId: preAuth._id, claimableBalanceId }, 'Pre-auth created');

    return res.status(201).json({ status: 'success', data: preAuth });
  })
);

// GET /pre-auth/:id — get pre-auth status
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const preAuth = await PreAuthModel.findOne({ _id: req.params.id, clinicId }).lean();
    if (!preAuth) {
      return res.status(404).json({ error: 'NotFound', message: 'Pre-authorization not found' });
    }
    return res.json({ status: 'success', data: preAuth });
  })
);

// GET /pre-auth — list pending pre-auths for CLINIC_ADMIN
router.get(
  '/',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const status = (req.query.status as string) || 'pending';
    const preAuths = await PreAuthModel.find({ clinicId, status }).sort({ createdAt: -1 }).lean();
    return res.json({ status: 'success', data: preAuths });
  })
);

// PUT /pre-auth/:id/approve — mark as approved (CLINIC_ADMIN only)
router.put(
  '/:id/approve',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  validateRequest({ body: approvePreAuthSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const preAuth = await PreAuthModel.findOne({ _id: req.params.id, clinicId });
    if (!preAuth) {
      return res.status(404).json({ error: 'NotFound', message: 'Pre-authorization not found' });
    }
    if (!canTransition(preAuth.status as PreAuthStatus, 'approved')) {
      return res.status(409).json({
        error: 'InvalidStatus',
        message: `Cannot approve a pre-auth with status '${preAuth.status}'`,
      });
    }
    if (new Date() > preAuth.expiresAt) {
      return res.status(410).json({ error: 'Expired', message: 'Pre-authorization has expired' });
    }

    preAuth.preAuthNumber = req.body.preAuthNumber;
    preAuth.approvedAt = new Date();
    await transitionStatus(preAuth, 'approved', req.user!.userId);

    logger.info({ preAuthId: preAuth._id }, 'Pre-auth approved');
    return res.json({ status: 'success', data: preAuth });
  })
);

// POST /pre-auth/:id/submit — submit a pending (or more-info-needed) pre-auth for review
router.post(
  '/:id/submit',
  requireRoles('CLINIC_ADMIN', 'CLINIC_STAFF', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const preAuth = await PreAuthModel.findOne({ _id: req.params.id, clinicId });
    if (!preAuth) {
      return res.status(404).json({ error: 'NotFound', message: 'Pre-authorization not found' });
    }
    if (!canTransition(preAuth.status as PreAuthStatus, 'submitted')) {
      return res.status(409).json({
        error: 'InvalidStatus',
        message: `Cannot submit a pre-auth with status '${preAuth.status}'`,
      });
    }
    if (new Date() > preAuth.expiresAt) {
      return res.status(410).json({ error: 'Expired', message: 'Pre-authorization has expired' });
    }

    await transitionStatus(preAuth, 'submitted', req.user!.userId);

    logger.info({ preAuthId: preAuth._id }, 'Pre-auth submitted');
    return res.json({ status: 'success', data: preAuth });
  })
);

// POST /pre-auth/bulk-submit — submit multiple pre-auths at once
router.post(
  '/bulk-submit',
  requireRoles('CLINIC_ADMIN', 'CLINIC_STAFF', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: '`ids` must be a non-empty array' });
    }

    const results: Array<{
      id: string;
      success: boolean;
      status?: string;
      error?: string;
    }> = [];

    for (const id of ids) {
      try {
        const preAuth = await PreAuthModel.findOne({ _id: id, clinicId });
        if (!preAuth) {
          results.push({ id, success: false, error: 'NotFound' });
          continue;
        }
        if (!canTransition(preAuth.status as PreAuthStatus, 'submitted')) {
          results.push({
            id,
            success: false,
            status: preAuth.status,
            error: 'InvalidStatus',
          });
          continue;
        }
        if (new Date() > preAuth.expiresAt) {
          results.push({ id, success: false, status: preAuth.status, error: 'Expired' });
          continue;
        }
        await transitionStatus(preAuth, 'submitted', req.user!.userId);
        results.push({ id, success: true, status: 'submitted' });
      } catch (err: any) {
        logger.error({ err, preAuthId: id }, 'Bulk submit failed for pre-auth');
        results.push({ id, success: false, error: err.message || 'InternalError' });
      }
    }

    const submitted = results.filter((r) => r.success).length;
    return res.json({
      status: 'success',
      data: { submitted, failed: results.length - submitted, results },
    });
  })
);

// POST /pre-auth/:id/claim — clinic claims the escrowed funds after approval
router.post(
  '/:id/claim',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const preAuth = await PreAuthModel.findOne({ _id: req.params.id, clinicId });
    if (!preAuth) {
      return res.status(404).json({ error: 'NotFound', message: 'Pre-authorization not found' });
    }
    if (!canTransition(preAuth.status as PreAuthStatus, 'claimed')) {
      return res
        .status(409)
        .json({ error: 'InvalidStatus', message: 'Pre-auth must be approved before claiming' });
    }
    if (!preAuth.claimableBalanceId) {
      return res
        .status(400)
        .json({ error: 'MissingBalance', message: 'No claimable balance linked to this pre-auth' });
    }
    if (new Date() > preAuth.expiresAt) {
      return res.status(410).json({ error: 'Expired', message: 'Pre-authorization has expired' });
    }

    let txHash: string;
    try {
      const result = await stellarClient.claimBalance(preAuth.claimableBalanceId);
      txHash = result.txHash;
    } catch (err: any) {
      logger.error({ err, preAuthId: preAuth._id }, 'Failed to claim claimable balance');
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }

    preAuth.claimedAt = new Date();
    await transitionStatus(preAuth, 'claimed', req.user!.userId);

    logger.info({ preAuthId: preAuth._id, txHash }, 'Pre-auth funds claimed');
    return res.json({ status: 'success', data: { ...preAuth.toObject(), txHash } });
  })
);

// POST /pre-auth/:id/deny — deny and trigger patient reclaim
router.post(
  '/:id/deny',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const preAuth = await PreAuthModel.findOne({ _id: req.params.id, clinicId });
    if (!preAuth) {
      return res.status(404).json({ error: 'NotFound', message: 'Pre-authorization not found' });
    }
    if (!canTransition(preAuth.status as PreAuthStatus, 'denied')) {
      return res.status(409).json({
        error: 'InvalidStatus',
        message: `Cannot deny a pre-auth with status '${preAuth.status}'`,
      });
    }
    if (!preAuth.claimableBalanceId) {
      return res
        .status(400)
        .json({ error: 'MissingBalance', message: 'No claimable balance linked to this pre-auth' });
    }

    let txHash: string;
    try {
      const result = await stellarClient.reclaimBalance(preAuth.claimableBalanceId);
      txHash = result.txHash;
    } catch (err: any) {
      logger.error({ err, preAuthId: preAuth._id }, 'Failed to reclaim balance on denial');
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }

    await transitionStatus(preAuth, 'denied', req.user!.userId);

    logger.info({ preAuthId: preAuth._id, txHash }, 'Pre-auth denied, funds reclaimed to patient');
    return res.json({ status: 'success', data: { ...preAuth.toObject(), txHash } });
  })
);

// POST /pre-auth/:id/more-info — request additional information (submitted only)
router.post(
  '/:id/more-info',
  requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const preAuth = await PreAuthModel.findOne({ _id: req.params.id, clinicId });
    if (!preAuth) {
      return res.status(404).json({ error: 'NotFound', message: 'Pre-authorization not found' });
    }
    if (!canTransition(preAuth.status as PreAuthStatus, 'more-info-needed')) {
      return res.status(409).json({
        error: 'InvalidStatus',
        message: `Cannot request more info for a pre-auth with status '${preAuth.status}'`,
      });
    }

    await transitionStatus(preAuth, 'more-info-needed', req.user!.userId);

    logger.info({ preAuthId: preAuth._id }, 'Pre-auth marked as more-info-needed');
    return res.json({ status: 'success', data: preAuth });
  })
);

export { router as preAuthRoutes };
