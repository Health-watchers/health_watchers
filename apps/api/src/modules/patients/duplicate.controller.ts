import { Request, Response } from 'express';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { PatientMergeService } from './merge.service';
import { AuditService } from '@api/modules/audit/audit.service';

export class DuplicateController {
  /**
   * Check for potential duplicates
   * POST /api/v1/patients/check-duplicates
   */
  static async checkDuplicates(req: Request, res: Response): Promise<void> {
    try {
      const { firstName, lastName, dateOfBirth, threshold } = req.body;
      const { clinicId } = req.user!;
      
      if (!firstName || !lastName || !dateOfBirth) {
        res.status(400).json({
          success: false,
          message: 'firstName, lastName, and dateOfBirth are required',
        });
        return;
      }
      
      const matches = await DuplicateDetectionService.checkDuplicates(
        firstName,
        lastName,
        dateOfBirth,
        clinicId.toString(),
        threshold
      );
      
      res.status(200).json({
        success: true,
        data: matches,
        count: matches.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        message: `Failed to check duplicates: ${message}`,
      });
    }
  }

  /**
   * Merge duplicate patients
   * POST /api/v1/patients/:id/merge/:duplicateId
   */
  static async mergePatients(req: Request, res: Response): Promise<void> {
    try {
      const { id, duplicateId } = req.params;
      const { userId, clinicId, role } = req.user!;
      
      // Only CLINIC_ADMIN can merge patients
      if (role !== 'CLINIC_ADMIN' && role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Only CLINIC_ADMIN can merge patient records',
        });
        return;
      }
      
      const result = await PatientMergeService.mergePatients(
        id,
        duplicateId,
        userId,
        clinicId.toString()
      );
      
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          primary: result.primary,
          duplicate: result.duplicate,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        message,
      });
    }
  }

  /**
   * Get patient (with redirect if merged)
   * GET /api/v1/patients/:id
   */
  static async getPatientWithRedirect(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const patient = await PatientMergeService.getMergedPatient(id);
      
      if (!patient) {
        res.status(404).json({
          success: false,
          message: 'Patient not found',
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        data: patient,
        redirected: patient._id.toString() !== id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        message,
      });
    }
  }
}
