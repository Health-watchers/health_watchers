import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { BatchPaymentService } from './batch-payment.service';
import { StellarService } from '../stellar/stellar.service';
import { MetricsService } from '../metrics/metrics.service';

/**
 * End-to-end tests for the Stellar batch payment processor.
 *
 * These tests exercise the full API -> stellar-service flow against Stellar
 * testnet. They are skipped unless STELLAR_E2E=1 is set in the environment,
 * because they require funded testnet accounts and network access.
 *
 * Run with:
 *   STELLAR_E2E=1 npm run test:e2e -- batch-payment.e2e.test.ts
 */
const E2E_ENABLED = process.env.STELLAR_E2E === '1';
const describeE2E = E2E_ENABLED ? describe : describe.skip;

interface BatchPaymentItem {
  destination: string;
  amount: string;
  asset?: string;
  memo?: string;
}

interface BatchPaymentResult {
  batchId: string;
  status: 'pending' | 'submitted' | 'completed' | 'partial' | 'failed' | 'cancelled';
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    index: number;
    destination: string;
    status: 'success' | 'failed' | 'pending';
    transactionHash?: string;
    error?: string;
    attempts?: number;
  }>;
}

describeE2E('Batch Payment Processor (E2E - testnet)', () => {
  let app: INestApplication;
  let batchPaymentService: BatchPaymentService;
  let stellarService: StellarService;
  let metricsService: MetricsService;
  let sourceAccount: string;

  // 50 distinct destination accounts generated for the batch.
  const BATCH_SIZE = 50;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    batchPaymentService = app.get(BatchPaymentService);
    stellarService = app.get(StellarService);
    metricsService = app.get(MetricsService);

    // The source account is expected to be pre-funded on testnet via the
    // STELLAR_E2E_SOURCE_SECRET environment variable.
    const secret = process.env.STELLAR_E2E_SOURCE_SECRET;
    if (!secret) {
      throw new Error(
        'STELLAR_E2E_SOURCE_SECRET must be set when STELLAR_E2E=1',
      );
    }
    sourceAccount = stellarService.getPublicKeyFromSecret(secret);
  }, 120_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  function buildBatch(size: number): BatchPaymentItem[] {
    const items: BatchPaymentItem[] = [];
    for (let i = 0; i < size; i++) {
      items.push({
        destination: stellarService.generateTestnetAccount().publicKey,
        amount: '1.0000000',
        asset: 'XLM',
        memo: `batch-item-${i}`,
      });
    }
    return items;
  }

  describe('50-payment batch submission', () => {
    it('submits a 50-payment batch and reports full success', async () => {
      const payments = buildBatch(BATCH_SIZE);

      const createRes = await request(app.getHttpServer())
        .post('/payments/batch')
        .send({ sourceAccount, payments })
        .expect(201);

      const batchId: string = createRes.body.batchId;
      expect(batchId).toBeDefined();
      expect(createRes.body.total).toBe(BATCH_SIZE);

      // Submit the batch for processing.
      const submitRes = await request(app.getHttpServer())
        .post(`/payments/batch/${batchId}/submit`)
        .expect(200);

      const result: BatchPaymentResult = submitRes.body;
      expect(result.batchId).toBe(batchId);
      expect(result.total).toBe(BATCH_SIZE);
      expect(result.results).toHaveLength(BATCH_SIZE);

      // Every payment should have a transaction hash on success.
      for (const item of result.results) {
        if (item.status === 'success') {
          expect(item.transactionHash).toBeDefined();
        }
      }

      // On a healthy testnet run we expect all payments to succeed.
      expect(result.succeeded).toBe(BATCH_SIZE);
      expect(result.failed).toBe(0);
      expect(result.status).toBe('completed');
    }, 300_000);

    it('reports partial success when some payments fail', async () => {
      const payments = buildBatch(BATCH_SIZE);

      // Inject failures into a subset of payments by using an invalid
      // destination for every 10th item.
      const injectedFailureIndexes = new Set<number>();
      for (let i = 0; i < BATCH_SIZE; i += 10) {
        payments[i].destination = 'GINVALIDDESTINATIONADDRESS000000000000000000000000000';
        injectedFailureIndexes.add(i);
      }

      const createRes = await request(app.getHttpServer())
        .post('/payments/batch')
        .send({ sourceAccount, payments })
        .expect(201);

      const batchId: string = createRes.body.batchId;

      const submitRes = await request(app.getHttpServer())
        .post(`/payments/batch/${batchId}/submit`)
        .expect(200);

      const result: BatchPaymentResult = submitRes.body;

      expect(result.total).toBe(BATCH_SIZE);
      expect(result.status).toBe('partial');
      expect(result.failed).toBe(injectedFailureIndexes.size);
      expect(result.succeeded).toBe(BATCH_SIZE - injectedFailureIndexes.size);

      // Verify the specific failed indexes are reported as failed.
      for (const idx of injectedFailureIndexes) {
        const item = result.results.find((r) => r.index === idx);
        expect(item).toBeDefined();
        expect(item!.status).toBe('failed');
        expect(item!.error).toBeDefined();
      }

      // Verify succeeded items are reported as success.
      for (const item of result.results) {
        if (!injectedFailureIndexes.has(item.index)) {
          expect(item.status).toBe('success');
          expect(item.transactionHash).toBeDefined();
        }
      }
    }, 300_000);
  });

  describe('retry logic', () => {
    it('retries failed transactions and records attempt counts', async () => {
      const payments = buildBatch(10);

      const createRes = await request(app.getHttpServer())
        .post('/payments/batch')
        .send({ sourceAccount, payments })
        .expect(201);

      const batchId: string = createRes.body.batchId;

      // Force the stellar service to fail the first attempt for each payment
      // so we can observe the retry behavior.
      const submitSpy = jest
        .spyOn(stellarService, 'submitPayment')
        .mockImplementationOnce(async () => {
          throw new Error('Injected transient failure');
        });

      const submitRes = await request(app.getHttpServer())
        .post(`/payments/batch/${batchId}/submit`)
        .send({ maxRetries: 2 })
        .expect(200);

      const result: BatchPaymentResult = submitRes.body;

      // The retried payment should eventually succeed and report attempts > 1.
      const retried = result.results.find((r) => (r.attempts ?? 0) > 1);
      expect(retried).toBeDefined();
      expect(retried!.status).toBe('success');

      submitSpy.mockRestore();
    }, 300_000);

    it('marks a payment as failed after exhausting retries', async () => {
      const payments = buildBatch(1);

      const createRes = await request(app.getHttpServer())
        .post('/payments/batch')
        .send({ sourceAccount, payments })
        .expect(201);

      const batchId: string = createRes.body.batchId;

      // Always fail for this payment to exhaust retries.
      const submitSpy = jest
        .spyOn(stellarService, 'submitPayment')
        .mockRejectedValue(new Error('Persistent failure'));

      const submitRes = await request(app.getHttpServer())
        .post(`/payments/batch/${batchId}/submit`)
        .send({ maxRetries: 2 })
        .expect(200);

      const result: BatchPaymentResult = submitRes.body;
      expect(result.failed).toBe(1);
      expect(result.status).toBe('failed');

      const item = result.results[0];
      expect(item.status).toBe('failed');
      expect(item.attempts).toBe(3); // initial + 2 retries
      expect(item.error).toContain('Persistent failure');

      submitSpy.mockRestore();
    }, 120_000);
  });

  describe('cancellation before submission', () => {
    it('cancels a batch before it is submitted', async () => {
      const payments = buildBatch(BATCH_SIZE);

      const createRes = await request(app.getHttpServer())
        .post('/payments/batch')
        .send({ sourceAccount, payments })
        .expect(201);

      const batchId: string = createRes.body.batchId;

      const cancelRes = await request(app.getHttpServer())
        .post(`/payments/batch/${batchId}/cancel`)
        .expect(200);

      expect(cancelRes.body.status).toBe('cancelled');

      // Attempting to submit a cancelled batch must be rejected.
      await request(app.getHttpServer())
        .post(`/payments/batch/${batchId}/submit`)
        .expect(409);

      // No transactions should have been submitted.
      const submitSpy = jest.spyOn(stellarService, 'submitPayment');
      expect(submitSpy).not.toHaveBeenCalled();
      submitSpy.mockRestore();
    }, 60_000);

    it('rejects cancellation of an already submitted batch', async () => {
      const payments = buildBatch(2);

      const createRes = await request(app.getHttpServer())
        .post('/payments/batch')
        .send({ sourceAccount, payments })
        .expect(201);

      const batchId: string = createRes.body.batchId;

      await request(app.getHttpServer())
        .post(`/payments/batch/${batchId}/submit`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/payments/batch/${batchId}/cancel`)
        .expect(409);
    }, 120_000);
  });

  describe('metrics', () => {
    it('increments batch throughput and failure-rate metrics', async () => {
      const throughputBefore = metricsService.getCounter(
        'stellar_batch_payments_total',
      );
      const failureBefore = metricsService.getCounter(
        'stellar_batch_payments_failed_total',
      );

      const payments = buildBatch(10);
      // Inject one failure.
      payments[0].destination =
        'GINVALIDDESTINATIONADDRESS000000000000000000000000000';

      const createRes = await request(app.getHttpServer())
        .post('/payments/batch')
        .send({ sourceAccount, payments })
        .expect(201);

      const batchId: string = createRes.body.batchId;

      await request(app.getHttpServer())
        .post(`/payments/batch/${batchId}/submit`)
        .expect(200);

      const throughputAfter = metricsService.getCounter(
        'stellar_batch_payments_total',
      );
      const failureAfter = metricsService.getCounter(
        'stellar_batch_payments_failed_total',
      );

      expect(throughputAfter - throughputBefore).toBeGreaterThanOrEqual(10);
      expect(failureAfter - failureBefore).toBeGreaterThanOrEqual(1);
    }, 120_000);
  });
});