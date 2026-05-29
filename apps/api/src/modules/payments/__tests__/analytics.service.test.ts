/**
 * Unit tests for the payment analytics service.
 *
 * Uses MongoDB Memory Server for a real in-process database.
 * XLMRateModel is seeded with a known rate so USD calculations are deterministic.
 */

// ── Env stubs ─────────────────────────────────────────────────────────────────
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.NODE_ENV = 'test';
process.env.STELLAR_NETWORK = 'testnet';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    apiPort: '3001',
    nodeEnv: 'test',
    mongoUri: '',
    stellarNetwork: 'testnet',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: 'GPLATFORM' },
    supportedAssets: ['XLM', 'USDC'],
    stellarServiceUrl: 'http://stellar-service:3002',
    geminiApiKey: '',
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PaymentRecordModel } from '../models/payment-record.model';
import { XLMRateModel } from '../models/xlm-rate.model';
import {
  getPaymentAnalytics,
  getXLMRate,
  storeXLMRate,
  calculateUSDEquivalent,
} from '../services/analytics.service';

// ── MongoDB lifecycle ─────────────────────────────────────────────────────────

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await PaymentRecordModel.deleteMany({});
  await XLMRateModel.deleteMany({});
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLINIC = 'clinic-test-001';
const XLM_RATE = 0.1; // $0.10 per XLM

async function seedRate(date: Date = new Date()) {
  await storeXLMRate(date, XLM_RATE);
}

async function seedPayment(overrides: Partial<{
  clinicId: string;
  amount: string;
  assetCode: string;
  status: 'confirmed' | 'pending' | 'failed';
  createdAt: Date;
}> = {}) {
  const now = new Date();
  return PaymentRecordModel.create({
    intentId: new mongoose.Types.ObjectId().toString(),
    amount: overrides.amount ?? '10.0000000',
    destination: 'GDEST',
    clinicId: overrides.clinicId ?? CLINIC,
    assetCode: overrides.assetCode ?? 'XLM',
    status: overrides.status ?? 'confirmed',
    createdAt: overrides.createdAt ?? now,
  });
}

// ── storeXLMRate / getXLMRate ─────────────────────────────────────────────────

describe('storeXLMRate / getXLMRate', () => {
  it('stores and retrieves a rate for today', async () => {
    const today = new Date();
    await storeXLMRate(today, 0.25);
    const rate = await getXLMRate(today);
    expect(rate).toBe(0.25);
  });

  it('returns the default fallback rate (0.1) when no rate is stored', async () => {
    const rate = await getXLMRate(new Date());
    expect(rate).toBe(0.1);
  });

  it('upserts — calling twice with different rates keeps the latest', async () => {
    const today = new Date();
    await storeXLMRate(today, 0.10);
    await storeXLMRate(today, 0.20);
    const rate = await getXLMRate(today);
    expect(rate).toBe(0.20);
  });
});

// ── calculateUSDEquivalent ────────────────────────────────────────────────────

describe('calculateUSDEquivalent', () => {
  it('converts XLM to USD using stored rate', async () => {
    const today = new Date();
    await storeXLMRate(today, 0.5);
    const usd = await calculateUSDEquivalent('100.0000000', today);
    expect(usd).toBe('50.00');
  });

  it('uses fallback rate when no rate stored', async () => {
    const usd = await calculateUSDEquivalent('100.0000000', new Date());
    expect(usd).toBe('10.00'); // 100 * 0.1
  });
});

// ── getPaymentAnalytics ───────────────────────────────────────────────────────

