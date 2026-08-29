import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '@api/middlewares/auth.middleware';
import { requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest as validate } from '@api/middlewares/validate.middleware';
import { communicationService } from './communication.service';
import { logCommunicationSchema, listCommunicationsSchema } from './communication.validation';

const router = Router({ mergeParams: true });

// POST /api/v1/patients/:id/communications
router.post(
  '/',
  authenticate,
  requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN'),
  validate({ body: logCommunicationSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: patientId } = req.params;
      const user = (req as any).user;

      const log = await communicationService.logCommunication(patientId, req.body, user);

      res.status(201).json({
        status: 'success',
        data: log,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/patients/:id/communications
router.get(
  '/',
  authenticate,
  requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN'),
  validate({ query: listCommunicationsSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: patientId } = req.params;
      const user = (req as any).user;
      const query = req.query as any;

      const result = await communicationService.listCommunications(patientId, user.clinicId, query);

      res.status(200).json({
        status: 'success',
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/patients/:id/send-sms (stub)
router.post(
  '/send-sms',
  authenticate,
  requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN'),
  (req: Request, res: Response) => {
    res.status(501).json({
      status: 'error',
      message: 'SMS sending is not yet configured. Please configure Twilio to enable this feature.',
    });
  }
);

// POST /api/v1/patients/:id/send-whatsapp (stub)
router.post(
  '/send-whatsapp',
  authenticate,
  requireRoles('DOCTOR', 'NURSE', 'CLINIC_ADMIN'),
  (req: Request, res: Response) => {
    res.status(501).json({
      status: 'error',
      message:
        'WhatsApp sending is not yet configured. Please configure Twilio to enable this feature.',
    });
  }
);

export const communicationsRouter = router;
