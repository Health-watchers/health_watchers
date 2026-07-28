import axios from 'axios';

// Mock config before importing the service so secrets-validator doesn't run
jest.mock('@health-watchers/config', () => ({
  config: { stellarServiceUrl: 'http://stellar-service:3002' },
}));
jest.mock('axios');

import { FeeOptimizerService } from '../services/fee-optimizer.service';

const mockedGet = jest.fn();
(axios as any).get = mockedGet;

describe('FeeOptimizerService', () => {
  let service: FeeOptimizerService;

  beforeEach(() => {
    service = new FeeOptimizerService();
    jest.clearAllMocks();
  });

  // ── selectStrategy ──────────────────────────────────────────────────────────

  describe('selectStrategy', () => {
    it('returns fast for high-value payments (>=1000 XLM)', () => {
      expect(service.selectStrategy(1000, { congestionLevel: 'low', currentHour: 14 })).toBe(
        'fast'
      );
      expect(service.selectStrategy(1500, { congestionLevel: 'low', currentHour: 14 })).toBe(
        'fast'
      );
    });

    it('returns fast when network congestion is high', () => {
      expect(service.selectStrategy(10, { congestionLevel: 'high', currentHour: 14 })).toBe('fast');
    });

    it('returns fast when congestion is high even during off-peak', () => {
      expect(service.selectStrategy(50, { congestionLevel: 'high', currentHour: 2 })).toBe('fast');
    });

    it('returns slow during off-peak hours (0–5 UTC) with low congestion', () => {
      for (const hour of [0, 1, 3, 5]) {
        expect(service.selectStrategy(50, { congestionLevel: 'low', currentHour: hour })).toBe(
          'slow'
        );
      }
    });

    it('returns standard during peak hours with low congestion', () => {
      expect(service.selectStrategy(50, { congestionLevel: 'low', currentHour: 6 })).toBe(
        'standard'
      );
      expect(service.selectStrategy(50, { congestionLevel: 'low', currentHour: 14 })).toBe(
        'standard'
      );
    });

    it('returns standard for medium congestion at any hour', () => {
      expect(service.selectStrategy(50, { congestionLevel: 'medium', currentHour: 3 })).toBe(
        'standard'
      );
      expect(service.selectStrategy(50, { congestionLevel: 'medium', currentHour: 14 })).toBe(
        'standard'
      );
    });
  });

  // ── getCurrentConditions ────────────────────────────────────────────────────

  describe('getCurrentConditions', () => {
    it('maps low congestion from stellar-service', async () => {
      mockedGet.mockResolvedValue({ data: { backlog: { congestionLevel: 'low' } } });
      const conditions = await service.getCurrentConditions();
      expect(conditions.congestionLevel).toBe('low');
      expect(conditions.currentHour).toBeGreaterThanOrEqual(0);
    });

    it('maps moderate congestion to medium', async () => {
      mockedGet.mockResolvedValue({ data: { backlog: { congestionLevel: 'moderate' } } });
      const conditions = await service.getCurrentConditions();
      expect(conditions.congestionLevel).toBe('medium');
    });

    it('maps high congestion to high', async () => {
      mockedGet.mockResolvedValue({ data: { backlog: { congestionLevel: 'high' } } });
      expect((await service.getCurrentConditions()).congestionLevel).toBe('high');
    });

    it('maps critical congestion to high', async () => {
      mockedGet.mockResolvedValue({ data: { backlog: { congestionLevel: 'critical' } } });
      expect((await service.getCurrentConditions()).congestionLevel).toBe('high');
    });

    it('defaults to low when stellar-service is unreachable', async () => {
      mockedGet.mockRejectedValue(new Error('ECONNREFUSED'));
      const conditions = await service.getCurrentConditions();
      expect(conditions.congestionLevel).toBe('low');
    });
  });

  // ── selectStrategyAuto ──────────────────────────────────────────────────────

  describe('selectStrategyAuto', () => {
    it('respects explicit clinic preference "slow"', async () => {
      expect(await service.selectStrategyAuto(500, 'slow')).toBe('slow');
    });

    it('respects explicit clinic preference "fast"', async () => {
      expect(await service.selectStrategyAuto(10, 'fast')).toBe('fast');
    });

    it('respects explicit clinic preference "standard"', async () => {
      expect(await service.selectStrategyAuto(10, 'standard')).toBe('standard');
    });

    it('runs auto-selection when preference is "auto" — high congestion → fast', async () => {
      mockedGet.mockResolvedValue({ data: { backlog: { congestionLevel: 'high' } } });
      expect(await service.selectStrategyAuto(10, 'auto')).toBe('fast');
    });

    it('runs auto-selection when no preference provided — low congestion, off-peak → slow', async () => {
      mockedGet.mockResolvedValue({ data: { backlog: { congestionLevel: 'low' } } });
      jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(3);
      expect(await service.selectStrategyAuto(50)).toBe('slow');
      jest.restoreAllMocks();
    });

    it('selects fast for high-value amount regardless of time', async () => {
      mockedGet.mockResolvedValue({ data: { backlog: { congestionLevel: 'low' } } });
      jest.spyOn(Date.prototype, 'getUTCHours').mockReturnValue(3);
      expect(await service.selectStrategyAuto(1500)).toBe('fast');
      jest.restoreAllMocks();
    });
  });
});