describe('getPaymentAnalytics', () => {
  const from = new Date('2024-01-01T00:00:00Z');
  const to = new Date('2024-01-31T23:59:59Z');
  const mid = new Date('2024-01-15T12:00:00Z');

  beforeEach(async () => {
    await seedRate(mid);
  });

  it('returns zero values when no payments exist', async () => {
    const result = await getPaymentAnalytics(CLINIC, from, to);
    expect(result.transactionCount.total).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.totalRevenue.xlm).toBe('0.0000000');
    expect(result.totalRevenue.usdc).toBe('0.00');
  });

  it('counts confirmed, pending, and failed transactions correctly', async () => {
    await seedPayment({ status: 'confirmed', createdAt: mid });
    await seedPayment({ status: 'confirmed', createdAt: mid });
    await seedPayment({ status: 'pending', createdAt: mid });
    await seedPayment({ status: 'failed', createdAt: mid });

    const result = await getPaymentAnalytics(CLINIC, from, to);
    expect(result.transactionCount.total).toBe(4);
    expect(result.transactionCount.confirmed).toBe(2);
    expect(result.transactionCount.pending).toBe(1);
    expect(result.transactionCount.failed).toBe(1);
  });

  it('calculates success rate as (confirmed + pending) / total * 100', async () => {
    await seedPayment({ status: 'confirmed', createdAt: mid });
    await seedPayment({ status: 'confirmed', createdAt: mid });
    await seedPayment({ status: 'failed', createdAt: mid });

    const result = await getPaymentAnalytics(CLINIC, from, to);
    // 2 confirmed / 3 total = 66.67%
    expect(result.successRate).toBeCloseTo(66.67, 1);
  });

  it('sums XLM and USDC revenue separately', async () => {
    await seedPayment({ assetCode: 'XLM', amount: '50.0000000', status: 'confirmed', createdAt: mid });
    await seedPayment({ assetCode: 'XLM', amount: '30.0000000', status: 'confirmed', createdAt: mid });
    await seedPayment({ assetCode: 'USDC', amount: '20.00', status: 'confirmed', createdAt: mid });

    const result = await getPaymentAnalytics(CLINIC, from, to);
    expect(parseFloat(result.totalRevenue.xlm)).toBeCloseTo(80, 5);
    expect(parseFloat(result.totalRevenue.usdc)).toBeCloseTo(20, 2);
  });

  it('calculates USD equivalent using XLM rate', async () => {
    await storeXLMRate(mid, 0.5); // $0.50 per XLM
    await seedPayment({ assetCode: 'XLM', amount: '100.0000000', status: 'confirmed', createdAt: mid });

    const result = await getPaymentAnalytics(CLINIC, from, to);
    // 100 XLM * $0.50 = $50
    expect(parseFloat(result.totalRevenue.usdEquivalent)).toBeCloseTo(50, 1);
  });

  it('scopes results to the given clinicId', async () => {
    await seedPayment({ clinicId: CLINIC, status: 'confirmed', createdAt: mid });
    await seedPayment({ clinicId: 'other-clinic', status: 'confirmed', createdAt: mid });

    const result = await getPaymentAnalytics(CLINIC, from, to);
    expect(result.transactionCount.total).toBe(1);
  });

  it('filters payments outside the date range', async () => {
    const before = new Date('2023-12-31T23:59:59Z');
    const after = new Date('2024-02-01T00:00:00Z');
    await seedPayment({ status: 'confirmed', createdAt: before });
    await seedPayment({ status: 'confirmed', createdAt: after });
    await seedPayment({ status: 'confirmed', createdAt: mid }); // in range

    const result = await getPaymentAnalytics(CLINIC, from, to);
    expect(result.transactionCount.total).toBe(1);
  });

  it('groups revenue by day', async () => {
    const day1 = new Date('2024-01-10T10:00:00Z');
    const day2 = new Date('2024-01-11T10:00:00Z');
    await seedPayment({ status: 'confirmed', createdAt: day1 });
    await seedPayment({ status: 'confirmed', createdAt: day1 });
    await seedPayment({ status: 'confirmed', createdAt: day2 });

    const result = await getPaymentAnalytics(CLINIC, from, to, 'day');
    expect(result.revenueByPeriod).toHaveLength(2);
    const d1 = result.revenueByPeriod.find((p) => p.period === '2024-01-10');
    const d2 = result.revenueByPeriod.find((p) => p.period === '2024-01-11');
    expect(d1?.count).toBe(2);
    expect(d2?.count).toBe(1);
  });

  it('groups revenue by month', async () => {
    const jan = new Date('2024-01-15T10:00:00Z');
    const feb = new Date('2024-02-15T10:00:00Z');
    const toFeb = new Date('2024-02-28T23:59:59Z');
    await seedPayment({ status: 'confirmed', createdAt: jan });
    await seedPayment({ status: 'confirmed', createdAt: feb });

    const result = await getPaymentAnalytics(CLINIC, from, toFeb, 'month');
    expect(result.revenueByPeriod).toHaveLength(2);
    const janPeriod = result.revenueByPeriod.find((p) => p.period === '2024-01');
    const febPeriod = result.revenueByPeriod.find((p) => p.period === '2024-02');
    expect(janPeriod?.count).toBe(1);
    expect(febPeriod?.count).toBe(1);
  });

  it('reports currency distribution counts', async () => {
    await seedPayment({ assetCode: 'XLM', status: 'confirmed', createdAt: mid });
    await seedPayment({ assetCode: 'XLM', status: 'confirmed', createdAt: mid });
    await seedPayment({ assetCode: 'USDC', status: 'confirmed', createdAt: mid });

    const result = await getPaymentAnalytics(CLINIC, from, to);
    expect(result.currencyDistribution.xlm.count).toBe(2);
    expect(result.currencyDistribution.usdc.count).toBe(1);
  });

  it('calculates average transaction value for confirmed payments', async () => {
    await seedPayment({ assetCode: 'XLM', amount: '20.0000000', status: 'confirmed', createdAt: mid });
    await seedPayment({ assetCode: 'XLM', amount: '40.0000000', status: 'confirmed', createdAt: mid });
    // failed payment should not affect average
    await seedPayment({ assetCode: 'XLM', amount: '100.0000000', status: 'failed', createdAt: mid });

    const result = await getPaymentAnalytics(CLINIC, from, to);
    // avg XLM = (20 + 40) / 2 = 30
    expect(parseFloat(result.averageTransactionValue.xlm)).toBeCloseTo(30, 5);
  });

  it('returns 100% success rate when all payments are confirmed', async () => {
    await seedPayment({ status: 'confirmed', createdAt: mid });
    await seedPayment({ status: 'confirmed', createdAt: mid });

    const result = await getPaymentAnalytics(CLINIC, from, to);
    expect(result.successRate).toBe(100);
  });

  it('returns 0% success rate when all payments are failed', async () => {
    await seedPayment({ status: 'failed', createdAt: mid });
    await seedPayment({ status: 'failed', createdAt: mid });

    const result = await getPaymentAnalytics(CLINIC, from, to);
    expect(result.successRate).toBe(0);
  });
});
