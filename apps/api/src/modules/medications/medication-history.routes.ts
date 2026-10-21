import { Router } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { generalLimiter } from '@api/middlewares/rate-limit.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { getMyMedications, getRefillHistory } from './medication-history.controller';

/**
 * Portal medication-history routes — Issue #1427
 *
 * Mounted at: /api/v1/portal/medications
 * Access:     Authenticated patients only (role: PATIENT)
 *
 * Routes:
 *   GET  /                         List prescriptions for the authenticated patient
 *   GET  /:prescriptionId/refill-history   Full refill history for one prescription
 */
const router = Router();

// All portal medication endpoints require a valid JWT and the PATIENT role.
router.use(authenticate);
router.use(requireRoles('PATIENT'));
router.use(generalLimiter);

/**
 * @openapi
 * /portal/medications:
 *   get:
 *     tags:
 *       - Portal - Medications
 *     summary: List prescriptions for the authenticated patient
 *     description: >
 *       Returns all prescriptions belonging to the logged-in patient.
 *       Supports optional filtering by active status, date range, and prescribing doctor.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter by active/inactive prescriptions
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Earliest prescription start date (inclusive)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Latest prescription start date (inclusive)
 *       - in: query
 *         name: doctorId
 *         schema:
 *           type: string
 *         description: Filter by prescribing doctor ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 500
 *         description: Maximum number of prescriptions to return
 *     responses:
 *       200:
 *         description: Prescription list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MedicationHistory'
 *       401:
 *         description: Missing or invalid JWT
 *       403:
 *         description: Insufficient permissions (requires PATIENT role)
 */
router.get('/', asyncHandler(getMyMedications));

/**
 * @openapi
 * /portal/medications/{prescriptionId}/refill-history:
 *   get:
 *     tags:
 *       - Portal - Medications
 *     summary: Get refill history for a single prescription
 *     description: >
 *       Returns the full refill history for the specified prescription.
 *       Patients can only access their own prescriptions.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: prescriptionId
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the prescription
 *     responses:
 *       200:
 *         description: Refill history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     medicationName:
 *                       type: string
 *                     refillHistory:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totalRefills:
 *                       type: integer
 *       401:
 *         description: Missing or invalid JWT
 *       403:
 *         description: Insufficient permissions (requires PATIENT role)
 *       404:
 *         description: Prescription not found or does not belong to the patient
 */
router.get('/:prescriptionId/refill-history', asyncHandler(getRefillHistory));

export default router;
