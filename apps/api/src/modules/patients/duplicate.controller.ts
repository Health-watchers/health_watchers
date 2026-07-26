import { Request, Response } from 'express';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { PatientMergeService } from './merge.service';
import { UserModel } from '@api/modules/auth/models/user.model';

const ADMIN_ROLES = ['CLINIC_ADMIN', 'SUPER_ADMIN'] as const;

function isAdmin(role: string) {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

export class DuplicateController {
  /** POST /api/v1/patients/check-duplicates */
  static async checkDuplicates(req: Request, res: Response): Promise<void> {
    try {
      const { firstName, lastName, dateOfBirth, threshold } = req.body;
      const { clinicId } = req.user!;

      if (!firstName || !lastName || !dateOfBirth) {
        res.status(400).json({ success: false, message: 'firstName, lastName, and dateOfBirth are required' });
        return;
      }

      const matches = await DuplicateDetectionService.checkDuplicates(
        firstName, lastName, dateOfBirth, clinicId.toString(), threshold
      );
      res.status(200).json({ success: true, data: matches, count: matches.length });
    } catch (error) {
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/v1/patients/:id/merge/:duplicateId
   * Body: { confirm: true }
   * Requires CLINIC_ADMIN or SUPER_ADMIN.
   */
  static async mergePatients(req: Request, res: Response): Promise<void> {
    try {
      const { id, duplicateId } = req.params;
      const { userId, clinicId, role } = req.user!;

      if (!isAdmin(role)) {
        res.status(403).json({ success: false, message: 'Only CLINIC_ADMIN or SUPER_ADMIN can merge patient records' });
        return;
      }

      if (req.body.confirm !== true) {
        res.status(400).json({ success: false, message: 'Explicit confirm:true is required to perform a merge' });
        return;
      }

      // Resolve clinic admin email for notification
      const adminUser = await UserModel.findById(userId).select('email').lean();
      const adminEmail = adminUser?.email ?? '';

      const result = await PatientMergeService.mergePatients(
        id, duplicateId, String(userId), clinicId.toString(), adminEmail
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/v1/patients/unmerge/:mergeLogId
   * Body: { confirm: true }
   * Requires CLINIC_ADMIN or SUPER_ADMIN.
   */
  static async unmergePatients(req: Request, res: Response): Promise<void> {
    try {
      const { mergeLogId } = req.params;
      const { userId, clinicId, role } = req.user!;

      if (!isAdmin(role)) {
        res.status(403).json({ success: false, message: 'Only CLINIC_ADMIN or SUPER_ADMIN can unmerge patient records' });
        return;
      }

      if (req.body.confirm !== true) {
        res.status(400).json({ success: false, message: 'Explicit confirm:true is required to perform an unmerge' });
        return;
      }

      await PatientMergeService.unmergePatients(mergeLogId, String(userId), clinicId.toString());
      res.status(200).json({ success: true, message: 'Patients successfully unmerged' });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /** GET /api/v1/patients/:id — redirect merged patients to primary */
  static async getPatientWithRedirect(req: Request, res: Response): Promise<void> {
    try {
      const patient = await PatientMergeService.getMergedPatient(req.params.id);
      if (!patient) {
        res.status(404).json({ success: false, message: 'Patient not found' });
        return;
      }
      res.status(200).json({ success: true, data: patient, redirected: patient._id.toString() !== req.params.id });
    } catch (error) {
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}
