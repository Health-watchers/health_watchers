import { test, expect, Page } from '@playwright/test';
import { PortalRecurringPaymentsPage } from './pages/portal/PortalRecurringPaymentsPage';

/**
 * Patient portal recurring payment management (#1690).
 * The portal API is mocked with an in-memory store so each test is deterministic.
 */

interface Plan {
  _id: string;
  amount: string;
  currency: string;
  frequency: string;
  description: string;
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  startDate: string;
  nextPaymentDate: string | null;
  pausedAt?: string;
  cancelledAt?: string;
  paymentMethodId: string | null;
  paymentsMade: number;
  totalPaid: string;
  lastPayment: null;
  failureCount: number;
}

interface Card {
  _id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  cardholderName?: string;
  isDefault: boolean;
  planCount: number;
  createdAt: string;
}

interface Store {
  plans: Plan[];
  cards: Card[];
  emails: { planId?: string; change: string }[];
  addCardBodies: Record<string, unknown>[];
}

function seed(): Store {
  return {
    plans: [
      {
        _id: 'plan-physio',
        amount: '40.00',
        currency: 'USDC',
        frequency: 'monthly',
        description: 'Physiotherapy plan',
        status: 'active',
        startDate: '2026-06-01T00:00:00.000Z',
        nextPaymentDate: '2026-11-01T00:00:00.000Z',
        paymentMethodId: 'card-visa',
        paymentsMade: 4,
        totalPaid: '160.00',
        lastPayment: null,
        failureCount: 0,
      },
      {
        _id: 'plan-ortho',
        amount: '120.00',
        currency: 'USDC',
        frequency: 'quarterly',
        description: 'Orthodontic treatment',
        status: 'paused',
        startDate: '2026-01-01T00:00:00.000Z',
        nextPaymentDate: null,
        pausedAt: '2026-09-15T00:00:00.000Z',
        paymentMethodId: 'card-visa',
        paymentsMade: 3,
        totalPaid: '360.00',
        lastPayment: null,
        failureCount: 0,
      },
    ],
    cards: [
      {
        _id: 'card-visa',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
        cardholderName: 'Jane Doe',
        isDefault: true,
        planCount: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    emails: [],
    addCardBodies: [],
  };
}

const ok = (data: unknown, meta?: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify({ status: 'success', data, ...(meta ? { meta } : {}) }),
});
const fail = (status: number, error: string, message: string) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify({ error, message }),
});

const history = [
  { date: '2026-10-01T00:00:00.000Z', status: 'completed', intentId: 'pi_4', transactionHash: 'tx4', amount: '40.00', currency: 'USDC' },
  { date: '2026-09-01T00:00:00.000Z', status: 'failed', intentId: 'pi_3', failureReason: 'Card declined', amount: '40.00', currency: 'USDC' },
  { date: '2026-08-01T00:00:00.000Z', status: 'completed', intentId: 'pi_2', transactionHash: 'tx2', amount: '40.00', currency: 'USDC' },
];

