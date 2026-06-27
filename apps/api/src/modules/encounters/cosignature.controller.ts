import { Request, Response } from 'express';
import { CoSignatureService } from './cosignature.service';
import { auditLog } from '@api/modules/audit/audit.service';

export class CoSignatureController {
  /** GET /api/v1/encounters/pending-cosignatures */
  static async getPendingQueue(req: Request, res: Response): Promise<void> {
    try {
      const { userId, clinicId } = req.user!;
      const queue = await CoSignatureService.getPendingCoSignatureQueue(String(userId), clinicId.toString());
      res.status(200).json({ success: true, data: queue, count: queue.length });
    } catch (error) {
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /** POST /api/v1/encounters/:id/request-cosign  body: { targetDoctorId } */
  static async requestCoSignature(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { targetDoctorId } = req.body;
      const { userId, clinicId } = req.user!;

      if (!targetDoctorId) {
        res.status(400).json({ success: false, message: 'targetDoctorId is required' });
        return;
      }

      const encounter = await CoSignatureService.requestCoSignature(
        id, String(userId), targetDoctorId, clinicId.toString()
      );
      res.status(200).json({ success: true, data: encounter });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /** POST /api/v1/encounters/:id/cosign  body: { notes? } */
  static async approveCoSignature(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const { userId, clinicId, role } = req.user!;

      if (role !== 'DOCTOR') {
        res.status(403).json({ success: false, message: 'Only doctors can co-sign encounters' });
        return;
      }

      const encounter = await CoSignatureService.approveCoSignature(id, String(userId), notes);

      auditLog({ action: 'ENCOUNTER_UPDATE', userId: String(userId), clinicId: clinicId.toString(), resourceType: 'Encounter', resourceId: id, metadata: { action: 'cosign_approve', notes } });

      res.status(200).json({ success: true, message: 'Encounter co-signed successfully', data: encounter });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /** POST /api/v1/encounters/:id/reject-cosign  body: { notes } */
  static async rejectCoSignature(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const { userId, clinicId, role } = req.user!;

      if (role !== 'DOCTOR') {
        res.status(403).json({ success: false, message: 'Only doctors can reject co-signature' });
        return;
      }
      if (!notes) {
        res.status(400).json({ success: false, message: 'Rejection notes are required' });
        return;
      }

      const encounter = await CoSignatureService.rejectCoSignature(id, String(userId), notes);

      auditLog({ action: 'ENCOUNTER_UPDATE', userId: String(userId), clinicId: clinicId.toString(), resourceType: 'Encounter', resourceId: id, metadata: { action: 'cosign_reject', notes } });

      res.status(200).json({ success: true, message: 'Encounter returned for revision', data: encounter });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}
