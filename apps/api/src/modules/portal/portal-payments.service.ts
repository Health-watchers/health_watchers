import { Types } from 'mongoose';
import { RecurringPayment } from '../payments/recurring-payment.model';
import {
  PatientPaymentMethodModel,
  type CardBrand,
} from '../payments/models/patient-payment-method.model';
import { sendMail } from '@api/utils/mailer';
import logger from '@api/utils/logger';

export type PlanAction = 'pause' | 'resume' | 'cancel';
type PlanStatus = 'active' | 'paused' | 'cancelled' | 'completed';

/** Plan statuses each portal action may be applied from. */
export const PLAN_ACTION_FROM: Record<PlanAction, PlanStatus[]> = {
  pause: ['active'],
  resume: ['paused'],
  cancel: ['active', 'paused'],
};

const ACTION_RESULT: Record<PlanAction, PlanStatus> = {
  pause: 'paused',
  resume: 'active',
  cancel: 'cancelled',
};

const ACTION_LOG: Record<PlanAction, 'paused' | 'resumed' | 'cancelled'> = {
  pause: 'paused',
  resume: 'resumed',
  cancel: 'cancelled',
};

export class PortalPaymentError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PortalPaymentError';
  }
}

export interface PatientScope {
  patientId: string;
  clinicId: string;
  userId: string;
}

const scopeFilter = (scope: PatientScope) => ({
  patientId: new Types.ObjectId(scope.patientId),
  clinicId: new Types.ObjectId(scope.clinicId),
});

function advance(date: Date, frequency: string): Date {
  const next = new Date(date);
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'annually':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  return next;
}

/**
 * Next charge date when a plan resumes: the stored date if still in the future, otherwise
 * the first scheduled date on or after `now` — missed periods while paused are skipped,
 * never back-charged.
 */
export function nextChargeOnResume(nextPaymentDate: Date, frequency: string, now = new Date()): Date {
  let next = new Date(nextPaymentDate);
  for (let i = 0; next < now && i < 1000; i++) next = advance(next, frequency);
  return next;
}

/** Summarises a plan's payment history for list views. */
export function summarisePlan(plan: any) {
  const history: any[] = plan.paymentHistory ?? [];
  const completed = history.filter((h) => h.status === 'completed');
  const last = [...history].sort((a, b) => +new Date(b.date) - +new Date(a.date))[0];
  return {
    _id: String(plan._id),
    amount: plan.amount,
    currency: plan.currency,
    frequency: plan.frequency,
    description: plan.description,
    status: plan.status,
    startDate: plan.startDate,
    endDate: plan.endDate,
    nextPaymentDate: plan.status === 'active' ? plan.nextPaymentDate : null,
    pausedAt: plan.pausedAt,
    cancelledAt: plan.cancelledAt,
    paymentMethodId: plan.paymentMethodId ? String(plan.paymentMethodId) : null,
    paymentsMade: completed.length,
    totalPaid: completed.reduce((s, h) => s + (Number(plan.amount) || 0), 0).toFixed(2),
    lastPayment: last ? { date: last.date, status: last.status } : null,
    failureCount: plan.failureCount ?? 0,
  };
}

export async function listPatientPlans(scope: PatientScope, status?: string) {
  const filter: Record<string, unknown> = scopeFilter(scope);
  if (status) filter.status = { $in: status.split(',') };
  const plans = await RecurringPayment.find(filter).sort({ status: 1, nextPaymentDate: 1 }).lean();
  return plans.map(summarisePlan);
}

export async function getPatientPlan(scope: PatientScope, planId: string) {
  if (!Types.ObjectId.isValid(planId)) {
    throw new PortalPaymentError(400, 'ValidationError', 'Invalid recurring payment id');
  }
  const plan = await RecurringPayment.findOne({ _id: planId, ...scopeFilter(scope) });
  if (!plan) throw new PortalPaymentError(404, 'NotFound', 'Recurring payment not found');
  return plan;
}

export function paginateHistory(plan: any, page = 1, limit = 20, status?: string) {
  const all = [...((plan.paymentHistory ?? []) as any[])]
    .filter((h) => !status || h.status === status)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const start = (page - 1) * limit;
  return {
    items: all.slice(start, start + limit).map((h) => ({
      date: h.date,
      intentId: h.intentId,
      status: h.status,
      transactionHash: h.transactionHash,
      failureReason: h.failureReason,
      amount: plan.amount,
      currency: plan.currency,
    })),
    meta: { total: all.length, page, limit, pages: Math.max(1, Math.ceil(all.length / limit)) },
  };
}

