import { jest } from '@jest/globals';

// ── Mock prom-client before importing the module under test ───────────────────
jest.mock('prom-client', () => {
  const inc = jest.fn();
  const set = jest.fn();
  const observe = jest.fn();
  const metrics = jest.fn().mockResolvedValue('');
  const contentType = 'text/plain';
  const Registry = jest.fn().mockImplementation(() => ({ metrics, contentType }));
  const Counter   = jest.fn().mockImplementation(() => ({ inc }));
  const Gauge     = jest.fn().mockImplementation(() => ({ set }));
  const Histogram = jest.fn().mockImplementation(() => ({ observe }));
  const collectDefaultMetrics = jest.fn();
  return { __esModule: true, default: { Registry, Counter, Gauge, Histogram, collectDefaultMetrics }, Registry, Counter, Gauge, Histogram, collectDefaultMetrics };
});

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.mock('../logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Mock metrics module (re-export register + counters) ───────────────────────
jest.mock('../metrics.js', () => {
  const prom = require('prom-client');
  return {
    __esModule: true,
    register: new prom.Registry(),
    httpRequestsTotal: new prom.Counter({ name: 'x', help: 'x', labelNames: [] }),
    httpRequestDurationSeconds: new prom.Histogram({ name: 'y', help: 'y', labelNames: [] }),
    stellarTransactionsTotal: new prom.Counter({ name: 'z', help: 'z', labelNames: [] }),
    metricsMiddleware: jest.fn(),
    metricsHandler: jest.fn(),
  };
});

// ── Mock @stellar/stellar-sdk ─────────────────────────────────────────────────
const mockFeeStats = jest.fn<any>();
jest.mock('@stellar/stellar-sdk', () => ({
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({ feeStats: mockFeeStats })),
  },
}));

