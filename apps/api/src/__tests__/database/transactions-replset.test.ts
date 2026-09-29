/**
 * Transaction tests against a real (in-memory) replica set — Issue #1488
 *
 * A standalone mongodb-memory-server rejects multi-document transactions, so
 * this suite runs on MongoMemoryReplSet and exercises the production code paths
 * that rely on `session.withTransaction`:
 *
 *   - patient merge          (PatientMergeService.mergePatients)
 *   - payment confirmation   (confirmPayment)
 *   - invoice numbering      (nextInvoiceNumber / createNumberedInvoice)
 *
 * Each area has an injected-failure test that throws mid-transaction and then
 * asserts that no partial writes were persisted, plus a concurrency test.
 */
import mongoose, { Types } from 'mongoose';

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
// Plain functions (not jest.fn) so jest.restoreAllMocks() can't strip their return values.
jest.mock('@api/utils/mailer', () => ({ sendMail: () => Promise.resolve() }));
jest.mock('@api/modules/audit/audit.service', () => ({
  auditLog: () => Promise.resolve(),
}));
jest.mock('@api/lib/email.service', () => ({ sendPaymentConfirmationEmail: () => undefined }));
jest.mock('@api/realtime/socket', () => ({ emitToClinic: jest.fn() }));
jest.mock('@api/modules/notifications/notification.service', () => ({
  createNotification: () => Promise.resolve(),
}));
jest.mock('@api/modules/webhooks/webhook.service', () => ({
  enqueueWebhookDelivery: () => Promise.resolve(),
}));
jest.mock('@api/services/metrics.service', () => ({
  paymentsConfirmedTotal: { inc: () => undefined },
  register: new (jest.requireActual('prom-client').Registry)(),
}));
jest.mock('@api/modules/payments/services/xlm-rate.service', () => ({
  getCurrentXLMRate: () => Promise.resolve({ rateUSD: 0.1 }),
}));

import {
  startReplSetTestDb,
  stopReplSetTestDb,
  clearDb,
  ReplSetTestDb,
} from '../../integration/helpers/test-db';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { MergeLogModel } from '@api/modules/patients/models/merge-log.model';
import { PatientMergeService } from '@api/modules/patients/merge.service';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { PaymentRecordModel } from '@api/modules/payments/models/payment-record.model';
import { confirmPayment } from '@api/modules/payments/services/payment-confirmation.service';
import { InvoiceModel } from '@api/modules/invoices/invoice.model';
import {
  InvoiceCounterModel,
  nextInvoiceNumber,
} from '@api/modules/invoices/invoice-counter.model';
import { createNumberedInvoice } from '@api/modules/invoices/invoice-numbering.service';
import { emitToClinic } from '@api/realtime/socket';
import { OutboxEventModel } from '@api/modules/outbox/outbox-event.model';
import { buildPayment } from '../factories/payment.factory';

let testDb: ReplSetTestDb;

beforeAll(async () => {
  testDb = await startReplSetTestDb();
  // Build indexes (and create collections) up front: unique indexes back the
  // assertions below, and DDL inside a transaction races with concurrent txns.
  const models = [
    PatientModel,
    MergeLogModel,
    EncounterModel,
    PaymentRecordModel,
    InvoiceModel,
    InvoiceCounterModel,
    OutboxEventModel,
  ] as mongoose.Model<any>[];
  await Promise.all(models.map((m) => m.init()));
  await Promise.all(models.map((m) => m.createCollection().catch(() => undefined)));
}, 120_000);

afterAll(async () => {
  await stopReplSetTestDb(testDb);
});

afterEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  await clearDb();
});

const injected = () => new Error('Injected failure');

// ── Patient merge ────────────────────────────────────────────────────────────