/** Applies a patient-initiated pause/resume/cancel and records it in the plan's change log. */
export async function changePlanStatus(
  scope: PatientScope,
  planId: string,
  action: PlanAction,
  reason?: string,
  now = new Date()
) {
  const plan: any = await getPatientPlan(scope, planId);
  const from = plan.status as PlanStatus;
  if (!PLAN_ACTION_FROM[action].includes(from)) {
    throw new PortalPaymentError(409, 'Conflict', `A ${from} plan cannot be ${ACTION_LOG[action]}`, {
      from,
      action,
    });
  }

  plan.status = ACTION_RESULT[action];
  if (action === 'pause') plan.pausedAt = now;
  if (action === 'resume') {
    plan.pausedAt = undefined;
    plan.failureCount = 0;
    plan.nextPaymentDate = nextChargeOnResume(plan.nextPaymentDate, plan.frequency, now);
    if (plan.endDate && plan.nextPaymentDate > plan.endDate) plan.status = 'completed';
  }
  if (action === 'cancel') {
    plan.cancelledAt = now;
    plan.cancellationReason = reason?.slice(0, 500);
  }
  plan.changeLog = [
    ...(plan.changeLog ?? []),
    {
      action: ACTION_LOG[action],
      at: now,
      by: new Types.ObjectId(scope.userId),
      byRole: 'PATIENT',
      ...(reason ? { reason: reason.slice(0, 500) } : {}),
    },
  ];
  await plan.save();
  return { plan, from };
}

// ── Email confirmations ──────────────────────────────────────────────────────

