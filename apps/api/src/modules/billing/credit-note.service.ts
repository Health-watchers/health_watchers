import { InvoiceModel } from '../invoices/invoice.model';
import { InvoiceCounterModel } from '../invoices/invoice-counter.model';
import { CreditNoteModel } from './credit-note.model';
import { roundAmount } from './line-item-calculator';

export interface IssueCreditNoteInput {
  clinicId: string;
  patientId: string;
  invoiceId: string;
  amount: string;
  reason: string;
  issuedBy: string;
}

export interface ApplyCreditNoteInput {
  targetInvoiceId: string;
  appliedBy: string;
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/** Next sequential credit note number, e.g. CN-2026-00007. */
export async function nextCreditNoteNumber(clinicId: string): Promise<string> {
  const year = new Date().getFullYear();
  const key = `credit-note:${clinicId}:${year}`;
  const counter = await InvoiceCounterModel.findOneAndUpdate(
    { _id: key, year },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `CN-${year}-${String(counter!.seq).padStart(5, '0')}`;
}

/**
 * Issue a credit note against an invoice.
 *
 * The amount may not exceed the invoice's remaining creditable balance
 * (total − credits already applied), and cancelled invoices cannot be credited.
 */
export async function issueCreditNote(input: IssueCreditNoteInput) {
  const invoice = await InvoiceModel.findOne({
    _id: input.invoiceId,
    clinicId: input.clinicId,
  });
  if (!invoice) throw httpError(404, 'Invoice not found');
  if (invoice.status === 'cancelled') {
    throw httpError(400, 'Cannot issue a credit note for a cancelled invoice');
  }

  const amount = parseFloat(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError(400, 'Credit note amount must be a positive number');
  }

  const alreadyCredited = parseFloat(invoice.creditsApplied ?? '0');
  const maxCreditable = parseFloat(invoice.total) - alreadyCredited;
  if (amount > maxCreditable + 1e-9) {
    throw httpError(
      400,
      `Credit note amount exceeds the invoice's creditable balance of ${roundAmount(Math.max(maxCreditable, 0))}`
    );
  }

  const creditNoteNumber = await nextCreditNoteNumber(input.clinicId);

  return CreditNoteModel.create({
    creditNoteNumber,
    clinicId: input.clinicId,
    patientId: input.patientId,
    invoiceId: input.invoiceId,
    amount: roundAmount(amount),
    remainingAmount: roundAmount(amount),
    reason: input.reason,
    issuedBy: input.issuedBy,
    issuedAt: new Date(),
  });
}

/**
 * Apply an issued credit note to a target invoice for the same clinic/patient.
 *
 * The applied value is min(remaining, target balance). If the balance reaches
 * zero the target invoice is marked paid. The credit note keeps its remaining
 * balance so a partial credit can be applied elsewhere.
 */
export async function applyCreditNote(creditNoteId: string, input: ApplyCreditNoteInput) {
  const note = await CreditNoteModel.findOne({ _id: creditNoteId });
  if (!note) throw httpError(404, 'Credit note not found');
  if (note.status === 'voided') {
    throw httpError(400, 'Cannot apply a voided credit note');
  }
  if (note.status === 'applied') {
    throw httpError(400, 'Credit note has already been applied');
  }

  const targetInvoice = await InvoiceModel.findOne({
    _id: input.targetInvoiceId,
    clinicId: note.clinicId,
    patientId: note.patientId,
  });
  if (!targetInvoice) {
    throw httpError(404, 'Target invoice not found for this clinic and patient');
  }
  if (targetInvoice.status === 'paid' || targetInvoice.status === 'cancelled') {
    throw httpError(400, `Cannot apply a credit note to a ${targetInvoice.status} invoice`);
  }

  const balance = parseFloat(targetInvoice.total) - parseFloat(targetInvoice.creditsApplied ?? '0');
  const remaining = parseFloat(note.remainingAmount);
  const applied = Math.min(remaining, balance);
  if (applied <= 1e-9) {
    throw httpError(400, 'Target invoice has no outstanding balance');
  }

  const appliedStr = roundAmount(applied);

  const updatedNote = await CreditNoteModel.findByIdAndUpdate(
    note._id,
    {
      status: 'applied',
      appliedAmount: appliedStr,
      remainingAmount: roundAmount(remaining - applied),
      appliedToInvoiceId: targetInvoice._id,
      appliedAt: new Date(),
    },
    { new: true }
  );

  const newCredits = parseFloat(targetInvoice.creditsApplied ?? '0') + applied;
  const paidOff = balance - applied <= 1e-9;
  await InvoiceModel.findByIdAndUpdate(targetInvoice._id, {
    creditsApplied: roundAmount(newCredits),
    ...(paidOff ? { status: 'paid', paidAt: new Date() } : {}),
  });

  return updatedNote;
}

/** Void an issued (not yet applied) credit note. */
export async function voidCreditNote(creditNoteId: string, voidedBy: string) {
  const note = await CreditNoteModel.findOne({ _id: creditNoteId });
  if (!note) throw httpError(404, 'Credit note not found');
  if (note.status === 'applied') {
    throw httpError(400, 'Cannot void an applied credit note');
  }

  return CreditNoteModel.findByIdAndUpdate(
    note._id,
    { status: 'voided', voidedAt: new Date(), voidedBy },
    { new: true }
  );
}

/** List credit notes for a clinic, optionally filtered by patient/status. */
export async function listCreditNotes(
  clinicId: string,
  options: { patientId?: string; status?: string; limit?: number } = {}
) {
  const filter: Record<string, unknown> = { clinicId };
  if (options.patientId) filter.patientId = options.patientId;
  if (options.status) filter.status = options.status;

  return CreditNoteModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(options.limit ?? 20)
    .lean();
}
