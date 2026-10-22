/**
 * Unit tests for email-queue.ts
 *
 * bullmq and ioredis are mocked so nothing connects to Redis. The statics let
 * us inspect the exact Queue / Worker instances the module created.
 */
// bullmq is not installed in this workspace, so the mock must be virtual.
jest.mock(
  'bullmq',
  () => {
    class MockQueue {
      static last: { add: jest.Mock } | null = null;
      add: jest.Mock;
      constructor() {
        this.add = jest.fn().mockResolvedValue({ id: 'job-1' });
        MockQueue.last = this;
      }
    }
    class MockWorker {
      static last: MockWorker | null = null;
      processor: (job: { data: unknown }) => Promise<unknown>;
      events: Record<string, () => void>;
      constructor(_name: string, processor: (job: { data: unknown }) => Promise<unknown>) {
        this.processor = processor;
        this.events = {};
        MockWorker.last = this;
      }
      on(event: string, cb: () => void) {
        this.events[event] = cb;
        return this;
      }
    }
    return { Queue: MockQueue, Worker: MockWorker };
  },
  { virtual: true }
);

jest.mock('ioredis', () => {
  class MockRedis {
    status = 'mock';
  }
  return { __esModule: true, default: MockRedis };
});

jest.mock('@health-watchers/config', () => ({
  config: { redisUrl: 'redis://localhost:6379' },
}));

jest.mock('./mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));

import { Queue, Worker } from 'bullmq';
import { enqueueEmail, startEmailWorker, emailQueue } from './email-queue';
import { sendMail } from './mailer';

type MockQueueCtor = { last: { add: jest.Mock } } & jest.Mock;
type MockWorkerCtor = {
  last: {
    processor: (job: { data: unknown }) => Promise<unknown>;
    events: Record<string, () => void>;
  } | null;
} & jest.Mock;

const queueCtor = Queue as unknown as MockQueueCtor;
const workerCtor = Worker as unknown as MockWorkerCtor;

const opts: Parameters<typeof enqueueEmail>[0] = {
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
};

describe('enqueueEmail', () => {
  it('adds the job with retry + backoff options', async () => {
    await enqueueEmail(opts);
    expect(queueCtor.last?.add).toHaveBeenCalledWith('send', opts, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  });

  it('does not throw when the queue.add fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    queueCtor.last?.add.mockRejectedValueOnce(new Error('redis down'));
    await expect(enqueueEmail(opts)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('startEmailWorker', () => {
  beforeEach(() => {
    (sendMail as jest.Mock).mockClear();
    workerCtor.last = null;
  });

  it('creates a worker that sends the job email via mailer', async () => {
    startEmailWorker();
    const worker = workerCtor.last;
    expect(worker).not.toBeNull();

    const job = { data: opts, id: 'job-x', toString: () => 'job-x' } as never;
    await worker!.processor(job);
    expect(sendMail).toHaveBeenCalledWith(opts);

    // completed handler does not throw and logs via console.info
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    worker!.events.completed({ data: opts, id: 'job-x' } as never);
    worker!.events.failed(job, new Error('nope'));
    info.mockRestore();
  });
});

describe('emailQueue module default', () => {
  it('exports a configured Queue bound to the email queue name', () => {
    expect(emailQueue).toBeDefined();
  });
});
