import { BASE_FEE } from '@stellar/stellar-sdk';
import logger from './logger.js';

/**
 * Fee calculation service for Stellar transactions
 * Handles base fees, surge pricing, and subsidies
 */

interface FeeCalculationResult {
  baseFee: number;
  surgePricedFee: number;
  subsidizedFee: number;
  discountPercentage: number;
  totalFee: number;
}

interface SurgeMultiplier {
  threshold: number;
  multiplier: number;
}

// Configuration for surge pricing tiers
const SURGE_MULTIPLIERS: SurgeMultiplier[] = [
  { threshold: 0, multiplier: 1.0 }, // Normal
  { threshold: 50, multiplier: 1.5 }, // 50% increase at 50 ops
  { threshold: 100, multiplier: 2.0 }, // 100% increase at 100 ops
  { threshold: 200, multiplier: 3.0 }, // 200% increase at 200 ops
  { threshold: 500, multiplier: 5.0 }, // 500% increase at 500 ops
];

// Subsidy configurations
interface SubsidyConfig {
  percentage: number;
  maxSubsidyPerTransaction: number;
}

const SUBSIDY_CONFIGS: Record<string, SubsidyConfig> = {
  NONE: { percentage: 0, maxSubsidyPerTransaction: 0 },
  LOW: { percentage: 25, maxSubsidyPerTransaction: 50 }, // 25% subsidy, max 50 stroops
  MEDIUM: { percentage: 50, maxSubsidyPerTransaction: 100 }, // 50% subsidy, max 100 stroops
  HIGH: { percentage: 100, maxSubsidyPerTransaction: 200 }, // 100% subsidy, max 200 stroops
};

/**
 * Convert stroops to XLM
 */
export function stroopsToXlm(stroops: string | number): string {
  const stroopsNum = typeof stroops === 'string' ? parseInt(stroops, 10) : stroops;
  return (stroopsNum / 10_000_000).toFixed(7);
}

/**
 * Convert XLM to stroops
 */
export function xlmToStroops(xlm: string | number): number {
  const xlmNum = typeof xlm === 'string' ? parseFloat(xlm) : xlm;
  return Math.round(xlmNum * 10_000_000);
}

/**
 * Calculate base fee for a transaction
 * @param numberOfOperations Number of operations in the transaction
 * @param baseFeeRate Base fee per operation (in stroops)
 */
export function calculateBaseFee(
  numberOfOperations: number = 1,
  baseFeeRate: number = parseInt(BASE_FEE, 10)
): number {
  logger.debug({ numberOfOperations, baseFeeRate }, 'Calculating base fee');
  return baseFeeRate * numberOfOperations;
}

/**
 * Get surge multiplier based on network backlog/pending operations
 * @param pendingOperations Number of pending operations in the network
 */
export function getSurgeMultiplier(pendingOperations: number): number {
  const multiplier = SURGE_MULTIPLIERS.reduce((current, tier) => {
    if (pendingOperations >= tier.threshold) {
      return tier.multiplier;
    }
    return current;
  }, 1.0);

  logger.debug({ pendingOperations, multiplier }, 'Calculated surge multiplier');
  return multiplier;
}

/**
 * Calculate surge-priced fee based on network conditions
 * @param baseFee Base fee in stroops
 * @param pendingOperations Number of pending operations
 */
export function calculateSurgedFee(baseFee: number, pendingOperations: number = 0): number {
  const multiplier = getSurgeMultiplier(pendingOperations);
  const surgedFee = Math.ceil(baseFee * multiplier);

  logger.debug({ baseFee, multiplier, surgedFee }, 'Calculated surged fee');
  return surgedFee;
}

/**
 * Calculate subsidized fee
 * @param baseFee Fee to subsidize
 * @param subsidyLevel Subsidy level (NONE, LOW, MEDIUM, HIGH)
 */
export function calculateSubsidizedFee(
  baseFee: number,
  subsidyLevel: string = 'NONE'
): { subsidizedFee: number; discountPercentage: number; subsidyAmount: number } {
  const config = SUBSIDY_CONFIGS[subsidyLevel] || SUBSIDY_CONFIGS['NONE'];

  const subsidyAmount = Math.min(
    Math.ceil(baseFee * (config.percentage / 100)),
    config.maxSubsidyPerTransaction
  );

  const subsidizedFee = Math.max(0, baseFee - subsidyAmount);

  logger.debug(
    { baseFee, subsidyLevel, subsidyAmount, subsidizedFee },
    'Calculated subsidized fee'
  );

  return {
    subsidizedFee,
    discountPercentage: config.percentage,
    subsidyAmount,
  };
}

/**
 * Complete fee calculation with all components
 */
export function calculateCompleteFeatures(options: {
  numberOfOperations?: number;
  baseFeeRate?: number;
  pendingOperations?: number;
  subsidyLevel?: string;
}): FeeCalculationResult {
  const {
    numberOfOperations = 1,
    baseFeeRate = parseInt(BASE_FEE, 10),
    pendingOperations = 0,
    subsidyLevel = 'NONE',
  } = options;

  const baseFee = calculateBaseFee(numberOfOperations, baseFeeRate);
  const surgePricedFee = calculateSurgedFee(baseFee, pendingOperations);
  const subsidy = calculateSubsidizedFee(surgePricedFee, subsidyLevel);

  const result: FeeCalculationResult = {
    baseFee,
    surgePricedFee,
    subsidizedFee: subsidy.subsidizedFee,
    discountPercentage: subsidy.discountPercentage,
    totalFee: subsidy.subsidizedFee,
  };

  logger.debug(result, 'Complete fee calculation result');
  return result;
}

/**
 * Format fee for display with XLM conversion
 */
export function formatFeeForDisplay(feeInStroops: number): {
  stroops: string;
  xlm: string;
  display: string;
} {
  const xlm = stroopsToXlm(feeInStroops);
  return {
    stroops: feeInStroops.toString(),
    xlm,
    display: `${xlm} XLM (${feeInStroops} stroops)`,
  };
}

/**
 * Get available subsidy tiers
 */
export function getAvailableSubsidyTiers(): Array<{
  tier: string;
  percentage: number;
  maxSubsidy: number;
}> {
  return Object.entries(SUBSIDY_CONFIGS).map(([tier, config]) => ({
    tier,
    percentage: config.percentage,
    maxSubsidy: config.maxSubsidyPerTransaction,
  }));
}

/**
 * Get surge pricing tiers
 */
export function getSurgePricingTiers(): Array<{
  threshold: number;
  multiplier: number;
  description: string;
}> {
  const descriptions = [
    'Normal network conditions',
    'Moderate congestion',
    'High congestion',
    'Very high congestion',
    'Extreme congestion',
  ];

  return SURGE_MULTIPLIERS.map((tier, index) => ({
    threshold: tier.threshold,
    multiplier: tier.multiplier,
    description: descriptions[index] || 'Unknown',
  }));
}