describe('Patient merge (transactional)', () => {
  const clinicId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  function makePatient(overrides: Record<string, unknown> = {}) {
    return {
      systemId: new Types.ObjectId().toString(),
      firstName: 'Test',
      lastName: 'Patient',
      searchName: 'test patient',
      dateOfBirth: '1990-01-01',
      sex: 'M',
      clinicId,
      isActive: true,
      allergies: [],
      ...overrides,
    };
  }

  const peanut = {
    allergen: 'Peanut',
    allergenType: 'food',
    reaction: 'Hives',
    severity: 'moderate',
  };

  async function seedPair() {
    const primary = await PatientModel.create(makePatient({ firstName: 'Primary' }));
    const duplicate = await PatientModel.create(
      makePatient({ firstName: 'Duplicate', allergies: [peanut] })
    );
    await EncounterModel.create({
      patientId: duplicate._id,
      clinicId,
      attendingDoctorId: new Types.ObjectId(),
      chiefComplaint: 'Headache',
      status: 'open',
    });
    return { primaryId: String(primary._id), duplicateId: String(duplicate._id) };
  }

  async function expectNoMergeWrites(primaryId: string, duplicateId: string) {
    expect(await MergeLogModel.countDocuments({})).toBe(0);
    expect(await EncounterModel.countDocuments({ patientId: duplicateId })).toBe(1);
    expect(await EncounterModel.countDocuments({ patientId: primaryId })).toBe(0);

    const primary = (await PatientModel.findById(primaryId).lean()) as any;
    const duplicate = (await PatientModel.findById(duplicateId).lean()) as any;
    expect(primary.allergies).toHaveLength(0);
    expect(duplicate.isActive).toBe(true);
    expect(duplicate.isDuplicate).toBeFalsy();
    expect(duplicate.mergedInto).toBeUndefined();
  }

  it('commits merge log, encounter re-parenting and patient updates together', async () => {
    const { primaryId, duplicateId } = await seedPair();

    const { mergeLogId } = await PatientMergeService.mergePatients(
      primaryId,
      duplicateId,
      userId,
      clinicId,
      'admin@test.com'
    );

    expect(await MergeLogModel.findById(mergeLogId)).not.toBeNull();
    expect(await EncounterModel.countDocuments({ patientId: primaryId })).toBe(1);
    const primary = (await PatientModel.findById(primaryId).lean()) as any;
    const duplicate = (await PatientModel.findById(duplicateId).lean()) as any;
    expect(primary.allergies).toHaveLength(1);
    expect(duplicate.isDuplicate).toBe(true);
    expect(duplicate.isActive).toBe(false);
  });

  it('rolls back the merge log when encounter re-parenting fails', async () => {
    const { primaryId, duplicateId } = await seedPair();
    jest.spyOn(EncounterModel, 'updateMany').mockImplementationOnce(() => {
      throw injected();
    });

    await expect(
      PatientMergeService.mergePatients(primaryId, duplicateId, userId, clinicId, 'a@test.com')
    ).rejects.toThrow('Injected failure');

    await expectNoMergeWrites(primaryId, duplicateId);
  });

  it('rolls back merge log, encounters and primary when the final save fails', async () => {
    const { primaryId, duplicateId } = await seedPair();

    // Let primaryDoc.save() through, fail duplicateDoc.save() — the last write.
    const patientProto = PatientModel.prototype as any;
    const originalSave = patientProto.save;
    let saves = 0;
    jest.spyOn(patientProto, 'save').mockImplementation(function (
      this: any,
      ...args: any[]
    ) {
      saves += 1;
      if (saves === 2) return Promise.reject(injected());
      return originalSave.apply(this, args as any);
    } as any);

    await expect(
      PatientMergeService.mergePatients(primaryId, duplicateId, userId, clinicId, 'a@test.com')
    ).rejects.toThrow('Injected failure');

    expect(saves).toBe(2);
    await expectNoMergeWrites(primaryId, duplicateId);
  });

  it('allows only one of two concurrent merges of the same duplicate', async () => {
    const { primaryId, duplicateId } = await seedPair();
    const other = await PatientModel.create(makePatient({ firstName: 'Other' }));

    const results = await Promise.allSettled([
      PatientMergeService.mergePatients(primaryId, duplicateId, userId, clinicId, 'a@test.com'),
      PatientMergeService.mergePatients(
        String(other._id),
        duplicateId,
        userId,
        clinicId,
        'a@test.com'
      ),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]!.reason?.message)).toMatch(/already been merged/);

    expect(await MergeLogModel.countDocuments({ duplicateId })).toBe(1);
    const duplicate = (await PatientModel.findById(duplicateId).lean()) as any;
    const winner = (await MergeLogModel.findOne({ duplicateId }).lean())!;
    expect(String(duplicate.mergedInto)).toBe(String(winner.primaryId));
    // Encounters follow the winning primary only
    expect(await EncounterModel.countDocuments({ patientId: winner.primaryId })).toBe(1);
  });

  it('applies concurrent merges of different duplicates into the same primary', async () => {
    const primary = await PatientModel.create(makePatient({ firstName: 'Primary' }));
    const dupA = await PatientModel.create(makePatient({ allergies: [peanut] }));
    const dupB = await PatientModel.create(
      makePatient({
        allergies: [{ ...peanut, allergen: 'Penicillin', allergenType: 'drug' }],
      })
    );

    await Promise.all([
      PatientMergeService.mergePatients(
        String(primary._id),
        String(dupA._id),
        userId,
        clinicId,
        'a@test.com'
      ),
      PatientMergeService.mergePatients(
        String(primary._id),
        String(dupB._id),
        userId,
        clinicId,
        'a@test.com'
      ),
    ]);

    // Write conflicts on the primary are retried, so neither allergy is lost
    const merged = (await PatientModel.findById(primary._id).lean()) as any;
    expect(merged.allergies.map((a: any) => a.allergen).sort()).toEqual(['Peanut', 'Penicillin']);
    expect(await MergeLogModel.countDocuments({ primaryId: primary._id })).toBe(2);
  });
});

