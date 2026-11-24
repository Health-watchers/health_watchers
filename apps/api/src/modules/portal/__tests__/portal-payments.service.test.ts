jest.mock('@api/utils/mailer', () => ({ sendMail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../payments/recurring-payment.model', () => ({
  RecurringPayment: { find: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../payments/models/patient-payment-method.model', () => ({
  PatientPaymentMethodModel: {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    exists: jest.fn(),
  },
}));

import { Types } from 'mongoose';
import { sendMail } from '@api/utils/mailer';
import { RecurringPayment } from '../../payments/recurring-payment.model';
import { PatientPaymentMethodModel } from '../../payments/models/patient-payment-method.model';
import {
  PortalPaymentError,
  addCard,
  buildPlanChangeEmail,
  changePlanStatus,
  nextChargeOnResume,
  paginateHistory,
  removeCard,
  sendPlanChangeEmail,
  summarisePlan,
  validateCardInput,
} from '../portal-payments.service';

const scope = {
  patientId: new Types.ObjectId().toHexString(),
  clinicId: new Types.ObjectId().toHexString(),
  userId: new Types.ObjectId().toHexString(),
};
const PLAN_ID = new Types.ObjectId().toHexString();
const NOW = new Date('2026-10-22T00:00:00Z');

const makePlan = (overrides: Record<string, unknown> = {}): any => ({
  _id: PLAN_ID,
  amount: '50.00',
  currency: 'USDC',
  frequency: 'monthly',
  status: 'active',
  nextPaymentDate: new Date('2026-11-01T00:00:00Z'),
  paymentHistory: [],
  changeLog: [],
  failureCount: 0,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

describe('nextChargeOnResume', () => {
  it('keeps a future charge date', () => {
    const d = new Date('2026-11-01T00:00:00Z');
    expect(nextChargeOnResume(d, 'monthly', NOW)).toEqual(d);
  });

  it('skips periods missed while paused instead of back-charging', () => {
    const next = nextChargeOnResume(new Date('2026-07-01T00:00:00Z'), 'monthly', NOW);
    expect(next.toISOString().slice(0, 10)).toBe('2026-11-01');
  });

  it('advances weekly plans in 7-day steps', () => {
    const next = nextChargeOnResume(new Date('2026-10-01T00:00:00Z'), 'weekly', NOW);
    expect(next.toISOString().slice(0, 10)).toBe('2026-10-22');
  });
});

describe('changePlanStatus', () => {
  it.each([
    ['pause', 'active', 'paused'],
    ['resume', 'paused', 'active'],
    ['cancel', 'active', 'cancelled'],
    ['cancel', 'paused', 'cancelled'],
  ] as const)('%s moves a %s plan to %s and logs it', async (action, from, to) => {
    const plan = makePlan({ status: from });
    (RecurringPayment.findOne as jest.Mock).mockResolvedValue(plan);

    const result = await changePlanStatus(scope, PLAN_ID, action, 'Budget', NOW);

    expect(result.from).toBe(from);
    expect(plan.status).toBe(to);
    expect(plan.changeLog[plan.changeLog.length - 1]).toMatchObject({ byRole: 'PATIENT', reason: 'Budget' });
    expect(plan.save).toHaveBeenCalled();
  });

  it.each([
    ['pause', 'paused'],
    ['resume', 'active'],
    ['cancel', 'cancelled'],
    ['pause', 'completed'],
  ] as const)('rejects %s on a %s plan with 409', async (action, from) => {
    (RecurringPayment.findOne as jest.Mock).mockResolvedValue(makePlan({ status: from }));
    await expect(changePlanStatus(scope, PLAN_ID, action)).rejects.toMatchObject({ status: 409 });
  });

  it('resets failures and reschedules when resuming', async () => {
    const plan = makePlan({
      status: 'paused',
      failureCount: 3,
      pausedAt: new Date(),
      nextPaymentDate: new Date('2026-08-15T00:00:00Z'),
    });
    (RecurringPayment.findOne as jest.Mock).mockResolvedValue(plan);
    await changePlanStatus(scope, PLAN_ID, 'resume', undefined, NOW);
    expect(plan.failureCount).toBe(0);
    expect(plan.pausedAt).toBeUndefined();
    expect(plan.nextPaymentDate.toISOString().slice(0, 10)).toBe('2026-11-15');
  });

  it('completes a resumed plan whose next charge is past its end date', async () => {
    const plan = makePlan({
      status: 'paused',
      nextPaymentDate: new Date('2026-08-15T00:00:00Z'),
      endDate: new Date('2026-10-31T00:00:00Z'),
    });
    (RecurringPayment.findOne as jest.Mock).mockResolvedValue(plan);
    await changePlanStatus(scope, PLAN_ID, 'resume', undefined, NOW);
    expect(plan.status).toBe('completed');
  });

  it("returns 404 for another patient's plan", async () => {
    (RecurringPayment.findOne as jest.Mock).mockResolvedValue(null);
    await expect(changePlanStatus(scope, PLAN_ID, 'pause')).rejects.toBeInstanceOf(PortalPaymentError);
    expect((RecurringPayment.findOne as jest.Mock).mock.calls[0][0]).toMatchObject({
      patientId: new Types.ObjectId(scope.patientId),
    });
  });
});

describe('summarisePlan / paginateHistory', () => {
  const plan = makePlan({
    paymentHistory: [
      { date: new Date('2026-08-01'), status: 'completed', intentId: 'i1' },
      { date: new Date('2026-09-01'), status: 'failed', intentId: 'i2', failureReason: 'Insufficient funds' },
      { date: new Date('2026-10-01'), status: 'completed', intentId: 'i3' },
    ],
  });

  it('summarises payments made and the last attempt', () => {
    const s = summarisePlan(plan);
    expect(s.paymentsMade).toBe(2);
    expect(s.totalPaid).toBe('100.00');
    expect(s.lastPayment).toMatchObject({ status: 'completed' });
  });

  it('hides the next payment date unless the plan is active', () => {
    expect(summarisePlan({ ...plan, status: 'paused' }).nextPaymentDate).toBeNull();
  });

  it('paginates newest first and filters by status', () => {
    const page = paginateHistory(plan, 1, 2);
    expect(page.items.map((i) => i.intentId)).toEqual(['i3', 'i2']);
    expect(page.meta).toMatchObject({ total: 3, pages: 2 });
    expect(paginateHistory(plan, 1, 20, 'failed').items).toHaveLength(1);
  });
});

describe('plan change emails', () => {
  it('escapes patient-provided text', () => {
    const { html } = buildPlanChangeEmail({
      patientName: '<b>Jane</b>',
      plan: { amount: '50', currency: 'USDC', frequency: 'monthly' },
      change: 'cancelled',
      reason: '<script>x</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes the next payment date when resumed', () => {
    const { subject, html } = buildPlanChangeEmail({
      patientName: 'Jane',
      plan: { amount: '50', currency: 'USDC', frequency: 'monthly', nextPaymentDate: new Date('2026-11-01T00:00:00Z') },
      change: 'resumed',
    });
    expect(subject).toMatch(/resumed/);
    expect(html).toContain('November 1, 2026');
  });

  it('does not throw when the mailer fails', async () => {
    (sendMail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
    await expect(
      sendPlanChangeEmail('jane@example.com', {
        patientName: 'Jane',
        plan: { amount: '50', currency: 'USDC', frequency: 'monthly' },
        change: 'paused',
      })
    ).resolves.toBe(false);
  });

  it('skips sending without an email address', async () => {
    await expect(
      sendPlanChangeEmail(undefined, {
        patientName: 'Jane',
        plan: { amount: '50', currency: 'USDC', frequency: 'monthly' },
        change: 'paused',
      })
    ).resolves.toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('saved cards', () => {
  const card = {
    processorToken: 'tok_test_abc123',
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2030,
  };

  it('validates tokenized card input', () => {
    expect(validateCardInput(card, NOW)).toBeNull();
    expect(validateCardInput({ ...card, processorToken: '4242424242424242' }, NOW)).toMatch(/token/);
    expect(validateCardInput({ ...card, brand: 'diners' }, NOW)).toMatch(/brand/);
    expect(validateCardInput({ ...card, expYear: 2026, expMonth: 9 }, NOW)).toMatch(/expired/);
    expect(validateCardInput({ ...card, expMonth: 13 }, NOW)).toMatch(/month/);
  });

  it('makes the first card the default', async () => {
    (PatientPaymentMethodModel.countDocuments as jest.Mock).mockResolvedValue(0);
    (PatientPaymentMethodModel.create as jest.Mock).mockImplementation(async (d: any) => ({
      _id: new Types.ObjectId(),
      ...d,
    }));
    const saved = await addCard(scope, card);
    expect(saved.isDefault).toBe(true);
    expect(saved).not.toHaveProperty('processorToken');
  });

  it('refuses to remove a card that funds an active plan', async () => {
    const cardDoc = { _id: new Types.ObjectId(), save: jest.fn() };
    (PatientPaymentMethodModel.findOne as jest.Mock).mockResolvedValue(cardDoc);
    (RecurringPayment.find as jest.Mock).mockReturnValue({
      lean: () => Promise.resolve([{ _id: PLAN_ID }]),
    });
    await expect(removeCard(scope, String(cardDoc._id))).rejects.toMatchObject({
      status: 409,
      code: 'PaymentMethodInUse',
    });
    expect(cardDoc.save).not.toHaveBeenCalled();
  });

  it('deactivates an unused card and promotes another to default', async () => {
    const cardDoc: any = { _id: new Types.ObjectId(), isActive: true, isDefault: true, save: jest.fn() };
    const other: any = { _id: new Types.ObjectId(), isDefault: false, save: jest.fn() };
    (PatientPaymentMethodModel.findOne as jest.Mock)
      .mockResolvedValueOnce(cardDoc)
      .mockReturnValueOnce({ sort: () => Promise.resolve(other) });
    (PatientPaymentMethodModel.exists as jest.Mock).mockResolvedValue(null);
    (RecurringPayment.find as jest.Mock).mockReturnValue({ lean: () => Promise.resolve([]) });

    const result = await removeCard(scope, String(cardDoc._id));
    expect(cardDoc.isActive).toBe(false);
    expect(other.isDefault).toBe(true);
    expect(result.defaultCardId).toBe(String(other._id));
  });
});
