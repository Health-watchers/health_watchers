import {
  paymentSuccessRate,
  encounterDurationSeconds,
  activeUsersTotal,
  apiKeyRequestsTotal,
  stellarTransactionFeeXlm,
} from './metrics.service.js';

/**
 * Record payment success rate for a clinic
 */
export function recordPaymentSuccessRate(clinicId: string, successRate: number): void {
  paymentSuccessRate.set({ clinicId }, Math.min(1, Math.max(0, successRate)));
}

/**
 * Record encounter duration
 */
export function recordEncounterDuration(clinicId: string, durationSeconds: number): void {
  encounterDurationSeconds.observe({ clinicId }, durationSeconds);
}

/**
 * Update active users count
 */
export function updateActiveUsers(clinicId: string, count: number): void {
  activeUsersTotal.set({ clinicId }, count);
}

/**
 * Record API key request
 */
export function recordApiKeyRequest(apiKeyId: string, endpoint: string): void {
  apiKeyRequestsTotal.inc({ apiKeyId, endpoint });
}

/**
 * Record Stellar transaction fee
 */
export function recordStellarTransactionFee(
  clinicId: string,
  transactionType: string,
  feeXlm: number
): void {
  stellarTransactionFeeXlm.observe({ clinicId, transactionType }, feeXlm);
}

/**
 * Calculate and update payment success rate
 */
export function updatePaymentSuccessRateFromCounts(
  clinicId: string,
  confirmed: number,
  initiated: number
): void {
  const rate = initiated > 0 ? confirmed / initiated : 0;
  recordPaymentSuccessRate(clinicId, rate);
}
