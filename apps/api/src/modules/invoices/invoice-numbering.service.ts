import { InvoiceModel, IInvoice } from './invoice.model';
import { nextInvoiceNumber } from './invoice-counter.model';

export type NumberedInvoiceFields = Pick<
  IInvoice,
  'clinicId' | 'patientId' | 'lineItems' | 'subtotal' | 'total' | 'dueDate' | 'stellarDestination'
> &
  Partial<Pick<IInvoice, 'encounterId' | 'currency' | 'status' | 'paymentIntentId'>>;

/**
 * Allocate the next invoice number and insert the invoice atomically.
 *
 * The counter increment and the invoice insert share one transaction, so a
 * failed insert rolls back the increment and never leaves a gap in the
 * clinic's invoice sequence. Requires a replica set (transactions).
 */
export async function createNumberedInvoice(
  clinicId: string,
  fields: NumberedInvoiceFields
): Promise<IInvoice> {
  let invoice!: IInvoice;
  const session = await InvoiceModel.startSession();
  try {
    await session.withTransaction(async () => {
      const invoiceNumber = await nextInvoiceNumber(clinicId, session);
      const stellarMemo = invoiceNumber; // use invoice number as memo
      const [created] = await InvoiceModel.create(
        [{ ...fields, invoiceNumber, stellarMemo }],
        { session }
      );
      invoice = created!;
    });
  } finally {
    await session.endSession();
  }
  return invoice;
}
