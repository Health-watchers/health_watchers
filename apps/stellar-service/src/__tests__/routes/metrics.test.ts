import { jest } from '@jest/globals';
import metricsRouter from '../../routes/metrics.js';

jest.mock('prom-client', () => ({
  __esModule: true,
  default: { Registry: jest.fn() },
  Registry: jest.fn(),
}));

jest.mock('../../logger.js', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('Metrics Router', () => {
  it('should export a router with /metrics endpoint', () => {
    expect(metricsRouter).toBeDefined();
  });
});
