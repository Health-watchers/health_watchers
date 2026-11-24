import { portalFetch, portalGet, portalSend } from './portalApi';

export type PlanStatus = 'active' | 'paused' | 'cancelled' | 'completed';
export type PlanFrequency = 'weekly' | 'monthly' | 'quarterly' | 'annually';
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';

export interface RecurringPlan {
  _id: string;
  amount: string;
  currency: string;
  frequency: PlanFrequency;
  description?: string;
  status: PlanStatus;
  startDate: string;
  endDate?: string;
  nextPaymentDate: string | null;
  pausedAt?: string;
  cancelledAt?: string;
  paymentMethodId: string | null;
  paymentsMade: number;
  totalPaid: string;
  lastPayment: { date: string; status: 'pending' | 'completed' | 'failed' } | null;
  failureCount: number;
}

export interface PlanHistoryItem {
  date: string;
  intentId?: string;
  status: 'pending' | 'completed' | 'failed';
  transactionHash?: string;
  failureReason?: string;
  amount: string;
  currency: string;
}

export interface SavedCard {
  _id: string;
  brand: CardBrand;
  last4: string;
  expMonth: number;
  expYear: number;
  cardholderName?: string;
  isDefault: boolean;
  planCount: number;
  createdAt: string;
}

export const FREQUENCY_LABEL: Record<PlanFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  annually: 'Yearly',
};

export const PLAN_STATUS_STYLE: Record<PlanStatus, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  paused: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

export const BRAND_LABEL: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  other: 'Card',
};

export const cardLabel = (c: Pick<SavedCard, 'brand' | 'last4'>) =>
  `${BRAND_LABEL[c.brand]} •••• ${c.last4}`;

export const portalPaymentsApi = {
  plans: () => portalGet<RecurringPlan[]>('/payments/recurring'),
  history: async (planId: string, page = 1) => {
    const { data, meta } = await portalSendGet<PlanHistoryItem[]>(
      `/payments/recurring/${encodeURIComponent(planId)}/history?page=${page}&limit=10`
    );
    return { items: data, meta: meta as { total: number; page: number; pages: number } };
  },
  changeStatus: (planId: string, action: 'pause' | 'resume' | 'cancel', reason?: string) =>
    portalSend<RecurringPlan>(
      `/payments/recurring/${encodeURIComponent(planId)}/${action}`,
      'POST',
      reason ? { reason } : {}
    ),
  assignCard: (planId: string, paymentMethodId: string) =>
    portalSend<RecurringPlan>(
      `/payments/recurring/${encodeURIComponent(planId)}/payment-method`,
      'PUT',
      { paymentMethodId }
    ),
  cards: () => portalGet<SavedCard[]>('/payments/methods'),
  addCard: (card: TokenizedCard & { cardholderName?: string; makeDefault?: boolean }) =>
    portalSend<SavedCard>('/payments/methods', 'POST', card),
  removeCard: (cardId: string) =>
    portalSend<{ removed: string }>(`/payments/methods/${encodeURIComponent(cardId)}`, 'DELETE'),
  setDefault: (cardId: string) =>
    portalSend<SavedCard>(`/payments/methods/${encodeURIComponent(cardId)}/default`, 'PATCH'),
};

/** GET that keeps the response `meta` (portalGet only returns `data`). */
async function portalSendGet<T>(endpoint: string) {
  const res = await portalFetch(endpoint);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message ?? `Portal API error: ${res.status}`);
  return json as { data: T; meta?: Record<string, unknown> };
}

// ── Card tokenization ─────────────────────────────────────────────────────────

export interface TokenizedCard {
  processorToken: string;
  brand: CardBrand;
  last4: string;
  expMonth: number;
  expYear: number;
}

export function detectBrand(number: string): CardBrand {
  const n = number.replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(n)) return 'discover';
  return 'other';
}

export function luhnValid(number: string): boolean {
  const n = number.replace(/\D/g, '');
  if (n.length < 12 || n.length > 19) return false;
  let sum = 0;
  for (let i = n.length - 1, dbl = false; i >= 0; i--, dbl = !dbl) {
    let d = Number(n[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export interface CardFormInput {
  number: string;
  expiry: string; // MM/YY
  cvc: string;
}

/** Returns a field → message map of problems with the card form, empty when valid. */
export function validateCardForm(input: CardFormInput, now = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!luhnValid(input.number)) errors.number = 'Enter a valid card number';

  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(input.expiry.trim());
  if (!m) errors.expiry = 'Use MM/YY';
  else {
    const month = Number(m[1]);
    const year = 2000 + Number(m[2]);
    if (month < 1 || month > 12) errors.expiry = 'Invalid month';
    else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
      errors.expiry = 'This card has expired';
    }
  }

  const cvcLength = detectBrand(input.number) === 'amex' ? 4 : 3;
  if (!new RegExp(`^\\d{${cvcLength}}$`).test(input.cvc)) errors.cvc = `Enter the ${cvcLength}-digit security code`;
  return errors;
}

/**
 * Tokenizes a card in the browser so the card number never reaches the Health Watchers API.
 *
 * This is a development stub standing in for the payment processor's client SDK (e.g. Stripe
 * Elements `createPaymentMethod`): it returns a test token plus display metadata. Swap the body
 * for the processor call in production — the rest of the flow stays the same.
 */
export async function tokenizeCard(input: CardFormInput): Promise<TokenizedCard> {
  const errors = validateCardForm(input);
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);

  const digits = input.number.replace(/\D/g, '');
  const [mm, yy] = input.expiry.split('/').map((s) => Number(s.trim()));
  const random = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
  return {
    processorToken: `tok_test_${random}`,
    brand: detectBrand(digits),
    last4: digits.slice(-4),
    expMonth: mm,
    expYear: 2000 + yy,
  };
}