async function mockPortalPayments(page: Page, store: Store) {
  await page.route('**/api/v1/portal/payments/**', async (route) => {
    const req = route.request();
    const method = req.method();
    const path = new URL(req.url()).pathname.replace(/^.*\/api\/v1\/portal\/payments/, '');

    if (method === 'GET' && path === '/recurring') return route.fulfill(ok(store.plans));

    const historyMatch = path.match(/^\/recurring\/([^/]+)\/history$/);
    if (method === 'GET' && historyMatch) {
      return route.fulfill(ok(history, { total: history.length, page: 1, limit: 10, pages: 1 }));
    }

    const actionMatch = path.match(/^\/recurring\/([^/]+)\/(pause|resume|cancel)$/);
    if (method === 'POST' && actionMatch) {
      const [, id, action] = actionMatch;
      const plan = store.plans.find((p) => p._id === id)!;
      const allowed = { pause: ['active'], resume: ['paused'], cancel: ['active', 'paused'] }[action]!;
      if (!allowed.includes(plan.status)) {
        return route.fulfill(fail(409, 'Conflict', `A ${plan.status} plan cannot be changed`));
      }
      const now = new Date().toISOString();
      if (action === 'pause') Object.assign(plan, { status: 'paused', pausedAt: now, nextPaymentDate: null });
      if (action === 'resume')
        Object.assign(plan, { status: 'active', pausedAt: undefined, nextPaymentDate: '2026-12-01T00:00:00.000Z' });
      if (action === 'cancel') Object.assign(plan, { status: 'cancelled', cancelledAt: now, nextPaymentDate: null });
      store.emails.push({ planId: id, change: action });
      return route.fulfill(ok(plan, { emailSent: true }));
    }

    const cardMatch = path.match(/^\/recurring\/([^/]+)\/payment-method$/);
    if (method === 'PUT' && cardMatch) {
      const plan = store.plans.find((p) => p._id === cardMatch[1])!;
      plan.paymentMethodId = req.postDataJSON().paymentMethodId;
      store.emails.push({ planId: plan._id, change: 'payment_method_changed' });
      return route.fulfill(ok(plan, { emailSent: true }));
    }

    if (method === 'GET' && path === '/methods') {
      const cards = store.cards.map((c) => ({
        ...c,
        planCount: store.plans.filter(
          (p) => p.paymentMethodId === c._id && (p.status === 'active' || p.status === 'paused')
        ).length,
      }));
      return route.fulfill(ok(cards));
    }

    if (method === 'POST' && path === '/methods') {
      const body = req.postDataJSON();
      store.addCardBodies.push(body);
      const card: Card = {
        _id: `card-${store.cards.length + 1}`,
        brand: body.brand,
        last4: body.last4,
        expMonth: body.expMonth,
        expYear: body.expYear,
        cardholderName: body.cardholderName,
        isDefault: Boolean(body.makeDefault),
        planCount: 0,
        createdAt: new Date().toISOString(),
      };
      if (card.isDefault) store.cards.forEach((c) => (c.isDefault = false));
      store.cards.push(card);
      return route.fulfill(ok(card, undefined, 201));
    }

    const removeMatch = path.match(/^\/methods\/([^/]+)$/);
    if (method === 'DELETE' && removeMatch) {
      const id = removeMatch[1];
      const inUse = store.plans.some(
        (p) => p.paymentMethodId === id && (p.status === 'active' || p.status === 'paused')
      );
      if (inUse) {
        return route.fulfill(
          fail(409, 'PaymentMethodInUse', 'This card is used by a recurring payment. Move the plan to another card or cancel it first.')
        );
      }
      store.cards = store.cards.filter((c) => c._id !== id);
      return route.fulfill(ok({ removed: id }));
    }

    const defaultMatch = path.match(/^\/methods\/([^/]+)\/default$/);
    if (method === 'PATCH' && defaultMatch) {
      store.cards.forEach((c) => (c.isDefault = c._id === defaultMatch[1]));
      return route.fulfill(ok(store.cards.find((c) => c.isDefault)));
    }

    return route.fulfill(fail(404, 'NotFound', `Unmocked ${method} ${path}`));
  });
}