const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtDate = (d?: Date | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' }) : '';

export function buildPlanChangeEmail(opts: {
  patientName: string;
  plan: { amount: string; currency: string; frequency: string; description?: string; nextPaymentDate?: Date | null };
  change: 'paused' | 'resumed' | 'cancelled' | 'payment_method_changed';
  reason?: string;
  cardLabel?: string;
}) {
  const { plan, change } = opts;
  const what = `${escapeHtml(plan.amount)} ${escapeHtml(plan.currency)} ${escapeHtml(plan.frequency)}${
    plan.description ? ` — ${escapeHtml(plan.description)}` : ''
  }`;
  const headline: Record<typeof change, string> = {
    paused: 'Your recurring payment has been paused',
    resumed: 'Your recurring payment has been resumed',
    cancelled: 'Your recurring payment has been cancelled',
    payment_method_changed: 'Your recurring payment card has been updated',
  };
  const detail: Record<typeof change, string> = {
    paused: 'No further charges will be made until you resume the plan.',
    resumed: plan.nextPaymentDate
      ? `Your next payment is scheduled for <strong>${fmtDate(plan.nextPaymentDate)}</strong>.`
      : 'Payments will continue on the regular schedule.',
    cancelled: 'No further charges will be made for this plan.',
    payment_method_changed: `Future payments will be charged to <strong>${escapeHtml(opts.cardLabel ?? 'your new card')}</strong>.`,
  };
  return {
    subject: headline[change],
    html: `
      <p>Hi ${escapeHtml(opts.patientName || 'there')},</p>
      <p>${headline[change]}:</p>
      <p><strong>${what}</strong></p>
      <p>${detail[change]}</p>
      ${opts.reason ? `<p>Reason given: ${escapeHtml(opts.reason)}</p>` : ''}
      <p>If you did not make this change, please contact your clinic immediately.</p>
      <p>You can review your recurring payments any time in the patient portal.</p>
    `,
  };
}

/** Best-effort confirmation email — failures are logged, never surfaced to the patient. */
export async function sendPlanChangeEmail(
  to: string | undefined,
  opts: Parameters<typeof buildPlanChangeEmail>[0]
): Promise<boolean> {
  if (!to) return false;
  try {
    await sendMail({ to, ...buildPlanChangeEmail(opts) });
    return true;
  } catch (err) {
    logger.warn({ err }, 'Failed to send recurring payment confirmation email');
    return false;
  }
}

// ── Payment methods ──────────────────────────────────────────────────────────

const TOKEN_RE = /^(tok|pm|card)_[A-Za-z0-9_]{6,64}$/;
const BRANDS: CardBrand[] = ['visa', 'mastercard', 'amex', 'discover', 'other'];

export interface AddCardInput {
  processorToken: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  cardholderName?: string;
  makeDefault?: boolean;
}

export function validateCardInput(input: AddCardInput, now = new Date()): string | null {
  if (!TOKEN_RE.test(input.processorToken ?? '')) return 'A valid card token is required';
  if (!BRANDS.includes(input.brand as CardBrand)) return 'Unsupported card brand';
  if (!/^\d{4}$/.test(input.last4 ?? '')) return 'last4 must be 4 digits';
  if (!Number.isInteger(input.expMonth) || input.expMonth < 1 || input.expMonth > 12) {
    return 'Invalid expiry month';
  }
  if (!Number.isInteger(input.expYear) || input.expYear < 2000 || input.expYear > 2100) {
    return 'Invalid expiry year';
  }
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  if (input.expYear < y || (input.expYear === y && input.expMonth < m)) return 'Card has expired';
  return null;
}

const toCardResponse = (c: any) => ({
  _id: String(c._id),
  brand: c.brand,
  last4: c.last4,
  expMonth: c.expMonth,
  expYear: c.expYear,
  cardholderName: c.cardholderName,
  isDefault: c.isDefault,
  createdAt: c.createdAt,
});

export const cardLabel = (c: { brand: string; last4: string }) =>
  `${c.brand.charAt(0).toUpperCase()}${c.brand.slice(1)} ending ${c.last4}`;

export async function listCards(scope: PatientScope) {
  const cards = await PatientPaymentMethodModel.find({ ...scopeFilter(scope), isActive: true })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
  const plans = await RecurringPayment.find(
    { ...scopeFilter(scope), status: { $in: ['active', 'paused'] }, paymentMethodId: { $ne: null } },
    { paymentMethodId: 1 }
  ).lean();
  return cards.map((c) => ({
    ...toCardResponse(c),
    planCount: plans.filter((p: any) => String(p.paymentMethodId) === String(c._id)).length,
  }));
}

export async function addCard(scope: PatientScope, input: AddCardInput) {
  const problem = validateCardInput(input);
  if (problem) throw new PortalPaymentError(400, 'ValidationError', problem);

  const existing = await PatientPaymentMethodModel.countDocuments({ ...scopeFilter(scope), isActive: true });
  const isDefault = existing === 0 || Boolean(input.makeDefault);
  if (isDefault) {
    await PatientPaymentMethodModel.updateMany(
      { ...scopeFilter(scope), isActive: true },
      { $set: { isDefault: false } }
    );
  }
  try {
    const card = await PatientPaymentMethodModel.create({
      ...scopeFilter(scope),
      type: 'card',
      processorToken: input.processorToken,
      brand: input.brand,
      last4: input.last4,
      expMonth: input.expMonth,
      expYear: input.expYear,
      cardholderName: input.cardholderName?.trim() || undefined,
      isDefault,
    });
    return toCardResponse(card);
  } catch (err: any) {
    if (err?.code === 11000) {
      throw new PortalPaymentError(409, 'Conflict', 'This card has already been added');
    }
    throw err;
  }
}

async function getCard(scope: PatientScope, cardId: string) {
  if (!Types.ObjectId.isValid(cardId)) {
    throw new PortalPaymentError(400, 'ValidationError', 'Invalid payment method id');
  }
  const card = await PatientPaymentMethodModel.findOne({ _id: cardId, ...scopeFilter(scope), isActive: true });
  if (!card) throw new PortalPaymentError(404, 'NotFound', 'Payment method not found');
  return card;
}

export async function setDefaultCard(scope: PatientScope, cardId: string) {
  const card = await getCard(scope, cardId);
  await PatientPaymentMethodModel.updateMany(
    { ...scopeFilter(scope), isActive: true, _id: { $ne: card._id } },
    { $set: { isDefault: false } }
  );
  card.isDefault = true;
  await card.save();
  return toCardResponse(card);
}

/**
 * Removes (deactivates) a saved card. A card still funding an active or paused plan cannot be
 * removed until the plan is moved to another card or cancelled.
 */
export async function removeCard(scope: PatientScope, cardId: string) {
  const card = await getCard(scope, cardId);
  const inUse = await RecurringPayment.find(
    { ...scopeFilter(scope), paymentMethodId: card._id, status: { $in: ['active', 'paused'] } },
    { _id: 1, description: 1 }
  ).lean();
  if (inUse.length) {
    throw new PortalPaymentError(
      409,
      'PaymentMethodInUse',
      'This card is used by a recurring payment. Move the plan to another card or cancel it first.',
      { planIds: inUse.map((p: any) => String(p._id)) }
    );
  }

  card.isActive = false;
  card.isDefault = false;
  card.removedAt = new Date();
  await card.save();

  // Promote the most recent remaining card to default
  const next = await PatientPaymentMethodModel.findOne({ ...scopeFilter(scope), isActive: true }).sort({
    createdAt: -1,
  });
  if (next && !(await PatientPaymentMethodModel.exists({ ...scopeFilter(scope), isActive: true, isDefault: true }))) {
    next.isDefault = true;
    await next.save();
  }
  return { removed: String(card._id), defaultCardId: next ? String(next._id) : null };
}

export async function assignCardToPlan(scope: PatientScope, planId: string, cardId: string) {
  const [plan, card]: [any, any] = await Promise.all([getPatientPlan(scope, planId), getCard(scope, cardId)]);
  if (!['active', 'paused'].includes(plan.status)) {
    throw new PortalPaymentError(409, 'Conflict', `A ${plan.status} plan cannot be changed`);
  }
  if (String(plan.paymentMethodId) === String(card._id)) return { plan, card, changed: false };

  plan.paymentMethodId = card._id;
  plan.changeLog = [
    ...(plan.changeLog ?? []),
    {
      action: 'payment_method_changed',
      at: new Date(),
      by: new Types.ObjectId(scope.userId),
      byRole: 'PATIENT',
      reason: cardLabel(card),
    },
  ];
  await plan.save();
  return { plan, card, changed: true };
}
