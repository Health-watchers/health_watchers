import { Request, Response } from 'express';
import { CoSignatureService } from './cosignature.service';
import { AuditService } from '@api/modules/audit/audit.service';

export class CoSignatureController {
  /**
   * Get pending co-signature queue
   * GET /api/v1/encounters/pending-cosignature
   */
  static async getPendingQueue(req: Request, res: Response): Promise<void> {
    try {
      const { userId, clinicId, role } = req.user!;
      
      // Only doctors can access co-signature queue
      if (role !== 'DOCTOR') {
        res.status(403).json({
          success: false,
          message: 'Only doctors can access the co-signature queue',
        });
        return;
      }
      
      const queue = await CoSignatureService.getPendingCoSignatureQueue(
        userId,
        clinicId.toString()
      );
      
      res.status(200).json({
        success: true,
        data: queue,
        count: queue.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        success: false,
        message: `Failed to fetch co-signature queue: ${message}`,
      });
    }
  }

  /**
   * Approve co-signature
   * POST /api/v1/encounters/:id/cosign
   */
  static async approveCoSignature(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const { userId, clinicId, role } = req.user!;
      
      // Only doctors can co-sign
      if (role !== 'DOCTOR') {
        res.status(403).json({
          success: false,
          message: 'Only doctors can co-sign encounters',
        });
        return;
      }
      
      const encounter = await CoSignatureService.approveCoSignature(
        id,
        userId,
        notes
      );
      
      // Audit log
      await AuditService.log({
        userId,
        clinicId,
        action: 'cosign_approve',
        resource: 'encounter',
        resourceId: id,
        details: {
          encounterId: id,
          notes,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      
      res.status(200).json({
        success: true,
        message: 'Encounter co-signed successfully',
        data: encounter,
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
   * Reject co-signature
   * POST /api/v1/encounters/:id/reject-cosign
   */
  static async rejectCoSignature(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const { userId, clinicId, role } = req.user!;
      
      // Only doctors can reject co-signature
      if (role !== 'DOCTOR') {
        res.status(403).json({
          success: false,
          message: 'Only doctors can reject co-signature',
        });
        return;
      }
      
      if (!notes) {
        res.status(400).json({
          success: false,
          message: 'Rejection notes are required',
        });
        return;
      }
      
      const encounter = await CoSignatureService.rejectCoSignature(
        id,
        userId,
        notes
      );
      
      // Audit log
      await AuditService.log({
        userId,
        clinicId,
        action: 'cosign_reject',
        resource: 'encounter',
        resourceId: id,
        details: {
          encounterId: id,
          notes,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      
      res.status(200).json({
        success: true,
        message: 'Encounter returned for revision',
        data: encounter,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        success: false,
        message,
      });
    }
  }
}
