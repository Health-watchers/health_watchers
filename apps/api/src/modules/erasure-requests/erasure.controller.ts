import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { ErasureRequestModel } from './erasure-request.model';
import { erasureService } from './erasure.service';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { z } from 'zod';

export const erasureRoutes = Router();
erasureRoutes.use(authenticate);

const createErasureSchema = z.object({
  body: z.object({
    reason: z.string().optional(),
  }),
});

const approveErasureSchema = z.object({
  body: z.object({
    approved: z.boolean(),
    denialReason: z.string().optional(),
  }),
});

// POST /erasure-requests - Patient requests erasure
erasureRoutes.post(
  '/',
  validateRequest(createErasureSchema),
  async (req: Request, res: Response) => {
    try {
      const patientId = req.user?.patientId;
      const clinicId = req.user?.clinicId;

      if (!patientId) {
        return res.status(400).json({ error: 'Patient ID required' });
      }

      // Check for existing pending requests
      const existingRequest = await ErasureRequestModel.findOne({
        patientId,
        status: { $in: ['requested', 'under_review', 'approved'] },
      });

      if (existingRequest) {
        return res.status(409).json({ error: 'Existing erasure request already in progress' });
      }

      const request = await ErasureRequestModel.create({
        patientId: new Types.ObjectId(patientId),
        clinicId: new Types.ObjectId(clinicId),
        reason: req.body.reason,
        status: 'requested',
      });

      return res.status(201).json(request);
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  }
);

// GET /erasure-requests/:id - Patient views their request
erasureRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const request = await ErasureRequestModel.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Verify patient owns this request
    if (request.patientId.toString() !== req.user?.patientId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json(request);
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

// POST /erasure-requests/:id/approve - Admin approves erasure
erasureRoutes.post(
  '/:id/approve',
  validateRequest(approveErasureSchema),
  async (req: Request, res: Response) => {
    try {
      if (req.user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only admins can approve erasure requests' });
      }

      const request = await ErasureRequestModel.findById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'Request not found' });
      }

      if (req.body.approved) {
        // Check legal hold
        const hasHold = await erasureService.checkLegalHold(
          request.patientId,
          request.clinicId
        );

        if (hasHold) {
          request.status = 'denied';
          request.deniedReason = 'Legal hold is in place';
          request.legalHoldCheckResult = 'failed';
          request.legalHoldReason = 'Patient has ongoing legal disputes';
          await request.save();
          return res.status(400).json({ error: 'Legal hold prevents erasure' });
        }

        request.status = 'approved';
        request.approvedBy = new Types.ObjectId(req.user?.userId);
        request.approvedAt = new Date();
        request.legalHoldCheckResult = 'passed';

        // Execute erasure asynchronously
        erasureService.executeErasure(request._id.toString()).catch(console.error);
      } else {
        request.status = 'denied';
        request.deniedReason = req.body.denialReason;
      }

      await request.save();
      return res.json(request);
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  }
);

// GET /erasure-requests - Admin lists pending requests
erasureRoutes.get(
  '/',
  async (req: Request, res: Response) => {
    try {
      if (req.user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only admins can view all requests' });
      }

      const status = req.query.status as string;
      const filter = status ? { status } : {};

      const requests = await ErasureRequestModel.find(filter)
        .sort({ requestedAt: -1 })
        .populate('patientId', 'firstName lastName email')
        .exec();

      return res.json(requests);
    } catch (error) {
      return res.status(500).json({ error: String(error) });
    }
  }
);