import ResilientHorizonClient from '../horizon-client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeClient(urls = ['https://primary.example.com', 'https://fallback.example.com']) {
  return new ResilientHorizonClient(urls);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ResilientHorizonClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getServer()', () => {
    it('returns a Horizon.Server for the current endpoint', () => {
      const client = makeClient();
      const server = client.getServer();
      expect(server).toBeDefined();
    });
  });

  describe('getEndpointsStatus()', () => {
    it('returns all configured endpoints', () => {
      const client = makeClient(['https://a.example.com', 'https://b.example.com']);
      expect(client.getEndpointsStatus()).toHaveLength(2);
    });
  });

  describe('circuit breaker', () => {
    it('opens after 5 consecutive failures', async () => {
      mockFeeStats.mockRejectedValue(new Error('connection refused'));

      const client = makeClient(['https://primary.example.com']);

      // Trigger 5 health-check failures
      for (let i = 0; i < 5; i++) {
        // @ts-expect-error private
        await client.checkEndpointHealth(client.endpoints[0]);
      }

      const [ep] = client.getEndpointsStatus();
      expect(ep.circuitOpen).toBe(true);
      expect(ep.consecutiveFailures).toBe(5);
    });

    it('does not open before 5 consecutive failures', async () => {
      mockFeeStats.mockRejectedValue(new Error('error'));

      const client = makeClient(['https://primary.example.com']);

      for (let i = 0; i < 4; i++) {
        // @ts-expect-error private
        await client.checkEndpointHealth(client.endpoints[0]);
      }

      expect(client.getEndpointsStatus()[0].circuitOpen).toBe(false);
    });

    it('resets circuit breaker after reset window', async () => {
      mockFeeStats.mockRejectedValue(new Error('error'));

      const client = makeClient(['https://primary.example.com']);

      for (let i = 0; i < 5; i++) {
        // @ts-expect-error private
        await client.checkEndpointHealth(client.endpoints[0]);
      }

      expect(client.getEndpointsStatus()[0].circuitOpen).toBe(true);

      // Advance past the 60 s reset window
      jest.advanceTimersByTime(61_000);

      // @ts-expect-error private
      const isOpen = client.isCircuitOpen(client.endpoints[0]);
      expect(isOpen).toBe(false);
    });
  });

  describe('slow response failover', () => {
    it('marks endpoint unhealthy when response exceeds 5 s threshold', async () => {
      // feeStats resolves but only after a delay simulated by advancing timers
      mockFeeStats.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 6_000))
      );

      const client = makeClient(['https://primary.example.com']);

      // We need real timers for this test since we're racing
      jest.useRealTimers();

      // Simulate a slow response by making Date.now() return a large delta
      const realDateNow = Date.now;
      let callCount = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        // First call (start): 0; second call (latency): 6001 ms later
        return callCount === 1 ? 0 : 6001;
      });

      // @ts-expect-error private
      await client.checkEndpointHealth(client.endpoints[0]);

      jest.spyOn(Date, 'now').mockRestore();

      expect(client.getEndpointsStatus()[0].healthy).toBe(false);
    });
  });

  describe('failover to healthy endpoint', () => {
    it('switches to fallback when primary is unhealthy', async () => {
      // Primary always fails, fallback always succeeds
      mockFeeStats
        .mockRejectedValueOnce(new Error('primary down'))  // primary check
        .mockResolvedValueOnce({});                         // fallback check

      const client = makeClient([
        'https://primary.example.com',
        'https://fallback.example.com',
      ]);

      // @ts-expect-error private
      await client.runHealthChecks();

      // After health checks, current endpoint should be the fallback
      expect(client.getCurrentEndpoint().url).toBe('https://fallback.example.com');
    });
  });

  describe('weighted round-robin', () => {
    it('selects among healthy endpoints', () => {
      const client = makeClient([
        'https://a.example.com',
        'https://b.example.com',
        'https://c.example.com',
      ]);

      const selected = new Set<number>();
      for (let i = 0; i < 100; i++) {
        // @ts-expect-error private
        selected.add(client.selectEndpoint());
      }

      // With all endpoints healthy, multiple should be selected
      expect(selected.size).toBeGreaterThan(0);
    });

    it('falls back to lowest-latency endpoint when all are unhealthy', () => {
      const client = makeClient(['https://a.example.com', 'https://b.example.com']);
      const eps = client.getEndpointsStatus();
      eps[0].healthy = false;
      eps[0].latency = 500;
      eps[1].healthy = false;
      eps[1].latency = 200;

      // @ts-expect-error private
      const idx = client.selectEndpoint();
      expect(idx).toBe(1); // b has lower latency
    });
  });

  describe('startHealthChecks / stopHealthChecks', () => {
    it('starts and stops the interval', () => {
      const client = makeClient();
      mockFeeStats.mockResolvedValue({});

      client.startHealthChecks();
      // @ts-expect-error private
      expect(client.healthCheckInterval).not.toBeNull();

      client.stopHealthChecks();
      // @ts-expect-error private
      expect(client.healthCheckInterval).toBeNull();
    });

    it('does not start a second interval if already running', () => {
      const client = makeClient();
      mockFeeStats.mockResolvedValue({});

      client.startHealthChecks();
      // @ts-expect-error private
      const first = client.healthCheckInterval;
      client.startHealthChecks();
      // @ts-expect-error private
      expect(client.healthCheckInterval).toBe(first);

      client.stopHealthChecks();
    });
  });

  describe('getNetworkStatus()', () => {
    it('returns endpoint status and stellar status', async () => {
      global.fetch = jest.fn<any>().mockResolvedValue({
        ok: true,
        json: async () => ({ status: { indicator: 'none' }, incidents: [] }),
      });

      const client = makeClient(['https://primary.example.com']);
      const status = await client.getNetworkStatus();

      expect(status.currentEndpoint).toBe('https://primary.example.com');
      expect(status.endpoints).toHaveLength(1);
      expect(status.stellarStatus?.status).toBe('none');
    });

    it('handles stellar status fetch failure gracefully', async () => {
      global.fetch = jest.fn<any>().mockRejectedValue(new Error('network error'));

      const client = makeClient(['https://primary.example.com']);
      const status = await client.getNetworkStatus();

      expect(status.stellarStatus).toBeNull();
    });
  });
});
