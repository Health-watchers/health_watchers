import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { z } from 'zod';
import logger from '@api/utils/logger';

const router = Router();
router.use(authenticate, requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN'));

const submitClaimSchema = z.object({
  patientId: z.string().min(1),
  encounterId: z.string().optional(),
  procedureCodes: z.array(z.string()).min(1),
  diagnosisCodes: z.array(z.string()).min(1),
  claimAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().default('USD'),
  serviceDate: z.string().datetime(),
  insuranceCompany: z.string().optional(),
});

const verifyClaimSchema = z.object({
  claimId: z.string().min(1),
  claimData: z.object({
    patientId: z.string(),
    clinicId: z.string(),
    procedureCodes: z.array(z.string()),
    diagnosisCodes: z.array(z.string()),
    claimAmount: z.string(),
    currency: z.string(),
    serviceDate: z.string().datetime(),
    submissionDate: z.string().datetime(),
  }),
});

// POST /api/v1/payments/claims/submit
router.post(
  '/submit',
  validateRequest({ body: submitClaimSchema }),
  async (req: Request, res: Response) => {
    try {
      const { submitInsuranceClaim } = await import('./insurance-claims.service');

      const result = await submitInsuranceClaim({
        clinicId: req.user!.clinicId,
        patientId: req.body.patientId,
        encounterId: req.body.encounterId,
        procedureCodes: req.body.procedureCodes,
        diagnosisCodes: req.body.diagnosisCodes,
        claimAmount: req.body.claimAmount,
        currency: req.body.currency,
        serviceDate: new Date(req.body.serviceDate),
        insuranceCompany: req.body.insuranceCompany,
      });

      // Audit log
      import('../../../modules/audit/audit.service').then(({ auditLog }) =>
        auditLog(
          {
            action: 'INSURANCE_CLAIM_SUBMITTED',
            userId: req.user!.userId,
            clinicId: req.user!.clinicId,
            resourceType: 'insurance_claim',
            metadata: {
              claimId: result.claimId,
              claimAmount: req.body.claimAmount,
              procedureCodeCount: req.body.procedureCodes.length,
              diagnosisCodeCount: req.body.diagnosisCodes.length,
            },
          },
          req
        )
      ).catch(() => { /* non-critical */ });

      return res.status(201).json({
        success: true,
        ...result,
        stellarExplorerUrl: `https://stellar.expert/explorer/${process.env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet'}/tx/${result.claimHash}`,
      });
    } catch (error) {
      logger.error({ err: error }, 'Claim submission error');
      return res.status(500).json({
        error: 'ClaimSubmissionError',
        message: error instanceof Error ? error.message : 'Failed to submit claim',
      });
    }
  }
);

// POST /api/v1/payments/claims/verify
router.post(
  '/verify',
  validateRequest({ body: verifyClaimSchema }),
  async (req: Request, res: Response) => {
    try {
      const { verifyInsuranceClaim } = await import('./insurance-claims.service');

      const result = await verifyInsuranceClaim({
        claimId: req.body.claimId,
        claimData: {
          ...req.body.claimData,
          serviceDate: new Date(req.body.claimData.serviceDate),
          submissionDate: new Date(req.body.claimData.submissionDate),
        },
      });

      return res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error({ err: error }, 'Claim verification error');
      return res.status(500).json({
        error: 'ClaimVerificationError',
        message: error instanceof Error ? error.message : 'Failed to verify claim',
      });
    }
  }
);

// GET /api/v1/payments/claims/history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { getClaimHistory } = await import('./insurance-claims.service');
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

    const claims = await getClaimHistory(req.user!.clinicId, limit);

    return res.json({
      success: true,
      claims,
      count: claims.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Claim history retrieval error');
    return res.status(500).json({
      error: 'ClaimHistoryError',
      message: error instanceof Error ? error.message : 'Failed to retrieve claim history',
    });
  }
});

// GET /api/v1/payments/claims/:claimId
router.get('/:claimId', async (req: Request, res: Response) => {
  try {
    const { InsuranceClaimModel } = await import('../models/insurance-claim.model');

    const claim = await InsuranceClaimModel.findOne({
      claimId: req.params.claimId,
      clinicId: req.user!.clinicId,
    }).lean();

    if (!claim) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Claim not found',
      });
    }

    return res.json({
      success: true,
      claim: {
        ...claim,
        stellarExplorerUrl: claim.stellarTxHash
          ? `https://stellar.expert/explorer/${process.env.STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet'}/tx/${claim.stellarTxHash}`
          : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Claim retrieval error');
    return res.status(500).json({
      error: 'ClaimRetrievalError',
      message: error instanceof Error ? error.message : 'Failed to retrieve claim',
    });
  }
});

export const claimsRoutes = router;
