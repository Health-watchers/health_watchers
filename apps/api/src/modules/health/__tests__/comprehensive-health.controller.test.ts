import request from 'supertest';
import express from 'express';
import { comprehensiveHealthRoutes } from '../comprehensive-health.controller';

jest.mock('../health-check.service', () => ({
  runComprehensiveHealthCheck: jest.fn().mockResolvedValue({
    status: 'healthy',
    version: '1.0.0',
    environment: 'test',
    uptime: 100,
    timestamp: '2025-01-15T10:00:00.000Z',
    services: {
      mongodb: { status: 'healthy', latencyMs: 5 },
      redis: { status: 'healthy', latencyMs: 2 },
    },
    system: {
      hostname: 'test-host',
      platform: 'linux',
      nodeVersion: 'v20.0.0',
      memoryUsage: { rss: 50000000, heapUsed: 30000000, heapTotal: 50000000, external: 5000000 },
      memoryPercentage: 60,
      cpuUsage: { user: 100000, system: 50000 },
      loadAverage: [1.0, 1.0, 1.0],
      uptime: 100,
    },
    summary: { total: 2, healthy: 2, degraded: 0, unhealthy: 0 },
  }),
  getHealthHistory: jest.fn().mockReturnValue([
    { timestamp: '2025-01-15T10:00:00.000Z', status: 'healthy', services: {} },
  ]),
  getServiceDependencyMap: jest.fn().mockReturnValue({
    api: ['mongodb', 'redis'],
    payments: ['mongodb', 'redis', 'stellarHorizon'],
  }),
}));

describe('Comprehensive Health Controller', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use('/health', comprehensiveHealthRoutes);
  });

  describe('GET /health/comprehensive', () => {
    it('should return 200 with comprehensive health data', async () => {
      const res = await request(app).get('/health/comprehensive');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('services');
      expect(res.body).toHaveProperty('system');
      expect(res.body).toHaveProperty('summary');
    });

    it('should include all required fields', async () => {
      const res = await request(app).get('/health/comprehensive');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('environment');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /health/history', () => {
    it('should return health history', async () => {
      const res = await request(app).get('/health/history');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /health/dependencies', () => {
    it('should return service dependencies', async () => {
      const res = await request(app).get('/health/dependencies');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('dependencies');
      expect(res.body.dependencies).toHaveProperty('api');
    });
  });

  describe('GET /health/system', () => {
    it('should return system metrics', async () => {
      const res = await request(app).get('/health/system');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('system');
      expect(res.body.system).toHaveProperty('hostname');
      expect(res.body.system).toHaveProperty('memory');
      expect(res.body.system).toHaveProperty('cpu');
    });
  });

  describe('GET /health/quick', () => {
    it('should return quick status', async () => {
      const res = await request(app).get('/health/quick');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('service', 'health-watchers-api');
      expect(res.body).toHaveProperty('uptime');
    });
  });
});
