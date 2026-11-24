/**
 * Test double for `outbox.service` in suites that mock Mongoose models (and so
 * cannot open a real transaction). `withOutboxTransaction` runs the work with
 * no session and publishes socket targets immediately through the (mocked)
 * socket modules, so existing real-time assertions keep working.
 *
 *   jest.mock('@api/modules/outbox/outbox.service', () =>
 *     require('@api/modules/outbox/__tests__/inline-outbox').inlineOutboxService
 *   );
 */
import type { OutboxEventInput } from '../outbox.service';

export const emittedOutboxEvents: OutboxEventInput[] = [];

function publishSockets(event: OutboxEventInput): void {
  for (const target of event.targets) {
    if (target.kind !== 'socket') continue;
    const data = target.data ?? event.payload;
    if (target.via === 'socket-service') {
      const { SocketService } = require('@api/services/socket.service');
      const service = SocketService.getInstance();
      if (!service) continue;
      if (target.room === 'appointment')
        service.emitAppointmentUpdate(target.id, target.event, data);
      else if (target.room === 'clinic') service.emitToClinic(target.id, target.event, data);
      else service.emitToUser(target.id, target.event, data);
    } else {
      const socket = require('@api/realtime/socket');
      if (target.room === 'user') socket.emitToUser?.(target.id, target.event, data);
      else socket.emitToClinic?.(target.id, target.event, data);
    }
  }
}

export const inlineOutboxService = {
  withOutboxTransaction: async <T>(
    work: (session: undefined, emit: (e: OutboxEventInput) => Promise<string>) => Promise<T>
  ): Promise<T> => {
    const events: OutboxEventInput[] = [];
    const result = await work(undefined, async (event) => {
      events.push(event);
      return `evt-${emittedOutboxEvents.length + events.length}`;
    });
    emittedOutboxEvents.push(...events);
    events.forEach(publishSockets);
    return result;
  },
  recordOutboxEvent: async (event: OutboxEventInput) => {
    emittedOutboxEvents.push(event);
    return `evt-${emittedOutboxEvents.length}`;
  },
  dispatchCommittedOutboxEvents: () => undefined,
};
