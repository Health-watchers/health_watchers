import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  recordPaymentSuccessRate,
  recordEncounterDuration,
  updateActiveUsers,
  recordApiKeyRequest,
  recordStellarTransactionFee,
  updatePaymentSuccessRateFromCounts,
} from '@api/services/business-metrics.service';
import {
  paymentSuccessRate,
  encounterDurationSeconds,
  activeUsersTotal,
  apiKeyRequestsTotal,
  stellarTransactionFeeXlm,
} from '@api/services/metrics.service';

describe('Business Metrics Service', () => {
  const clinicId = '507f1f77bcf86cd799439011';
  const apiKeyId = 'key_test123';
  const endpoint = '/api/v1/patients';

  beforeEach(() => {
    // Reset metrics
    paymentSuccessRate.reset();
    encounterDurationSeconds.reset();
    activeUsersTotal.reset();
    apiKeyRequestsTotal.reset();
    stellarTransactionFeeXlm.reset();
  });

  describe('recordPaymentSuccessRate', () => {
    it('should record payment success rate', () => {
      recordPaymentSuccessRate(clinicId, 0.95);
      const metrics = paymentSuccessRate.get();
      expect(metrics.values).toContainEqual(
        expect.objectContaining({
          value: 0.95,
          labels: { clinicId },
        })
      );
    });

    it('should clamp rate between 0 and 1', () => {
      recordPaymentSuccessRate(clinicId, 1.5);
      const metrics = paymentSuccessRate.get();
      expect(metrics.values[0].value).toBe(1);

      recordPaymentSuccessRate(clinicId, -0.5);
      const metricsAfter = paymentSuccessRate.get();
      expect(metricsAfter.values[0].value).toBe(0);
    });
  });

  describe('recordEncounterDuration', () => {
    it('should record encounter duration', () => {
      recordEncounterDuration(clinicId, 1800);
      const metrics = encounterDurationSeconds.get();
      expect(metrics.values.length).toBeGreaterThan(0);
    });
  });

  describe('updateActiveUsers', () => {
    it('should update active users count', () => {
      updateActiveUsers(clinicId, 42);
      const metrics = activeUsersTotal.get();
      expect(metrics.values).toContainEqual(
        expect.objectContaining({
          value: 42,
          labels: { clinicId },
        })
      );
    });
  });

  describe('recordApiKeyRequest', () => {
    it('should record API key request', () => {
      recordApiKeyRequest(apiKeyId, endpoint);
      recordApiKeyRequest(apiKeyId, endpoint);
      const metrics = apiKeyRequestsTotal.get();
      expect(metrics.values).toContainEqual(
        expect.objectContaining({
          value: 2,
          labels: { apiKeyId, endpoint },
        })
      );
    });
  });

  describe('recordStellarTransactionFee', () => {
    it('should record Stellar transaction fee', () => {
      recordStellarTransactionFee(clinicId, 'payment', 0.001);
      const metrics = stellarTransactionFeeXlm.get();
      expect(metrics.values.length).toBeGreaterThan(0);
    });
  });

  describe('updatePaymentSuccessRateFromCounts', () => {
    it('should calculate success rate from counts', () => {
      updatePaymentSuccessRateFromCounts(clinicId, 95, 100);
      const metrics = paymentSuccessRate.get();
      expect(metrics.values).toContainEqual(
        expect.objectContaining({
          value: 0.95,
          labels: { clinicId },
        })
      );
    });

    it('should handle zero initiated payments', () => {
      updatePaymentSuccessRateFromCounts(clinicId, 0, 0);
      const metrics = paymentSuccessRate.get();
      expect(metrics.values).toContainEqual(
        expect.objectContaining({
          value: 0,
          labels: { clinicId },
        })
      );
    });
  });
});
