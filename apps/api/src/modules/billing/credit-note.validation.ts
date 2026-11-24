import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;
const objectId = z.string().regex(objectIdRegex, 'Invalid ObjectId');

const amountRegex = /^\d+(\.\d{1,7})?$/;

export const issueCreditNoteSchema = z.object({
  patientId: objectId,
  invoiceId: objectId,
  amount: z.string().regex(amountRegex, 'amount must be a positive numeric string'),
  reason: z.string().min(1, 'Reason is required').max(1000),
});

export const applyCreditNoteSchema = z.object({
  targetInvoiceId: objectId,
});

export const listCreditNotesQuerySchema = z.object({
  patientId: objectId.optional(),
  status: z.enum(['issued', 'applied', 'voided']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParamSchema = z.object({ id: objectId });

export type IssueCreditNoteDto = z.infer<typeof issueCreditNoteSchema>;
export type ApplyCreditNoteDto = z.infer<typeof applyCreditNoteSchema>;
