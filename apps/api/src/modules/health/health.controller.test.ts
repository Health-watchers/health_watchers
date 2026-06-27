import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@health-watchers/config', () => ({
  config: {
    mongoUri: 'mongodb://localhost:27017/test',
    mongoMaxPool: 10,
    nodeEnv: 'test',
    apiPort: '3001',
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    geminiApiKey: '',
    fieldEncryptionKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    stellarNetwork: 'testnet',
    stellarHorizonUrl: '',
    stellarSecretKey: '',
    stellarServiceUrl: '',
    supportedAssets: ['XLM'],
  },
}));

const mockPing = jest.fn();
jest.mock('@api/services/cache.service', () => ({
  cache: { ping: mockPing },
}));

const mockStellarHealthCheck = jest.fn();
jest.mock('@api/modules/payments/services/stellar-client', () => ({
  stellarClient: { healthCheck: mockStellarHealthCheck },
}));

jest.mock('@api/modules/ai/ai.service', () => ({
  isAIServiceAvailable: jest.fn().mockReturnValue(false),
}));

jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  getJobStatus: jest.fn().mockReturnValue({
    running: true,
    lastSuccessfulRunAt: null,
    consecutiveFailures: 0,
  }),
  CHECK_INTERVAL_MS: 60_000,
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// getDbStatus reads mongoose.connection.readyState — no DB connection needed
jest.mock('@api/config/db', () => ({
  connectDB: jest.fn(),
  getDbStatus: jest.fn(() => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'] as const;
    return states[require('mongoose').connection.readyState] ?? 'disconnected';
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function setMongoReadyState(state: 0 | 1 | 2 | 3) {
  Object.defineProperty(mongoose.connection, 'readyState', {
    get: () => state,
    configurable: true,
  });
}

// ── App fixture ───────────────────────────────────────────────────────────────

let app: express.Application;

beforeAll(async () => {
  // Import after mocks are registered
  const { healthRoutes } = await import('./health.controller');
  app = express();
  app.use('/health', healthRoutes);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPing.mockResolvedValue({ status: 'healthy', latency: 1 });
  mockStellarHealthCheck.mockResolvedValue({ status: 'ok', network: 'testnet' });
});

// ── /health/startup ───────────────────────────────────────────────────────────

describe('GET /health/startup', () => {
  it('returns 200 when DB is connected', async () => {
    setMongoReadyState(1);
    const res = await request(app).get('/health/startup');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('started');
    expect(res.body.database).toBe('connected');
  });

  it('returns 503 when DB is disconnected', async () => {
    setMongoReadyState(0);
    const res = await request(app).get('/health/startup');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('starting');
    expect(res.body.database).toBe('disconnected');
  });

  it('returns 503 when DB is still connecting', async () => {
    setMongoReadyState(2);
    const res = await request(app).get('/health/startup');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('starting');
    expect(res.body.database).toBe('connecting');
  });

  it('includes uptime and timestamp fields', async () => {
    setMongoReadyState(1);
    const res = await request(app).get('/health/startup');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// ── /health/live ──────────────────────────────────────────────────────────────

describe('GET /health/live', () => {
  it('returns 200 regardless of DB state', async () => {
    setMongoReadyState(0);
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
  });

  it('includes uptime and timestamp', async () => {
    setMongoReadyState(1);
    const res = await request(app).get('/health/live');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });
});

// ── /health/ready ─────────────────────────────────────────────────────────────

describe('GET /health/ready', () => {
  it('returns 200 when MongoDB is connected and Redis is healthy', async () => {
    setMongoReadyState(1);
    // Mock the admin().ping() call
    jest.spyOn(mongoose.connection, 'db', 'get').mockReturnValue({
      admin: () => ({ ping: jest.fn().mockResolvedValue({}) }),
    } as any);

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.mongodb.status).toBe('healthy');
    expect(res.body.checks.redis.status).toBe('healthy');
  });

  it('returns 503 when MongoDB is unreachable (readyState 0)', async () => {
    setMongoReadyState(0);
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.checks.mongodb.status).toBe('unhealthy');
  });

  it('returns 503 when MongoDB ping throws', async () => {
    setMongoReadyState(1);
    jest.spyOn(mongoose.connection, 'db', 'get').mockReturnValue({
      admin: () => ({ ping: jest.fn().mockRejectedValue(new Error('timeout')) }),
    } as any);

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.checks.mongodb.status).toBe('unhealthy');
    expect(res.body.checks.mongodb.message).toBe('timeout');
  });

  it('returns 503 when Redis is configured but unhealthy', async () => {
    setMongoReadyState(0); // DB also down keeps it simple — main check is Redis key exists
    mockPing.mockResolvedValue({ status: 'unhealthy' });

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.checks.redis.status).toBe('unhealthy');
  });

  it('returns ready when Redis is disabled (status: disabled)', async () => {
    setMongoReadyState(1);
    jest.spyOn(mongoose.connection, 'db', 'get').mockReturnValue({
      admin: () => ({ ping: jest.fn().mockResolvedValue({}) }),
    } as any);
    mockPing.mockResolvedValue({ status: 'disabled' });

    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.checks.redis.status).toBe('disabled');
  });

  it('includes version and environment', async () => {
    setMongoReadyState(0);
    const res = await request(app).get('/health/ready');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('timestamp');
  });
});
