import { Router, Request, Response } from 'express';
import { LabResultModel } from './lab-result.model';
import { toLabResultResponse } from './lab-results.transformer';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '../../utils/asyncHandler';
import { paginate, parsePagination } from '../../utils/paginate';
import { detectCriticalValues } from './critical-value.service';
import { createNotification } from '../notifications/notification.service';
import { emitToUser } from '@api/realtime/socket';
import { AuditLogModel } from '../audit/audit-log.model';
import { sendEmail } from '@api/lib/email.service';
import { UserModel } from '../auth/models/user.model';
import {
  orderLabResultSchema,
  enterLabResultsSchema,
  listLabResultsQuerySchema,
  idParamSchema,
} from './lab-results.validation';

const router = Router();
router.use(authenticate);

const CLINICAL_ROLES = requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN', 'SUPER_ADMIN');
const RESULT_ENTRY_ROLES = requireRoles('DOCTOR', 'NURSE');

/**
 * @swagger
 * /lab-results:
 *   post:
 *     summary: Order a lab test for a patient
 *     description: Creates a lab result record with status "ordered". Restricted to clinical staff (DOCTOR, NURSE, CLINIC_ADMIN, SUPER_ADMIN). Access is clinic-scoped and PHI access is audited.
 *     tags: [LabResults]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, testName]
 *             properties:
 *               patientId: { type: string, description: 'Patient MongoDB ObjectId', example: '507f1f77bcf86cd799439011' }
 *               encounterId: { type: string, description: 'Optional related encounter ObjectId' }
 *               testName: { type: string, maxLength: 200, example: 'Complete Blood Count' }
 *               testCode: { type: string, maxLength: 50, example: 'CBC' }
 *               notes: { type: string, maxLength: 1000 }
 *     responses:
 *       201:
 *         description: Lab test ordered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   description: Lab result record with status "ordered"
 *                   properties:
 *                     id: { type: string, example: '507f1f77bcf86cd799439011' }
 *                     patientId: { type: string }
 *                     encounterId: { type: string, nullable: true }
 *                     clinicId: { type: string }
 *                     orderedBy: { type: string, description: 'User ObjectId of the ordering clinician' }
 *                     testName: { type: string }
 *                     testCode: { type: string, nullable: true }
 *                     status: { type: string, enum: [ordered, pending, resulted, cancelled] }
 *                     notes: { type: string, nullable: true }
 *                     orderedAt: { type: string, format: date-time }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Caller lacks DOCTOR, NURSE, CLINIC_ADMIN, or SUPER_ADMIN role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post(
  '/',
  CLINICAL_ROLES,
  validateRequest({ body: orderLabResultSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, encounterId, testName, testCode, notes } = req.body;
    const doc = await LabResultModel.create({
      patientId,
      encounterId,
      clinicId: req.user!.clinicId,
      orderedBy: req.user!.userId,
      testName,
      testCode,
      notes,
      status: 'ordered',
      orderedAt: new Date(),
    });
    return res
      .status(201)
      .json({ status: 'success', data: toLabResultResponse(doc, req.user!.role) });
  })
);

/**
 * @swagger
 * /lab-results:
 *   get:
 *     summary: List lab results for the caller's clinic
 *     description: Filterable by patient, status, and ordered-date range. Results are scoped to the caller's clinic and PHI access is audited.
 *     tags: [LabResults]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *         description: Filter to a single patient's lab results
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ordered, collected, resulted, reviewed] }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Filter to results ordered on or after this timestamp
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: Filter to results ordered on or before this timestamp
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated list of lab results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       patientId: { type: string }
 *                       clinicId: { type: string }
 *                       orderedBy: { type: string }
 *                       testName: { type: string }
 *                       testCode: { type: string, nullable: true }
 *                       status: { type: string, enum: [ordered, pending, resulted, cancelled] }
 *                       isCritical: { type: boolean }
 *                       orderedAt: { type: string, format: date-time }
 *                       resultedAt: { type: string, format: date-time, nullable: true }
 *                 meta: { $ref: '#/components/schemas/PaginationMeta' }
 *       400:
 *         description: limit exceeds the maximum page size of 100
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get(
  '/',
  validateRequest({ query: listLabResultsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, status, from, to } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { clinicId: req.user!.clinicId };
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;
    if (from || to) {
      filter.orderedAt = {};
      if (from) (filter.orderedAt as any).$gte = new Date(from);
      if (to) (filter.orderedAt as any).$lte = new Date(to);
    }
    const pagination = parsePagination(req.query as Record<string, any>);
    if (!pagination) {
      return res
        .status(400)
        .json({ error: 'ValidationError', message: 'limit must not exceed 100' });
    }
    const { page, limit } = pagination;
    const result = await paginate(LabResultModel, filter, page, limit, { orderedAt: -1 });
    return res.json({
      status: 'success',
      data: result.data.map((d: any) => toLabResultResponse(d, req.user!.role)),
      meta: result.meta,
    });
  })
);

/**
 * @swagger
 * /lab-results/critical:
 *   get:
 *     summary: List critical lab results awaiting acknowledgment
 *     description: Returns lab results flagged as critical (isCritical=true) that have not yet been acknowledged, scoped to the caller's clinic, sorted newest result first.
 *     tags: [LabResults]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of unacknowledged critical lab results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       patientId: { type: string }
 *                       orderedBy: { type: string }
 *                       testName: { type: string }
 *                       status: { type: string }
 *                       isCritical: { type: boolean, example: true }
 *                       criticalReason: { type: string, nullable: true }
 *                       resultedAt: { type: string, format: date-time, nullable: true }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get(
  '/critical',
  asyncHandler(async (req: Request, res: Response) => {
    const docs = await LabResultModel.find({
      clinicId: req.user!.clinicId,
      isCritical: true,
      criticalAcknowledgedAt: { $exists: false },
    })
      .populate('patientId', 'firstName lastName')
      .populate('orderedBy', 'firstName lastName')
      .sort({ resultedAt: -1 });
    return res.json({
      status: 'success',
      data: docs.map((d) => toLabResultResponse(d, req.user!.role)),
    });
  })
);

/**
 * @swagger
 * /lab-results/{id}:
 *   get:
 *     summary: Get a single lab result's details
 *     tags: [LabResults]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Lab result MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Lab result details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     patientId: { type: string }
 *                     encounterId: { type: string, nullable: true }
 *                     clinicId: { type: string }
 *                     orderedBy: { type: string }
 *                     testName: { type: string }
 *                     testCode: { type: string, nullable: true }
 *                     status: { type: string, enum: [ordered, pending, resulted, cancelled] }
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name: { type: string }
 *                           value: { type: string }
 *                           unit: { type: string }
 *                           referenceRange: { type: string }
 *                           flag: { type: string, enum: [normal, high, low, critical] }
 *                     notes: { type: string, nullable: true }
 *                     attachmentUrl: { type: string, nullable: true }
 *                     isCritical: { type: boolean }
 *                     criticalReason: { type: string, nullable: true }
 *                     criticalAcknowledgedAt: { type: string, format: date-time, nullable: true }
 *                     criticalAcknowledgedBy: { type: string, nullable: true }
 *                     orderedAt: { type: string, format: date-time }
 *                     resultedAt: { type: string, format: date-time, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Lab result not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get(
  '/:id',
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await LabResultModel.findOne({ _id: req.params.id, clinicId: req.user!.clinicId });
    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Lab result not found' });
    return res.json({ status: 'success', data: toLabResultResponse(doc, req.user!.role) });
  })
);

/**
 * @swagger
 * /lab-results/{id}/results:
 *   put:
 *     summary: Enter results for an ordered lab test
 *     description: >
 *       Restricted to DOCTOR and NURSE. Sets status to "resulted" and runs the entered values through
 *       critical-value detection (against standard clinical thresholds); if any value is critical, an
 *       in-app notification, a Socket.IO event, and an email alert are sent to the ordering clinician,
 *       and the acknowledgment is recorded in the audit log.
 *     tags: [LabResults]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Lab result MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [results]
 *             properties:
 *               results:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [name, value]
 *                   properties:
 *                     name: { type: string, example: 'Potassium' }
 *                     value: { type: string, example: '4.2' }
 *                     unit: { type: string, example: 'mmol/L' }
 *                     referenceRange: { type: string, example: '3.5-5.0' }
 *                     flag: { type: string, enum: [normal, high, low, critical] }
 *               notes: { type: string, maxLength: 1000 }
 *               attachmentUrl: { type: string, format: uri }
 *     responses:
 *       200:
 *         description: Results recorded; includes an `alert` block if a critical value was detected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     status: { type: string, example: resulted }
 *                     isCritical: { type: boolean }
 *                     criticalReason: { type: string, nullable: true }
 *                     resultedAt: { type: string, format: date-time }
 *                 alert:
 *                   type: object
 *                   description: Present only when a critical value was detected
 *                   properties:
 *                     critical: { type: boolean, example: true }
 *                     reason: { type: string, example: 'Potassium critically high: 6.8' }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Caller lacks DOCTOR or NURSE role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Lab result not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.put(
  '/:id/results',
  RESULT_ENTRY_ROLES,
  validateRequest({ params: idParamSchema, body: enterLabResultsSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { results, notes, attachmentUrl } = req.body;

    // Detect critical values
    const { isCritical, criticalReason } = detectCriticalValues(results);

    const doc = await LabResultModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId },
      {
        results,
        notes,
        attachmentUrl,
        status: 'resulted',
        resultedAt: new Date(),
        isCritical,
        criticalReason: isCritical ? criticalReason : undefined,
      },
      { new: true, runValidators: true }
    );

    if (!doc) return res.status(404).json({ error: 'NotFound', message: 'Lab result not found' });

    // If critical, send alerts
    if (isCritical && doc.orderedBy) {
      const doctor = await UserModel.findById(doc.orderedBy).lean();
      if (doctor) {
        // Create in-app notification
        await createNotification({
          userId: doc.orderedBy,
          clinicId: doc.clinicId,
          type: 'lab_result_ready',
          title: 'Critical Lab Result',
          message: `Critical value detected: ${criticalReason}`,
          metadata: { labResultId: doc._id, isCritical: true },
        });

        // Emit Socket.IO event
        try {
          emitToUser(String(doc.orderedBy), 'lab:critical', {
            labResultId: doc._id,
            reason: criticalReason,
            testName: doc.testName,
          });
        } catch {
          // Socket may not be initialized
        }

        // Send email alert
        if (doctor.email) {
          await sendEmail({
            to: doctor.email,
            subject: `URGENT: Critical Lab Result - ${doc.testName}`,
            html: `<p>A critical lab value has been detected:</p><p><strong>${criticalReason}</strong></p><p>Please review immediately.</p>`,
          });
        }

        // Audit log
        await AuditLogModel.create({
          userId: req.user!.userId,
          clinicId: req.user!.clinicId,
          action: 'CRITICAL_LAB_RESULT',
          resourceType: 'LabResult',
          resourceId: String(doc._id),
          outcome: 'SUCCESS',
          metadata: { reason: criticalReason },
        });
      }
    }

    return res.json({
      status: 'success',
      data: toLabResultResponse(doc, req.user!.role),
      ...(isCritical && { alert: { critical: true, reason: criticalReason } }),
    });
  })
);

/**
 * @swagger
 * /lab-results/{id}/acknowledge:
 *   post:
 *     summary: Acknowledge a critical lab value
 *     description: Records the caller as having acknowledged a critical lab result. Only matches results that are currently flagged critical (isCritical=true). The acknowledgment is recorded in the audit log.
 *     tags: [LabResults]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Lab result MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Critical value acknowledged
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     isCritical: { type: boolean, example: true }
 *                     criticalAcknowledgedBy: { type: string }
 *                     criticalAcknowledgedAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Caller lacks DOCTOR, NURSE, CLINIC_ADMIN, or SUPER_ADMIN role
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Critical lab result not found (either the id does not exist, or it is not currently flagged critical)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post(
  '/:id/acknowledge',
  CLINICAL_ROLES,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const doc = await LabResultModel.findOneAndUpdate(
      { _id: req.params.id, clinicId: req.user!.clinicId, isCritical: true },
      {
        criticalAcknowledgedBy: req.user!.userId,
        criticalAcknowledgedAt: new Date(),
      },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({ error: 'NotFound', message: 'Critical lab result not found' });
    }

    // Audit log
    await AuditLogModel.create({
      userId: req.user!.userId,
      clinicId: req.user!.clinicId,
      action: 'CRITICAL_LAB_ACKNOWLEDGED',
      resourceType: 'LabResult',
      resourceId: String(doc._id),
      outcome: 'SUCCESS',
    });

    return res.json({ status: 'success', data: toLabResultResponse(doc, req.user!.role) });
  })
);

export const labResultRoutes = router;