// ── Payment confirmation ─────────────────────────────────────────────────────

describe('Payment confirmation (transactional)', () => {
  async function seedPaymentWithInvoice() {
    const clinicId = new Types.ObjectId();
    const payment = await PaymentRecordModel.create(
      buildPayment({ clinicId: String(clinicId), assetCode: 'USDC' })
    );
    const invoice = await InvoiceModel.create({
      invoiceNumber: `INV-TEST-${new Types.ObjectId()}`,
      clinicId,
      patientId: new Types.ObjectId(),
      lineItems: [{ description: 'Consult', quantity: 1, unitPrice: '100', total: '100' }],
      subtotal: '100',
      total: '100',
      dueDate: new Date(),
      stellarMemo: 'memo',
      stellarDestination: 'GDEST',
      status: 'sent',
      paymentIntentId: payment.intentId,
    });
    return { payment, invoice };
  }

  it('marks both payment and invoice as settled on success', async () => {
    const { payment, invoice } = await seedPaymentWithInvoice();

    const result = await confirmPayment({ intentId: payment.intentId, txHash: 'tx-ok' });

    expect(result.status).toBe('confirmed');
    expect((await PaymentRecordModel.findById(payment._id).lean())!.status).toBe('confirmed');
    const inv = (await InvoiceModel.findById(invoice._id).lean())!;
    expect(inv.status).toBe('paid');
    expect(inv.paidTxHash).toBe('tx-ok');
  });

  it('rolls back the payment status when the invoice update fails', async () => {
    const { payment, invoice } = await seedPaymentWithInvoice();
    jest.spyOn(InvoiceModel, 'findOneAndUpdate').mockImplementationOnce(() => {
      throw injected();
    });

    await expect(confirmPayment({ intentId: payment.intentId, txHash: 'tx-fail' })).rejects.toThrow(
      'Injected failure'
    );

    const p = (await PaymentRecordModel.findById(payment._id).lean())!;
    expect(p.status).toBe('pending');
    expect(p.txHash).toBeUndefined();
    expect(p.confirmedAt).toBeUndefined();
    const inv = (await InvoiceModel.findById(invoice._id).lean())!;
    expect(inv.status).toBe('sent');
    expect(inv.paidTxHash).toBeUndefined();
    // Post-commit side effects must not fire for a rolled-back confirmation:
    // the outbox event (#1432) is rolled back with the payment.
    expect(await OutboxEventModel.countDocuments({ type: 'payment.confirmed' })).toBe(0);
    expect(emitToClinic).not.toHaveBeenCalled();
  });

  it('confirms exactly once under concurrent confirmation of the same intent', async () => {
    const { payment, invoice } = await seedPaymentWithInvoice();

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        confirmPayment({ intentId: payment.intentId, txHash: `tx-${i}` })
      )
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 'confirmed')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'already_confirmed')).toHaveLength(4);

    const p = (await PaymentRecordModel.findById(payment._id).lean())!;
    const inv = (await InvoiceModel.findById(invoice._id).lean())!;
    // The invoice records the same tx hash as the single winning confirmation
    expect(inv.status).toBe('paid');
    expect(inv.paidTxHash).toBe(p.txHash);
    // Exactly one outbox event, committed with the winning confirmation (#1432)
    expect(await OutboxEventModel.countDocuments({ type: 'payment.confirmed' })).toBe(1);
  });
});

