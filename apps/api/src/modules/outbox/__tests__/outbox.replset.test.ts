/**
 * Transactional outbox (#1432) against a real in-memory replica set.
 *
 * Covers the acceptance criterion "killing the API right after a write still
 * results in the webhook being delivered on restart": the post-commit fast
 * path is suppressed (the process "dies"), then the scheduled relay sweep —
 * what a restarted pod runs — delivers the webhook exactly once.
 */
import mongoose, { Types } from 'mongoose';

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@api/lib/email.service', () => ({ sendPaymentConfirmationEmail: () => undefined }));
jest.mock('@api/realtime/socket', () => ({ emitToClinic: jest.fn(), emitToUser: jest.fn() }));
jest.mock('@api/services/socket.service', () => ({
  SocketService: { getInstance: () => undefined },
}));
jest.mock('@api/modules/notifications/notification.service', () => ({
  createNotification: jest.fn(),
}));
jest.mock('@api/modules/payments/services/xlm-rate.service', () => ({
  getCurrentXLMRate: () => Promise.resolve({ rateUSD: 0.1 }),
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import axios from 'axios';
import { register } from '@api/services/metrics.service';
import { startReplSetTestDb, stopReplSetTestDb, ReplSetTestDb } from '../../../integration/helpers/test-db';
import { emitToClinic } from '@api/realtime/socket';
import { createNotification } from '@api/modules/notifications/notification.service';
import { PaymentRecordModel } from '@api/modules/payments/models/payment-record.model';
import { InvoiceModel } from '@api/modules/invoices/invoice.model';
import { UserModel } from '@api/modules/auth/models/user.model';
import {
  WebhookModel,
  WebhookDeliveryModel,
  WebhookEventLogModel,
} from '@api/modules/webhooks/webhook.model';
import { confirmPayment } from '@api/modules/payments/services/payment-confirmation.service';
import { buildPayment } from '../../../__tests__/factories/payment.factory';
import { OutboxEventModel } from '../outbox-event.model';
import * as outboxService from '../outbox.service';
import { withOutboxTransaction } from '../outbox.service';
import {
  deliverOutboxEvent,
  relayPendingOutboxEvents,
  refreshOutboxMetrics,
  MAX_ATTEMPTS,
} from '../outbox.relay';

const postMock = axios.post as jest.Mock;
const emitMock = emitToClinic as jest.Mock;
const notifyMock = createNotification as jest.Mock;

let testDb: ReplSetTestDb;

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function gaugeValue(name: string): Promise<number> {
  const metric = (await register.getMetricsAsJSON()).find((m) => m.name === name) as any;
  return metric.values[0]?.value ?? 0;
}

beforeAll(async () => {
  // PaymentRecord declares a conflicting duplicate txHash index; indexes are
  // not what this suite is about, so only build the ones it relies on.
  mongoose.set('autoIndex', false);
  testDb = await startReplSetTestDb();
  for (const model of [PaymentRecordModel, InvoiceModel, UserModel, WebhookModel, WebhookEventLogModel]) {
    await model.createCollection();
  }
  await OutboxEventModel.syncIndexes();
  await WebhookDeliveryModel.syncIndexes();
}, 120_000);

afterAll(async () => {
  mongoose.set('autoIndex', true);
  await stopReplSetTestDb(testDb);
});

beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  postMock.mockResolvedValue({ status: 200, data: 'ok' });
  notifyMock.mockResolvedValue({});
  await Promise.all(
    [OutboxEventModel, PaymentRecordModel, InvoiceModel, WebhookModel, WebhookDeliveryModel, WebhookEventLogModel].map(
      (m) => m.deleteMany({})
    )
  );
});

describe('withOutboxTransaction', () => {
  it('commits the outbox event with the domain write and delivers it right after commit', async () => {
    const clinicId = new Types.ObjectId().toString();

    await withOutboxTransaction(async (session, emit) => {
      await PaymentRecordModel.create([buildPayment({ clinicId })], { session });
      await emit({
        type: 'test.created',
        aggregateType: 'Test',
        aggregateId: 'a1',
        clinicId,
        payload: { hello: 'world' },
        targets: [{ kind: 'socket', room: 'clinic', id: clinicId, event: 'test:created' }],
      });
    });

    await waitFor(async () => (await OutboxEventModel.findOne({ status: 'delivered' })) !== null);
    const event = (await OutboxEventModel.findOne().lean())!;
    expect(event.payload).toEqual({ hello: 'world', eventId: event.eventId });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(clinicId, 'test:created', event.payload);
  });

  it('writes no outbox event when the transaction rolls back', async () => {
    const clinicId = new Types.ObjectId().toString();

    await expect(
      withOutboxTransaction(async (session, emit) => {
        await PaymentRecordModel.create([buildPayment({ clinicId })], { session });
        await emit({
          type: 'test.created',
          aggregateType: 'Test',
          aggregateId: 'a1',
          clinicId,
          payload: {},
          targets: [{ kind: 'socket', room: 'clinic', id: clinicId, event: 'test:created' }],
        });
        throw new Error('domain failure');
      })
    ).rejects.toThrow('domain failure');

    expect(await OutboxEventModel.countDocuments()).toBe(0);
    expect(await PaymentRecordModel.countDocuments()).toBe(0);
    await new Promise((r) => setImmediate(r));
    expect(emitMock).not.toHaveBeenCalled();
  });
});

describe('crash between commit and publish', () => {
  it('delivers the payment.confirmed webhook exactly once when the relay runs after a restart', async () => {
    // The process "dies" right after commit: the fast path never runs.
    jest.spyOn(outboxService, 'dispatchCommittedOutboxEvents').mockImplementation(() => undefined);

    const clinicId = new Types.ObjectId().toString();
    await WebhookModel.create({
      clinicId,
      url: 'https://hooks.example.com/payments',
      events: ['payment.confirmed'],
      secret: 'whsec_test',
      isActive: true,
    });
    const payment = await PaymentRecordModel.create(buildPayment({ clinicId }));

    const result = await confirmPayment({ intentId: payment.intentId, txHash: 'tx-crash' });
    expect(result.status).toBe('confirmed');

    // Committed with the payment, but nothing has been published yet.
    const pending = (await OutboxEventModel.findOne({ type: 'payment.confirmed' }).lean())!;
    expect(pending.status).toBe('pending');
    expect(pending.aggregateId).toBe(String(payment._id));
    expect(await WebhookDeliveryModel.countDocuments()).toBe(0);
    expect(emitMock).not.toHaveBeenCalled();

    // "Restart": the scheduled outbox-relay job sweeps pending events.
    await relayPendingOutboxEvents();

    const delivery = (await WebhookDeliveryModel.findOne().lean())!;
    expect(delivery.eventId).toBe(pending.eventId);
    expect(delivery.payload).toEqual(
      expect.objectContaining({
        eventId: pending.eventId,
        event: 'payment.confirmed',
        data: expect.objectContaining({ intentId: payment.intentId, txHash: 'tx-crash' }),
      })
    );
    await waitFor(async () => postMock.mock.calls.length > 0);
    const [url, , options] = postMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/payments');
    expect(options.headers['X-Webhook-Event-Id']).toBe(pending.eventId);
    await waitFor(
      async () => (await WebhookDeliveryModel.findById(delivery._id).lean())!.status === 'delivered'
    );
    expect(emitMock).toHaveBeenCalledWith(clinicId, 'payment:confirmed', expect.any(Object));
    expect((await OutboxEventModel.findOne({ eventId: pending.eventId }).lean())!.status).toBe(
      'delivered'
    );

    // A second sweep (or a second replica) must not deliver it again.
    await relayPendingOutboxEvents();
    await deliverOutboxEvent(pending.eventId);
    expect(await WebhookDeliveryModel.countDocuments()).toBe(1);
    expect(await WebhookEventLogModel.countDocuments()).toBe(1);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledTimes(1);
  });

  it('re-dispatching the same event to a webhook reuses the existing delivery', async () => {
    const clinicId = new Types.ObjectId().toString();
    await WebhookModel.create({
      clinicId,
      url: 'https://hooks.example.com/a',
      events: ['payment.confirmed'],
      secret: 's',
      isActive: true,
    });
    const { dispatchWebhookEvent } = await import('@api/modules/webhooks/event-dispatcher');
    const opts = { clinicId, event: 'payment.confirmed' as const, data: {}, eventId: 'evt-1' };

    await Promise.all([dispatchWebhookEvent(opts), dispatchWebhookEvent(opts)]);
    await dispatchWebhookEvent(opts);

    expect(await WebhookDeliveryModel.countDocuments({ eventId: 'evt-1' })).toBe(1);
  });
});

describe('deliverOutboxEvent', () => {
  async function seedEvent(overrides: Record<string, unknown> = {}) {
    const clinicId = new Types.ObjectId().toString();
    return OutboxEventModel.create({
      eventId: `evt-${new Types.ObjectId()}`,
      type: 'encounter.created',
      aggregateType: 'Encounter',
      aggregateId: 'enc-1',
      clinicId,
      payload: { encounterId: 'enc-1' },
      targets: [
        { kind: 'socket', room: 'clinic', id: clinicId, event: 'encounter:created' },
        {
          kind: 'notification',
          userIds: ['u1', 'u2'],
          notificationType: 'general',
          title: 't',
          message: 'm',
        },
      ],
      ...overrides,
    });
  }

  it('retries only the targets that failed and never re-sends delivered ones', async () => {
    const event = await seedEvent();
    notifyMock.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('db blip'));

    expect(await deliverOutboxEvent(event.eventId)).toBe('pending');
    let stored = (await OutboxEventModel.findOne({ eventId: event.eventId }).lean())!;
    expect(stored.deliveredTargets.sort()).toEqual(['0', '1:u1']);
    expect(stored.lastError).toBe('db blip');
    expect(stored.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Not due yet — the sweep leaves it alone.
    expect(await relayPendingOutboxEvents()).toBe(0);

    expect(await deliverOutboxEvent(event.eventId)).toBe('delivered');
    stored = (await OutboxEventModel.findOne({ eventId: event.eventId }).lean())!;
    expect(stored.status).toBe('delivered');
    expect(stored.deliveredAt).toBeDefined();
    expect(emitMock).toHaveBeenCalledTimes(1);
    // u1 once, u2 failed once then succeeded
    expect(notifyMock.mock.calls.map(([n]) => n.userId)).toEqual(['u1', 'u2', 'u2']);
    expect(notifyMock.mock.calls[0][0].metadata).toEqual({ eventId: event.eventId });
  });

  it('lets only one of several concurrent relays claim an event', async () => {
    const event = await seedEvent();
    const results = await Promise.all([1, 2, 3].map(() => deliverOutboxEvent(event.eventId)));
    expect(results.filter((r) => r === 'delivered')).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(2);
    expect(emitMock).toHaveBeenCalledTimes(1);
  });

  it(`marks the event failed after ${MAX_ATTEMPTS} attempts`, async () => {
    const event = await seedEvent({ attempts: MAX_ATTEMPTS - 1 });
    notifyMock.mockRejectedValue(new Error('down'));

    expect(await deliverOutboxEvent(event.eventId)).toBe('failed');
    expect((await OutboxEventModel.findOne({ eventId: event.eventId }).lean())!.status).toBe(
      'failed'
    );
  });

  it('reports outbox lag and backlog', async () => {
    await seedEvent({ createdAt: new Date(Date.now() - 90_000), nextAttemptAt: new Date(Date.now() + 60_000) });
    await refreshOutboxMetrics();
    expect(await gaugeValue('outbox_pending_events')).toBe(1);
    expect(await gaugeValue('outbox_lag_seconds')).toBeGreaterThanOrEqual(89);
  });
});
