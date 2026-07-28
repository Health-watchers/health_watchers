import {
  calculateBaseFee,
  calculateSurgedFee,
  calculateSubsidizedFee,
  calculateCompleteFeatures,
  stroopsToXlm,
  xlmToStroops,
  formatFeeForDisplay,
  getAvailableSubsidyTiers,
  getSurgePricingTiers,
} from '../fee-calculator.js';
import { BASE_FEE } from '@stellar/stellar-sdk';

describe('Fee Calculator', () => {
  const baseFeeRate = parseInt(BASE_FEE, 10);

  describe('stroopsToXlm and xlmToStroops', () => {
    it('should convert stroops to XLM correctly', () => {
      expect(stroopsToXlm(10_000_000)).toBe('1.0000000');
      expect(stroopsToXlm('5000000')).toBe('0.5000000');
    });

    it('should convert XLM to stroops correctly', () => {
      expect(xlmToStroops(1.0)).toBe(10_000_000);
      expect(xlmToStroops('0.5')).toBe(5_000_000);
    });
  });

  describe('calculateBaseFee', () => {
    it('should calculate base fee for single operation', () => {
      const fee = calculateBaseFee(1, baseFeeRate);
      expect(fee).toBe(baseFeeRate);
    });

    it('should calculate base fee for multiple operations', () => {
      const numOps = 5;
      const fee = calculateBaseFee(numOps, baseFeeRate);
      expect(fee).toBe(baseFeeRate * numOps);
    });

    it('should use default base fee rate', () => {
      const fee = calculateBaseFee(1);
      expect(fee).toBe(baseFeeRate);
    });
  });

  describe('calculateSurgedFee', () => {
    it('should not apply surge at low pending operations', () => {
      const baseFee = 1000;
      const surgedFee = calculateSurgedFee(baseFee, 10);
      expect(surgedFee).toBe(baseFee);
    });

    it('should apply 1.5x surge at 50+ pending operations', () => {
      const baseFee = 1000;
      const surgedFee = calculateSurgedFee(baseFee, 50);
      expect(surgedFee).toBe(Math.ceil(baseFee * 1.5));
    });

    it('should apply 2x surge at 100+ pending operations', () => {
      const baseFee = 1000;
      const surgedFee = calculateSurgedFee(baseFee, 100);
      expect(surgedFee).toBe(baseFee * 2);
    });

    it('should apply 5x surge at 500+ pending operations', () => {
      const baseFee = 1000;
      const surgedFee = calculateSurgedFee(baseFee, 500);
      expect(surgedFee).toBe(baseFee * 5);
    });
  });

  describe('calculateSubsidizedFee', () => {
    it('should not apply subsidy for NONE level', () => {
      const baseFee = 1000;
      const result = calculateSubsidizedFee(baseFee, 'NONE');
      expect(result.subsidizedFee).toBe(baseFee);
      expect(result.discountPercentage).toBe(0);
    });

    it('should apply 25% subsidy for LOW level', () => {
      const baseFee = 1000;
      const result = calculateSubsidizedFee(baseFee, 'LOW');
      expect(result.discountPercentage).toBe(25);
      expect(result.subsidyAmount).toBeLessThanOrEqual(250); // Max subsidy: 50 stroops
    });

    it('should apply 50% subsidy for MEDIUM level', () => {
      const baseFee = 1000;
      const result = calculateSubsidizedFee(baseFee, 'MEDIUM');
      expect(result.discountPercentage).toBe(50);
    });

    it('should apply 100% subsidy for HIGH level', () => {
      const baseFee = 200;
      const result = calculateSubsidizedFee(baseFee, 'HIGH');
      expect(result.subsidizedFee).toBe(0);
    });

    it('should cap subsidy at max amount', () => {
      const baseFee = 10000;
      const result = calculateSubsidizedFee(baseFee, 'LOW');
      expect(result.subsidyAmount).toBeLessThanOrEqual(50); // MAX_SUBSIDY_LOW
    });
  });

  describe('calculateCompleteFeatures', () => {
    it('should calculate complete fees with default options', () => {
      const result = calculateCompleteFeatures({});
      expect(result.baseFee).toBeGreaterThan(0);
      expect(result.surgePricedFee).toBeGreaterThanOrEqual(result.baseFee);
      expect(result.subsidizedFee).toBeLessThanOrEqual(result.surgePricedFee);
      expect(result.totalFee).toBe(result.subsidizedFee);
    });

    it('should calculate complete fees with custom options', () => {
      const result = calculateCompleteFeatures({
        numberOfOperations: 3,
        pendingOperations: 100,
        subsidyLevel: 'MEDIUM',
      });
      expect(result.baseFee).toBe(baseFeeRate * 3);
      expect(result.surgePricedFee).toBe(Math.ceil(result.baseFee * 2)); // 2x multiplier at 100 ops
      expect(result.discountPercentage).toBe(50);
    });

    it('should apply subsidy correctly in complete calculation', () => {
      const result = calculateCompleteFeatures({
        numberOfOperations: 1,
        pendingOperations: 0,
        subsidyLevel: 'HIGH',
      });
      expect(result.discountPercentage).toBe(100);
    });
  });

  describe('formatFeeForDisplay', () => {
    it('should format fee with stroops and XLM', () => {
      const formatted = formatFeeForDisplay(10_000_000);
      expect(formatted.stroops).toBe('10000000');
      expect(formatted.xlm).toBe('1.0000000');
      expect(formatted.display).toContain('XLM');
      expect(formatted.display).toContain('stroops');
    });

    it('should format small fees correctly', () => {
      const formatted = formatFeeForDisplay(100);
      expect(formatted.stroops).toBe('100');
      expect(formatted.xlm).toBe('0.0000100');
    });
  });

  describe('getAvailableSubsidyTiers', () => {
    it('should return all subsidy tiers', () => {
      const tiers = getAvailableSubsidyTiers();
      expect(tiers.length).toBeGreaterThan(0);
      expect(tiers.some((t) => t.tier === 'NONE')).toBe(true);
      expect(tiers.some((t) => t.tier === 'LOW')).toBe(true);
      expect(tiers.some((t) => t.tier === 'MEDIUM')).toBe(true);
      expect(tiers.some((t) => t.tier === 'HIGH')).toBe(true);
    });

    it('should have correct percentages for each tier', () => {
      const tiers = getAvailableSubsidyTiers();
      const tierMap = Object.fromEntries(tiers.map((t) => [t.tier, t.percentage]));
      expect(tierMap.NONE).toBe(0);
      expect(tierMap.LOW).toBe(25);
      expect(tierMap.MEDIUM).toBe(50);
      expect(tierMap.HIGH).toBe(100);
    });
  });

  describe('getSurgePricingTiers', () => {
    it('should return surge pricing tiers', () => {
      const tiers = getSurgePricingTiers();
      expect(tiers.length).toBeGreaterThan(0);
      expect(tiers[0].threshold).toBe(0);
      expect(tiers[0].multiplier).toBe(1.0);
    });

    it('should have correct multipliers', () => {
      const tiers = getSurgePricingTiers();
      const multipliers = tiers.map((t) => t.multiplier);
      expect(multipliers).toContain(1.0);
      expect(multipliers).toContain(1.5);
      expect(multipliers).toContain(2.0);
      expect(multipliers).toContain(3.0);
      expect(multipliers).toContain(5.0);
    });

    it('should be in ascending order of threshold', () => {
      const tiers = getSurgePricingTiers();
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].threshold).toBeGreaterThan(tiers[i - 1].threshold);
      }
    });
  });
});