// ── Invoice numbering ────────────────────────────────────────────────────────

describe('Invoice numbering (transactional)', () => {
  const year = new Date().getFullYear();
  const seqOf = (invoiceNumber: string) => Number(invoiceNumber.split('-').pop());

  function invoiceFields(clinicId: string) {
    return {
      clinicId: new Types.ObjectId(clinicId),
      patientId: new Types.ObjectId(),
      lineItems: [{ description: 'Consult', quantity: 1, unitPrice: '50', total: '50' }],
      subtotal: '50',
      total: '50',
      dueDate: new Date(),
      stellarDestination: 'GDEST',
    };
  }

  async function counterSeq(clinicId: string) {
    const counter = await InvoiceCounterModel.findById(`${clinicId}:${year}`).lean();
    return (counter as any)?.seq ?? 0;
  }

  it('hands out unique, gap-free numbers to concurrent callers', async () => {
    const clinicId = new Types.ObjectId().toString();
    await nextInvoiceNumber(clinicId); // create the counter

    const numbers = await Promise.all(
      Array.from({ length: 25 }, () => nextInvoiceNumber(clinicId))
    );

    expect(new Set(numbers).size).toBe(25);
    expect(numbers.map(seqOf).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 2)
    );
    expect(await counterSeq(clinicId)).toBe(26);
  });

  it('creates concurrent numbered invoices with unique, contiguous numbers', async () => {
    const clinicId = new Types.ObjectId().toString();
    await createNumberedInvoice(clinicId, invoiceFields(clinicId));

    await Promise.all(
      Array.from({ length: 10 }, () => createNumberedInvoice(clinicId, invoiceFields(clinicId)))
    );

    const invoices = await InvoiceModel.find({ clinicId }).lean();
    expect(invoices).toHaveLength(11);
    expect(invoices.map((i) => seqOf(i.invoiceNumber)).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 11 }, (_, i) => i + 1)
    );
    for (const inv of invoices) expect(inv.stellarMemo).toBe(inv.invoiceNumber);
    expect(await counterSeq(clinicId)).toBe(11);
  });

  it('rolls back the counter increment when the invoice insert fails', async () => {
    const clinicId = new Types.ObjectId().toString();
    const first = await createNumberedInvoice(clinicId, invoiceFields(clinicId));
    expect(first.invoiceNumber).toBe(`INV-${year}-00001`);

    jest.spyOn(InvoiceModel, 'create').mockImplementationOnce(() => {
      throw injected();
    });
    await expect(createNumberedInvoice(clinicId, invoiceFields(clinicId))).rejects.toThrow(
      'Injected failure'
    );

    expect(await counterSeq(clinicId)).toBe(1);
    expect(await InvoiceModel.countDocuments({ clinicId })).toBe(1);

    // The next invoice reuses the number the failed attempt would have taken
    const next = await createNumberedInvoice(clinicId, invoiceFields(clinicId));
    expect(next.invoiceNumber).toBe(`INV-${year}-00002`);
  });

  it('does not leave a counter behind when the very first invoice insert fails', async () => {
    const clinicId = new Types.ObjectId().toString();
    jest.spyOn(InvoiceModel, 'create').mockImplementationOnce(() => {
      throw injected();
    });

    await expect(createNumberedInvoice(clinicId, invoiceFields(clinicId))).rejects.toThrow(
      'Injected failure'
    );

    expect(await InvoiceCounterModel.findById(`${clinicId}:${year}`)).toBeNull();
    expect(await InvoiceModel.countDocuments({ clinicId })).toBe(0);
  });
});

// Guard: prove the suite is really running against a replica set.
it('runs against a replica set that supports transactions', async () => {
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  expect(hello.setName).toBeDefined();
});
