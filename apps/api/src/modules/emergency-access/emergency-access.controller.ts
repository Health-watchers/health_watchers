import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { validateObjectId } from '@api/middlewares/common.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { PatientModel } from '../patients/models/patient.model';
import { auditLog } from '../audit/audit.service';
import {
  listEmergencyAccessQuerySchema,
  requestEmergencyAccessSchema,
  reviewEmergencyAccessSchema,
} from './emergency-access.validation';
import {
  createGrant,
  endGrant,
  findActiveGrant,
  listGrants,
  notifyComplianceOfficers,
  reviewGrant,
  toGrantResponse,
} from './emergency-access.service';

// ── Clinician-facing: /patients/:id/emergency-access ─────────────────────────

// Mounted under /patients ahead of patientRoutes, so authenticate per route rather than
// with router.use() to avoid authenticating every other /patients request twice.
const patientRouter = Router();

/**
 * @swagger
 * /patients/{id}/emergency-access:
 *   post:
 *     summary: Break-the-glass — request time-limited emergency access to a patient (#1493)
 *     description: >
 *       Grants the calling clinician access to a patient outside their care team for
 *       up to 60 minutes. A reason is mandatory; the grant is audited, compliance
 *       officers are alerted in real time and it is queued for compliance review.
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason, justification]
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [LIFE_THREATENING_EMERGENCY, PATIENT_UNABLE_TO_CONSENT, URGENT_CONTINUITY_OF_CARE, COVERING_FOR_TREATING_CLINICIAN, OTHER]
 *               justification: { type: string, minLength: 20, maxLength: 1000 }
 *               durationMinutes: { type: integer, minimum: 5, maximum: 60, default: 60 }
 *     responses:
 *       201:
 *         description: Emergency access granted
 *       200:
 *         description: An active grant already exists and is returned
 *       400:
 *         description: Validation error, or the patient is already in the caller's care team
 *       404:
 *         description: Patient not found
 */
patientRouter.post(
  '/:id/emergency-access',
  authenticate,
  validateObjectId('id'),
  requireRoles('DOCTOR', 'NURSE'),
  validateRequest({ body: requestEmergencyAccessSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, clinicId } = req.user!;
    const patient = await PatientModel.findById(req.params.id).select('clinicId').lean<{
      _id: unknown;
      clinicId: unknown;
    } | null>();
    if (!patient) return res.status(404).json({ error: 'NotFound', message: 'Patient not found' });

    if (String(patient.clinicId) === String(clinicId)) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'Emergency access is only needed for patients outside your care team',
      });
    }

    const existing = await findActiveGrant(userId, req.params.id);
    if (existing) return res.json({ status: 'success', data: toGrantResponse(existing) });

    const grant = await createGrant({
      userId,
      clinicId,
      patientId: req.params.id,
      patientClinicId: String(patient.clinicId),
      input: req.body,
    });

    await auditLog(
      {
        action: 'EMERGENCY_ACCESS_GRANTED',
        resourceType: 'Patient',
        resourceId: req.params.id,
        userId,
        clinicId,
        emergencyAccess: true,
        metadata: {
          emergencyAccessGrantId: String(grant._id),
          reason: grant.reason,
          justification: grant.justification,
          patientClinicId: String(patient.clinicId),
          expiresAt: grant.expiresAt,
        },
      },
      req
    );
    await notifyComplianceOfficers(grant);

    return res.status(201).json({ status: 'success', data: toGrantResponse(grant) });
  })
);

/**
 * @swagger
 * /patients/{id}/emergency-access:
 *   get:
 *     summary: The caller's active emergency access grant for a patient, if any (#1493)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active grant, or `data: null`
 */
patientRouter.get(
  '/:id/emergency-access',
  authenticate,
  validateObjectId('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const grant = await findActiveGrant(req.user!.userId, req.params.id);
    return res.json({ status: 'success', data: grant ? toGrantResponse(grant) : null });
  })
);

/**
 * @swagger
 * /patients/{id}/emergency-access:
 *   delete:
 *     summary: End the caller's emergency access before it expires (#1493)
 *     tags: [Patients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Access ended
 *       404:
 *         description: No active grant
 */
patientRouter.delete(
  '/:id/emergency-access',
  authenticate,
  validateObjectId('id'),
  asyncHandler(async (req: Request, res: Response) => {
    const active = await findActiveGrant(req.user!.userId, req.params.id);
    const ended = active ? await endGrant(active._id) : null;
    if (!ended) {
      return res.status(404).json({ error: 'NotFound', message: 'No active emergency access' });
    }

    await auditLog(
      {
        action: 'EMERGENCY_ACCESS_ENDED',
        resourceType: 'Patient',
        resourceId: req.params.id,
        userId: req.user!.userId,
        clinicId: req.user!.clinicId,
        emergencyAccess: true,
        metadata: { emergencyAccessGrantId: String(ended._id) },
      },
      req
    );
    return res.json({ status: 'success', data: toGrantResponse(ended) });
  })
);

// ── Compliance review queue: /compliance/emergency-access ────────────────────

const reviewRouter = Router();
reviewRouter.use(authenticate);
reviewRouter.use(requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'));

/**
 * @swagger
 * /compliance/emergency-access:
 *   get:
 *     summary: Emergency access review queue (#1493)
 *     description: CLINIC_ADMIN sees grants involving their clinic; SUPER_ADMIN sees all.
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, APPROVED, FLAGGED] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated emergency access grants
 */
reviewRouter.get(
  '/',
  validateRequest({ query: listEmergencyAccessQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const query = listEmergencyAccessQuerySchema.parse(req.query);
    const { grants, total } = await listGrants(req.user!, query);
    const totalPages = Math.ceil(total / query.limit);
    return res.json({
      status: 'success',
      data: grants.map((g) => toGrantResponse(g)),
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages,
        hasNext: query.page < totalPages,
        hasPrev: query.page > 1,
      },
    });
  })
);

/**
 * @swagger
 * /compliance/emergency-access/{grantId}/review:
 *   patch:
 *     summary: Record a compliance decision on an emergency access (#1493)
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision: { type: string, enum: [APPROVED, FLAGGED] }
 *               notes: { type: string, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: Review recorded
 *       403:
 *         description: Reviewers cannot review their own emergency access
 *       404:
 *         description: Grant not found
 */
reviewRouter.patch(
  '/:grantId/review',
  validateObjectId('grantId'),
  validateRequest({ body: reviewEmergencyAccessSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await reviewGrant(req.params.grantId, req.user!, req.body);
    if (result === 'NOT_FOUND') {
      return res.status(404).json({ error: 'NotFound', message: 'Emergency access not found' });
    }
    if (result === 'SELF_REVIEW') {
      return res
        .status(403)
        .json({ error: 'Forbidden', message: 'You cannot review your own emergency access' });
    }

    await auditLog(
      {
        action: 'EMERGENCY_ACCESS_REVIEWED',
        resourceType: 'EmergencyAccessGrant',
        resourceId: String(result._id),
        userId: req.user!.userId,
        clinicId: req.user!.clinicId,
        emergencyAccess: true,
        metadata: { decision: result.reviewStatus, patientId: String(result.patientId) },
      },
      req
    );
    return res.json({ status: 'success', data: toGrantResponse(result) });
  })
);

export const emergencyAccessPatientRoutes = patientRouter;
export const emergencyAccessReviewRoutes = reviewRouter;
