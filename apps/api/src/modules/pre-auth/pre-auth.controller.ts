import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { PreAuthModel } from './pre-auth.model';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { createPreAuthSchema, approvePreAuthSchema } from './pre-auth.validation';
import { stellarClient } from '@api/modules/payments/services/stellar-client';
import logger from '@api/utils/logger';

const router = Router();
router.use(authenticate);

const PRE_AUTH_EXPIRY_DAYS = 30;

// POST /pre-auth — create pre-authorization request and lock funds in escrow
router.post(
  '/',
  validateRequest({ body: createPreAuthSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { clinicId } = req.user!;
    const { patientId, encounterId, procedureCode, estimatedAmount, insuranceProvider, patientPublicKey } =
      req.body;

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
      logger.error({ err, patientId, procedureCode }, 'Failed to create claimable balance for pre-auth');
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
    const preAuths = await PreAuthModel.find({ clinicId, status })
      .sort({ createdAt: -1 })
      .lean();
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
    if (preAuth.status !== 'pending') {
      return res.status(409).json({ error: 'InvalidStatus', message: `Cannot approve a pre-auth with status '${preAuth.status}'` });
    }
    if (new Date() > preAuth.expiresAt) {
      return res.status(410).json({ error: 'Expired', message: 'Pre-authorization has expired' });
    }

    preAuth.status = 'approved';
    preAuth.preAuthNumber = req.body.preAuthNumber;
    preAuth.approvedAt = new Date();
    await preAuth.save();

    logger.info({ preAuthId: preAuth._id }, 'Pre-auth approved');
    return res.json({ status: 'success', data: preAuth });
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
    if (preAuth.status !== 'approved') {
      return res.status(409).json({ error: 'InvalidStatus', message: 'Pre-auth must be approved before claiming' });
    }
    if (!preAuth.claimableBalanceId) {
      return res.status(400).json({ error: 'MissingBalance', message: 'No claimable balance linked to this pre-auth' });
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

    preAuth.status = 'claimed';
    preAuth.claimedAt = new Date();
    await preAuth.save();

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
    if (!['pending', 'approved'].includes(preAuth.status)) {
      return res.status(409).json({ error: 'InvalidStatus', message: `Cannot deny a pre-auth with status '${preAuth.status}'` });
    }
    if (!preAuth.claimableBalanceId) {
      return res.status(400).json({ error: 'MissingBalance', message: 'No claimable balance linked to this pre-auth' });
    }

    let txHash: string;
    try {
      const result = await stellarClient.reclaimBalance(preAuth.claimableBalanceId);
      txHash = result.txHash;
    } catch (err: any) {
      logger.error({ err, preAuthId: preAuth._id }, 'Failed to reclaim balance on denial');
      return res.status(502).json({ error: 'StellarServiceError', message: err.message });
    }

    preAuth.status = 'denied';
    await preAuth.save();

    logger.info({ preAuthId: preAuth._id, txHash }, 'Pre-auth denied, funds reclaimed to patient');
    return res.json({ status: 'success', data: { ...preAuth.toObject(), txHash } });
  })
);

export { router as preAuthRoutes };
