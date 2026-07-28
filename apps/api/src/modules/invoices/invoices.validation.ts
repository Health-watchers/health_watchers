import { z } from 'zod';

const objectIdRegex = /^[a-f\d]{24}$/i;
const objectId = z.string().regex(objectIdRegex, 'Invalid ObjectId');

const lineItemSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  unitPrice: z.string().regex(/^\d+(\.\d{1,7})?$/, 'unitPrice must be a positive numeric string'),
});

export const createInvoiceSchema = z.object({
  patientId: objectId,
  encounterId: objectId.optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  dueDate: z.string().datetime(),
  currency: z.enum(['XLM', 'USDC']).optional(),
});

export const listInvoicesQuerySchema = z.object({
  patientId: objectId.optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sendInvoiceSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const idParamSchema = z.object({ id: objectId });

export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type SendInvoiceDto = z.infer<typeof sendInvoiceSchema>;
