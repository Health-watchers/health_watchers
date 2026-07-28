import {
  runComprehensiveHealthCheck,
  getHealthHistory,
  getServiceDependencyMap,
} from '../health-check.service';

jest.mock('mongoose', () => ({
  default: {
    connection: {
      readyState: 1,
      db: {
        admin: () => ({ ping: jest.fn().mockResolvedValue(true) }),
      },
    },
  },
}));

jest.mock('../../../services/cache.service', () => ({
  cache: {
    ping: jest.fn().mockResolvedValue({ status: 'healthy', message: 'PONG' }),
  },
}));

jest.mock('../../payments/services/stellar-client', () => ({
  stellarClient: {
    healthCheck: jest.fn().mockResolvedValue({ status: 'ok', network: 'test' }),
  },
}));

jest.mock('../../ai/ai.service', () => ({
  isAIServiceAvailable: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../config/db', () => ({
  getDbStatus: jest.fn().mockReturnValue('connected'),
  getPoolMetrics: jest.fn().mockReturnValue({
    totalConnections: 5,
    maxPoolSize: 10,
    waitQueueSize: 0,
  }),
}));

jest.mock('../../../middlewares/error.middleware', () => ({
  getErrorMetrics: jest.fn().mockReturnValue({
    total: 0,
    bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
    byCategory: {},
  }),
}));

jest.mock('../../payments/services/payment-expiration-job', () => ({
  getJobStatus: jest.fn().mockReturnValue({
    running: true,
    lastSuccessfulRunAt: new Date(),
    consecutiveFailures: 0,
  }),
  CHECK_INTERVAL_MS: 30000,
}));

jest.mock('../../../utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Health Check Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runComprehensiveHealthCheck', () => {
    it('should return a comprehensive health result', async () => {
      const result = await runComprehensiveHealthCheck();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('environment');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('services');
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('summary');
    });

    it('should include all service checks', async () => {
      const result = await runComprehensiveHealthCheck();

      expect(result.services).toHaveProperty('mongodb');
      expect(result.services).toHaveProperty('redis');
      expect(result.services).toHaveProperty('stellarHorizon');
      expect(result.services).toHaveProperty('geminiApi');
      expect(result.services).toHaveProperty('memory');
      expect(result.services).toHaveProperty('backgroundJobs');
      expect(result.services).toHaveProperty('errorRate');
    });

    it('should have valid service statuses', async () => {
      const result = await runComprehensiveHealthCheck();
      const validStatuses = ['healthy', 'degraded', 'unhealthy', 'unknown'];

      for (const service of Object.values(result.services)) {
        expect(validStatuses).toContain(service.status);
      }
    });

    it('should have correct summary counts', async () => {
      const result = await runComprehensiveHealthCheck();

      expect(result.summary.total).toBe(Object.keys(result.services).length);
      expect(result.summary.healthy + result.summary.degraded + result.summary.unhealthy)
        .toBeLessThanOrEqual(result.summary.total);
    });

    it('should include system information', async () => {
      const result = await runComprehensiveHealthCheck();

      expect(result.system).toHaveProperty('hostname');
      expect(result.system).toHaveProperty('platform');
      expect(result.system).toHaveProperty('nodeVersion');
      expect(result.system).toHaveProperty('memoryUsage');
      expect(result.system).toHaveProperty('cpuUsage');
      expect(result.system).toHaveProperty('loadAverage');
    });

    it('should have a valid overall status', async () => {
      const result = await runComprehensiveHealthCheck();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
    });
  });

  describe('getHealthHistory', () => {
    it('should return health check history', async () => {
      await runComprehensiveHealthCheck();
      const history = getHealthHistory();

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('status');
      expect(history[0]).toHaveProperty('services');
    });

    it('should return a copy, not the original array', () => {
      const history1 = getHealthHistory();
      const history2 = getHealthHistory();
      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });
  });

  describe('getServiceDependencyMap', () => {
    it('should return service dependencies', () => {
      const deps = getServiceDependencyMap();

      expect(deps).toHaveProperty('api');
      expect(deps).toHaveProperty('payments');
      expect(deps).toHaveProperty('ai');
      expect(deps).toHaveProperty('appointments');
      expect(deps).toHaveProperty('webhooks');
      expect(deps).toHaveProperty('email');

      expect(Array.isArray(deps.api)).toBe(true);
      expect(deps.api).toContain('mongodb');
    });
  });
});
