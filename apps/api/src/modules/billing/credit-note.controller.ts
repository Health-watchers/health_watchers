import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import {
  issueCreditNote,
  applyCreditNote,
  voidCreditNote,
  listCreditNotes,
} from './credit-note.service';
import {
  issueCreditNoteSchema,
  applyCreditNoteSchema,
  listCreditNotesQuerySchema,
  idParamSchema,
} from './credit-note.validation';

const router = Router();
router.use(authenticate);

const WRITE_ROLES = requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN');

// POST /billing/credit-notes — issue a credit note against an invoice
router.post(
  '/',
  WRITE_ROLES,
  validateRequest({ body: issueCreditNoteSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, invoiceId, amount, reason } = req.body;

    const note = await issueCreditNote({
      clinicId: req.user!.clinicId,
      patientId,
      invoiceId,
      amount,
      reason,
      issuedBy: req.user!.userId,
    });

    return res.status(201).json({ status: 'success', data: note });
  })
);

// GET /billing/credit-notes — list credit notes for the clinic
router.get(
  '/',
  validateRequest({ query: listCreditNotesQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { patientId, status, limit } = req.query as {
      patientId?: string;
      status?: string;
      limit?: number;
    };

    const data = await listCreditNotes(req.user!.clinicId, { patientId, status, limit });

    return res.json({ status: 'success', data });
  })
);

// POST /billing/credit-notes/:id/apply — apply to a target invoice
router.post(
  '/:id/apply',
  WRITE_ROLES,
  validateRequest({ params: idParamSchema, body: applyCreditNoteSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const note = await applyCreditNote(req.params.id, {
      targetInvoiceId: req.body.targetInvoiceId,
      appliedBy: req.user!.userId,
    });

    return res.json({ status: 'success', data: note });
  })
);

// POST /billing/credit-notes/:id/void — void an issued credit note
router.post(
  '/:id/void',
  WRITE_ROLES,
  validateRequest({ params: idParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const note = await voidCreditNote(req.params.id, req.user!.userId);

    return res.json({ status: 'success', data: note });
  })
);

export const creditNoteRoutes = router;