test.describe('Portal recurring payments', () => {
  let store: Store;
  let portal: PortalRecurringPaymentsPage;

  test.beforeEach(async ({ page }) => {
    store = seed();
    await mockPortalPayments(page, store);
    portal = new PortalRecurringPaymentsPage(page);
    await portal.goto();
  });

  test('lists active and paused recurring payments', async () => {
    await expect(portal.plans).toHaveCount(2);
    await expect(portal.plan('Physiotherapy plan')).toContainText('40.00 USDC');
    await expect(portal.plan('Physiotherapy plan')).toContainText(/next payment/i);
    await expect(portal.plan('Orthodontic treatment')).toContainText(/paused/i);
  });

  test('pauses an active plan with a reason and confirms by email', async () => {
    await portal.act('Physiotherapy plan', 'Pause', 'Travelling for a month');

    await expect(portal.status).toContainText(/paused.*confirmation email/i);
    await expect(portal.plan('Physiotherapy plan').getByRole('button', { name: 'Resume' })).toBeVisible();
    expect(store.plans[0].status).toBe('paused');
    expect(store.emails).toContainEqual({ planId: 'plan-physio', change: 'pause' });
  });

  test('resumes a paused plan', async () => {
    await portal.act('Orthodontic treatment', 'Resume');

    await expect(portal.status).toContainText(/resumed/i);
    await expect(portal.plan('Orthodontic treatment')).toContainText(/next payment/i);
    expect(store.plans[1].status).toBe('active');
  });

  test('cancelling asks for confirmation and moves the plan to past plans', async ({ page }) => {
    const plan = portal.plan('Physiotherapy plan');
    await plan.getByRole('button', { name: 'Cancel plan', exact: true }).click();
    await expect(plan.getByRole('dialog')).toContainText(/cannot be undone/i);

    // Backing out leaves the plan untouched
    await plan.getByRole('button', { name: /keep plan/i }).click();
    expect(store.plans[0].status).toBe('active');

    await portal.act('Physiotherapy plan', 'Cancel plan', 'Treatment finished');
    await expect(portal.status).toContainText(/cancelled/i);
    const past = page.locator('section', { hasText: 'Past plans' });
    await expect(past).toContainText('Physiotherapy plan');
    await expect(portal.plan('Physiotherapy plan').getByRole('button', { name: /pause|resume|cancel plan/i })).toHaveCount(0);
    expect(store.emails).toContainEqual({ planId: 'plan-physio', change: 'cancel' });
  });

  test('shows payment history for a plan, including failures', async () => {
    const table = await portal.openHistory('Physiotherapy plan');
    await expect(table.getByRole('row')).toHaveCount(history.length + 1);
    await expect(table).toContainText('Card declined');
    await expect(table).toContainText('tx4');
  });

  test('moves a plan to a newly added card', async ({ page }) => {
    await page.goto('/portal/payments/methods');
    await page.getByRole('button', { name: 'Add card' }).click();
    const form = page.getByRole('form', { name: /add a card/i });
    await form.getByLabel('Name on card').fill('Jane Doe');
    await form.getByLabel('Card number').fill('5555555555554444');
    await form.getByLabel(/expiry/i).fill('0931');
    await form.getByLabel(/security code/i).fill('123');
    await form.getByRole('button', { name: /save card/i }).click();

    await expect(page.getByRole('status')).toContainText(/mastercard •••• 4444 added/i);
    // The raw card number must never be sent to the API
    expect(JSON.stringify(store.addCardBodies)).not.toContain('5555555555554444');
    expect(store.addCardBodies[0]).toMatchObject({ brand: 'mastercard', last4: '4444', expMonth: 9, expYear: 2031 });
    expect(String(store.addCardBodies[0].processorToken)).toMatch(/^tok_/);

    await portal.goto();
    await portal.plan('Physiotherapy plan').getByLabel('Pay with').selectOption('card-2');
    await expect(portal.status).toContainText(/payment card updated/i);
    expect(store.plans[0].paymentMethodId).toBe('card-2');
  });
});

test.describe('Portal payment methods', () => {
  test('rejects an invalid card number before contacting the API', async ({ page }) => {
    const store = seed();
    await mockPortalPayments(page, store);
    await page.goto('/portal/payments/methods');

    await page.getByRole('button', { name: 'Add card' }).click();
    const form = page.getByRole('form', { name: /add a card/i });
    await form.getByLabel('Name on card').fill('Jane Doe');
    await form.getByLabel('Card number').fill('4242424242424241');
    await form.getByLabel(/expiry/i).fill('0101');
    await form.getByLabel(/security code/i).fill('12');
    await form.getByRole('button', { name: /save card/i }).click();

    await expect(form).toContainText(/valid card number/i);
    await expect(form).toContainText(/expired/i);
    await expect(form).toContainText(/3-digit security code/i);
    expect(store.addCardBodies).toHaveLength(0);
  });

  test('blocks removing a card that funds a recurring payment', async ({ page }) => {
    const store = seed();
    await mockPortalPayments(page, store);
    await page.goto('/portal/payments/methods');

    const card = page.getByTestId('saved-card').filter({ hasText: '4242' });
    await expect(card).toContainText(/used by 2 recurring payments/i);
    await card.getByRole('button', { name: /remove visa/i }).click();
    await card.getByRole('button', { name: 'Remove card' }).click();

    await expect(page.getByRole('alert')).toContainText(/used by a recurring payment/i);
    expect(store.cards).toHaveLength(1);
  });

  test('removes an unused card and changes the default', async ({ page }) => {
    const store = seed();
    store.cards.push({
      _id: 'card-amex',
      brand: 'amex',
      last4: '0005',
      expMonth: 6,
      expYear: 2029,
      isDefault: false,
      planCount: 0,
      createdAt: '2026-05-01T00:00:00.000Z',
    });
    await mockPortalPayments(page, store);
    await page.goto('/portal/payments/methods');

    const amex = page.getByTestId('saved-card').filter({ hasText: '0005' });
    await amex.getByRole('button', { name: /make default/i }).click();
    await expect(amex).toContainText('Default');
    expect(store.cards.find((c) => c._id === 'card-amex')?.isDefault).toBe(true);

    await amex.getByRole('button', { name: /remove american express/i }).click();
    await amex.getByRole('button', { name: 'Remove card' }).click();
    await expect(page.getByRole('status')).toContainText(/removed/i);
    await expect(page.getByTestId('saved-card')).toHaveCount(1);
  });
});
