import {
  issueCreditNote,
  applyCreditNote,
  voidCreditNote,
  listCreditNotes,
  nextCreditNoteNumber,
} from '../credit-note.service';

jest.mock('../../invoices/invoice.model', () => ({
  InvoiceModel: {
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock('../../invoices/invoice-counter.model', () => ({
  InvoiceCounterModel: {
    findOneAndUpdate: jest.fn(),
  },
}));

jest.mock('../credit-note.model', () => ({
  CreditNoteModel: {
    create: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
  },
}));

import { InvoiceModel } from '../../invoices/invoice.model';
import { InvoiceCounterModel } from '../../invoices/invoice-counter.model';
import { CreditNoteModel } from '../credit-note.model';

const CLINIC_ID = '507f1f77bcf86cd799439011';
const PATIENT_ID = '507f1f77bcf86cd799439012';
const INVOICE_ID = '507f1f77bcf86cd799439013';
const USER_ID = '507f1f77bcf86cd799439014';
const NOTE_ID = '507f1f77bcf86cd799439015';

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    _id: INVOICE_ID,
    clinicId: CLINIC_ID,
    patientId: PATIENT_ID,
    total: '200.0000000',
    status: 'sent',
    creditsApplied: '0',
    ...overrides,
  };
}

describe('nextCreditNoteNumber', () => {
  it('returns a CN-YYYY-NNNNN number', async () => {
    (InvoiceCounterModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
      seq: 7,
    });

    const number = await nextCreditNoteNumber(CLINIC_ID);
    const year = new Date().getFullYear();
    expect(number).toBe(`CN-${year}-00007`);
  });
});

describe('issueCreditNote', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a credit note for a valid invoice', async () => {
    (InvoiceModel.findOne as jest.Mock).mockResolvedValue(makeInvoice());
    (InvoiceCounterModel.findOneAndUpdate as jest.Mock).mockResolvedValue({ seq: 1 });
    (CreditNoteModel.create as jest.Mock).mockResolvedValue({ creditNoteNumber: 'CN-1' });

    const note = await issueCreditNote({
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      invoiceId: INVOICE_ID,
      amount: '50.00',
      reason: 'Overcharge correction',
      issuedBy: USER_ID,
    });

    expect(note.creditNoteNumber).toBe('CN-1');
    expect(CreditNoteModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '50.0000000',
        remainingAmount: '50.0000000',
        clinicId: CLINIC_ID,
        invoiceId: INVOICE_ID,
        reason: 'Overcharge correction',
        issuedBy: USER_ID,
      })
    );
  });

  it('throws 404 when invoice is not found', async () => {
    (InvoiceModel.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      issueCreditNote({
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        invoiceId: INVOICE_ID,
        amount: '50.00',
        reason: 'test',
        issuedBy: USER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 for cancelled invoices', async () => {
    (InvoiceModel.findOne as jest.Mock).mockResolvedValue(makeInvoice({ status: 'cancelled' }));

    await expect(
      issueCreditNote({
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        invoiceId: INVOICE_ID,
        amount: '50.00',
        reason: 'test',
        issuedBy: USER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when amount exceeds the creditable balance', async () => {
    (InvoiceModel.findOne as jest.Mock).mockResolvedValue(
      makeInvoice({ total: '100.0000000', creditsApplied: '80.0000000' })
    );

    await expect(
      issueCreditNote({
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        invoiceId: INVOICE_ID,
        amount: '30.00',
        reason: 'test',
        issuedBy: USER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects non-positive amounts', async () => {
    (InvoiceModel.findOne as jest.Mock).mockResolvedValue(makeInvoice());

    await expect(
      issueCreditNote({
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        invoiceId: INVOICE_ID,
        amount: '0.00',
        reason: 'test',
        issuedBy: USER_ID,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('applyCreditNote', () => {
  beforeEach(() => jest.clearAllMocks());

  const makeNote = (overrides: Record<string, unknown> = {}) => ({
    _id: NOTE_ID,
    clinicId: CLINIC_ID,
    patientId: PATIENT_ID,
    invoiceId: INVOICE_ID,
    remainingAmount: '50.0000000',
    status: 'issued',
    ...overrides,
  });

  it('applies the full remaining balance when it covers the invoice', async () => {
    (CreditNoteModel.findOne as jest.Mock).mockResolvedValue(makeNote());
    (InvoiceModel.findOne as jest.Mock).mockResolvedValue(makeInvoice({ total: '40.0000000' }));
    (CreditNoteModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: NOTE_ID,
      status: 'applied',
    });

    await applyCreditNote(NOTE_ID, { targetInvoiceId: INVOICE_ID, appliedBy: USER_ID });

    expect(CreditNoteModel.findByIdAndUpdate).toHaveBeenCalledWith(
      NOTE_ID,
      expect.objectContaining({
        status: 'applied',
        appliedAmount: '40.0000000',
        remainingAmount: '10.0000000',
        appliedToInvoiceId: INVOICE_ID,
      }),
      { new: true }
    );
    // Invoice fully paid by the credit — marked paid
    expect(InvoiceModel.findByIdAndUpdate).toHaveBeenCalledWith(
      INVOICE_ID,
      expect.objectContaining({
        creditsApplied: '40.0000000',
        status: 'paid',
      })
    );
  });

  it('applies a partial credit and leaves the invoice outstanding', async () => {
    (CreditNoteModel.findOne as jest.Mock).mockResolvedValue(makeNote());
    (InvoiceModel.findOne as jest.Mock).mockResolvedValue(makeInvoice({ total: '200.0000000' }));
    (CreditNoteModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: NOTE_ID,
      status: 'applied',
    });

    await applyCreditNote(NOTE_ID, { targetInvoiceId: INVOICE_ID, appliedBy: USER_ID });

    expect(CreditNoteModel.findByIdAndUpdate).toHaveBeenCalledWith(
      NOTE_ID,
      expect.objectContaining({ appliedAmount: '50.0000000', remainingAmount: '0.0000000' }),
      { new: true }
    );
    expect(InvoiceModel.findByIdAndUpdate).toHaveBeenCalledWith(
      INVOICE_ID,
      expect.objectContaining({ creditsApplied: '50.0000000' })
    );
    // Invoice not marked paid — status key absent
    expect(InvoiceModel.findByIdAndUpdate).not.toHaveBeenCalledWith(
      INVOICE_ID,
      expect.objectContaining({ status: 'paid' })
    );
  });

  it('throws 400 when the note was already applied', async () => {
    (CreditNoteModel.findOne as jest.Mock).mockResolvedValue(
      makeNote({ status: 'applied', appliedToInvoiceId: INVOICE_ID })
    );

    await expect(
      applyCreditNote(NOTE_ID, { targetInvoiceId: INVOICE_ID, appliedBy: USER_ID })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when the target invoice is not in the same clinic/patient scope', async () => {
    (CreditNoteModel.findOne as jest.Mock).mockResolvedValue(makeNote());
    (InvoiceModel.findOne as jest.Mock).mockResolvedValue(null);

    await expect(
      applyCreditNote(NOTE_ID, { targetInvoiceId: INVOICE_ID, appliedBy: USER_ID })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when the target invoice has no outstanding balance', async () => {
    (CreditNoteModel.findOne as jest.Mock).mockResolvedValue(makeNote());
    (InvoiceModel.findOne as jest.Mock).mockResolvedValue(makeInvoice({ status: 'paid' }));

    await expect(
      applyCreditNote(NOTE_ID, { targetInvoiceId: INVOICE_ID, appliedBy: USER_ID })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('voidCreditNote', () => {
  beforeEach(() => jest.clearAllMocks());

  it('voids an issued credit note', async () => {
    (CreditNoteModel.findOne as jest.Mock).mockResolvedValue({
      _id: NOTE_ID,
      status: 'issued',
    });
    (CreditNoteModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      _id: NOTE_ID,
      status: 'voided',
    });

    const result = await voidCreditNote(NOTE_ID, USER_ID);
    expect(result.status).toBe('voided');
    expect(CreditNoteModel.findByIdAndUpdate).toHaveBeenCalledWith(
      NOTE_ID,
      expect.objectContaining({ status: 'voided', voidedBy: USER_ID }),
      { new: true }
    );
  });

  it('throws 400 when trying to void an applied credit note', async () => {
    (CreditNoteModel.findOne as jest.Mock).mockResolvedValue({
      _id: NOTE_ID,
      status: 'applied',
    });

    await expect(voidCreditNote(NOTE_ID, USER_ID)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('listCreditNotes', () => {
  it('lists notes scoped to the clinic', async () => {
    (CreditNoteModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ creditNoteNumber: 'CN-1' }]),
        }),
      }),
    });

    const result = await listCreditNotes(CLINIC_ID, { limit: 5 });
    expect(result).toHaveLength(1);
    expect(CreditNoteModel.find).toHaveBeenCalledWith({ clinicId: CLINIC_ID });
  });
});
