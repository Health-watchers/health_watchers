import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { MedicalHistoryModel } from './models/medical-history.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// Validation schemas
const socialHistorySchema = z.object({
  smokingStatus: z.enum(['never', 'former', 'current']),
  alcoholUse: z.enum(['none', 'occasional', 'moderate', 'heavy']),
  exerciseFrequency: z.enum(['none', 'occasional', 'regular']),
  occupation: z.string().optional(),
  maritalStatus: z.string().optional(),
});

const surgicalHistorySchema = z.object({
  procedure: z.string().min(1),
  year: z.number().int().min(1900).max(new Date().getFullYear()),
  hospital: z.string().optional(),
});

const familyHistorySchema = z.object({
  condition: z.string().min(1),
  relationship: z.string().min(1),
});

const currentMedicationSchema = z.object({
  name: z.string().min(1),
  dose: z.string().min(1),
  frequency: z.string().min(1),
  prescribedBy: z.string().optional(),
});

const createMedicalHistorySchema = z.object({
  patientId: z.string(),
  pastMedicalHistory: z.array(z.string()).default([]),
  surgicalHistory: z.array(surgicalHistorySchema).default([]),
  familyHistory: z.array(familyHistorySchema).default([]),
  socialHistory: socialHistorySchema,
  currentMedications: z.array(currentMedicationSchema).default([]),
});

const updateMedicalHistorySchema = z.object({
  pastMedicalHistory: z.array(z.string()).optional(),
  surgicalHistory: z.array(surgicalHistorySchema).optional(),
  familyHistory: z.array(familyHistorySchema).optional(),
  socialHistory: socialHistorySchema.optional(),
  currentMedications: z.array(currentMedicationSchema).optional(),
});

const patientIdParamsSchema = z.object({
  patientId: z.string(),
});

// ── POST /patients/:patientId/medical-history ──────────────────────────────────
router.post(
  '/:patientId/medical-history',
  validateRequest({ params: patientIdParamsSchema, body: createMedicalHistorySchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const { patientId } = req.params;
      const { pastMedicalHistory, surgicalHistory, familyHistory, socialHistory, currentMedications } = req.body;

      // Check if medical history already exists
      const existing = await MedicalHistoryModel.findOne({ patientId: new Types.ObjectId(patientId), clinicId });
      if (existing) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Medical history already exists for this patient',
        });
      }

      const medicalHistory = await MedicalHistoryModel.create({
        patientId: new Types.ObjectId(patientId),
        clinicId: new Types.ObjectId(clinicId),
        pastMedicalHistory,
        surgicalHistory,
        familyHistory,
        socialHistory,
        currentMedications,
        lastUpdatedAt: new Date(),
      });

      return res.status(201).json({ status: 'success', data: medicalHistory });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// ── GET /patients/:patientId/medical-history ───────────────────────────────────
router.get(
  '/:patientId/medical-history',
  validateRequest({ params: patientIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const { patientId } = req.params;

      const medicalHistory = await MedicalHistoryModel.findOne({
        patientId: new Types.ObjectId(patientId),
        clinicId: new Types.ObjectId(clinicId),
      }).lean();

      if (!medicalHistory) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Medical history not found for this patient',
        });
      }

      return res.json({ status: 'success', data: medicalHistory });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// ── PUT /patients/:patientId/medical-history ───────────────────────────────────
router.put(
  '/:patientId/medical-history',
  validateRequest({ params: patientIdParamsSchema, body: updateMedicalHistorySchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId, userId } = req.user!;
      const { patientId } = req.params;
      const { pastMedicalHistory, surgicalHistory, familyHistory, socialHistory, currentMedications } = req.body;

      const medicalHistory = await MedicalHistoryModel.findOne({
        patientId: new Types.ObjectId(patientId),
        clinicId: new Types.ObjectId(clinicId),
      });

      if (!medicalHistory) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Medical history not found for this patient',
        });
      }

      const updateData: any = {
        lastUpdatedAt: new Date(),
        reviewedBy: new Types.ObjectId(userId),
        reviewedAt: new Date(),
      };

      if (pastMedicalHistory !== undefined) updateData.pastMedicalHistory = pastMedicalHistory;
      if (surgicalHistory !== undefined) updateData.surgicalHistory = surgicalHistory;
      if (familyHistory !== undefined) updateData.familyHistory = familyHistory;
      if (socialHistory !== undefined) updateData.socialHistory = socialHistory;
      if (currentMedications !== undefined) updateData.currentMedications = currentMedications;

      const updated = await MedicalHistoryModel.findByIdAndUpdate(medicalHistory._id, updateData, {
        new: true,
        runValidators: true,
      }).lean();

      return res.json({ status: 'success', data: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// ── DELETE /patients/:patientId/medical-history ────────────────────────────────
router.delete(
  '/:patientId/medical-history',
  validateRequest({ params: patientIdParamsSchema }),
  async (req: Request, res: Response) => {
    try {
      const { clinicId } = req.user!;
      const { patientId } = req.params;

      const result = await MedicalHistoryModel.findOneAndDelete({
        patientId: new Types.ObjectId(patientId),
        clinicId: new Types.ObjectId(clinicId),
      });

      if (!result) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Medical history not found for this patient',
        });
      }

      return res.json({ status: 'success', message: 'Medical history deleted' });
    } catch (err: any) {
      return res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

export const medicalHistoryRoutes = router;
