import mongoose, { ClientSession, Schema } from 'mongoose';

const InvoiceCounterSchema = new Schema(
  { _id: String, year: Number, seq: Number },
  { versionKey: false }
);

export const InvoiceCounterModel =
  mongoose.models.InvoiceCounter || mongoose.model('InvoiceCounter', InvoiceCounterSchema);

/**
 * Returns next invoice number like INV-2024-00042.
 *
 * Pass a session to bind the increment to a transaction: if the transaction
 * aborts (e.g. the invoice insert fails) the counter increment is rolled back
 * too, so no invoice number is skipped.
 */
export async function nextInvoiceNumber(
  clinicId: string,
  session?: ClientSession
): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${clinicId}:${year}`;
  const counter = await InvoiceCounterModel.findOneAndUpdate(
    { _id: key, year },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  return `INV-${year}-${String(counter!.seq).padStart(5, '0')}`;
}
