/**
 * mainnet-safety.ts
 *
 * Issue #996 — [Stellar] Mainnet Safety Checks
 *
 * Provides safety guardrails for Stellar mainnet operations:
 *   - Network detection (mainnet vs testnet, Horizon URL consistency)
 *   - Explicit confirmation requirement for mainnet transactions
 *   - Amount validation with configurable limits and warning thresholds
 *   - Rich user-facing warning / error messages
 */

import { stellarConfig } from './config.js';
import logger from './logger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SafetyCheckResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
  network: 'mainnet' | 'testnet';
  requiresConfirmation: boolean;
}

export interface SafetyCheckConfig {
  /** When true, the caller must explicitly confirm before the check passes on mainnet */
  requireConfirmation?: boolean;
  /** Hard upper limit for any single transaction (XLM) */
  maxAmountXlm?: number;
  /** Threshold above which a warning is issued on mainnet (XLM) */
  warningThresholdXlm?: number;
}

export interface ConfirmationState {
  confirmed: boolean;
  confirmedAt?: Date;
  confirmedBy?: string;
  reason?: string;
}

// ── MainnetSafetyManager ───────────────────────────────────────────────────

export class MainnetSafetyManager {
  /** Tracks pending confirmation tokens (paymentId → state) */
  private readonly confirmations: Map<string, ConfirmationState> = new Map();

  private readonly defaultConfig: Required<SafetyCheckConfig> = {
    requireConfirmation: true,
    maxAmountXlm: stellarConfig.maxTransactionXlm,
    warningThresholdXlm: stellarConfig.maxTransactionXlm * 0.8,
  };

  // ── Network detection ────────────────────────────────────────────────────

  /**
   * Return the currently configured Stellar network.
   */
  getNetwork(): 'mainnet' | 'testnet' {
    return stellarConfig.network === 'mainnet' ? 'mainnet' : 'testnet';
  }

  /**
   * Returns true when the service is running against mainnet.
   */
  isMainnet(): boolean {
    return stellarConfig.network === 'mainnet';
  }

  /**
   * Validate that the Horizon URL is consistent with the configured network.
   * A mismatch (e.g. mainnet config + testnet Horizon URL) indicates a
   * misconfiguration that could result in real funds being sent to the wrong
   * network or transactions being rejected.
   */
  detectNetworkConsistency(): SafetyCheckResult {
    const result = this.emptyResult();
    const { network, horizonUrl } = stellarConfig;

    if (network === 'mainnet' && horizonUrl.includes('testnet')) {
      result.errors.push(
        'Network/Horizon URL mismatch: mainnet is configured but Horizon URL points to testnet'
      );
      result.passed = false;
    }

    if (network === 'testnet' && !horizonUrl.includes('testnet')) {
      result.errors.push(
        'Network/Horizon URL mismatch: testnet is configured but Horizon URL appears to point to mainnet'
      );
      result.passed = false;
    }

    if (result.passed) {
      logger.debug({ network, horizonUrl }, 'Network consistency check passed');
    } else {
      logger.error({ network, horizonUrl, errors: result.errors }, 'Network consistency check failed');
    }

    return result;
  }

  // ── Amount validation ────────────────────────────────────────────────────

  /**
   * Validate a transaction amount against configured limits.
   *
   * Rules:
   *  - Amount must be positive
   *  - Amount must not exceed maxAmountXlm
   *  - On mainnet, amounts above warningThresholdXlm trigger a warning
   */
  validateAmount(amountXlm: number, config?: SafetyCheckConfig): SafetyCheckResult {
    const cfg = this.mergeConfig(config);
    const result = this.emptyResult();

    if (!Number.isFinite(amountXlm) || amountXlm < 0) {
      result.errors.push(`Invalid amount: ${amountXlm} XLM must be a non-negative finite number`);
      result.passed = false;
      return result;
    }

    if (amountXlm === 0) {
      result.warnings.push('Transaction amount is 0 XLM — this may be unintentional');
    }

    if (amountXlm > cfg.maxAmountXlm) {
      result.errors.push(
        `Amount ${amountXlm} XLM exceeds the configured maximum of ${cfg.maxAmountXlm} XLM`
      );
      result.passed = false;
    }

    if (this.isMainnet() && amountXlm > cfg.warningThresholdXlm && amountXlm <= cfg.maxAmountXlm) {
      result.warnings.push(
        `⚠️  Large mainnet transaction: ${amountXlm} XLM exceeds the warning threshold of ${cfg.warningThresholdXlm} XLM`
      );
    }

    return result;
  }

  // ── Confirmation flow ────────────────────────────────────────────────────

  /**
   * Register that a caller has explicitly confirmed a mainnet transaction.
   *
   * @param paymentId  Unique identifier for the payment being confirmed
   * @param confirmedBy  Who/what confirmed (user ID, service name, etc.)
   * @param reason  Optional human-readable reason
   */
  recordConfirmation(paymentId: string, confirmedBy: string, reason?: string): void {
    const state: ConfirmationState = {
      confirmed: true,
      confirmedAt: new Date(),
      confirmedBy,
      reason,
    };
    this.confirmations.set(paymentId, state);

    logger.info({ paymentId, confirmedBy, reason }, 'Mainnet transaction confirmation recorded');
  }

  /**
   * Check whether explicit confirmation has been recorded for this payment.
   */
  isConfirmed(paymentId: string): boolean {
    return this.confirmations.get(paymentId)?.confirmed === true;
  }

  /**
   * Retrieve the full confirmation state for a payment.
   */
  getConfirmationState(paymentId: string): ConfirmationState | undefined {
    return this.confirmations.get(paymentId);
  }

  /**
   * Remove the confirmation record once the payment has been processed
   * (prevents confirmation reuse).
   */
  consumeConfirmation(paymentId: string): void {
    this.confirmations.delete(paymentId);
    logger.debug({ paymentId }, 'Mainnet confirmation consumed');
  }

  // ── Comprehensive safety check ───────────────────────────────────────────

  /**
   * Run all safety checks for a proposed transaction.
   *
   * Checks performed:
   *  1. Network/Horizon URL consistency
   *  2. Amount limits and warning thresholds
   *  3. MAINNET_CONFIRMED env-var guard
   *  4. Optional explicit confirmation (pass paymentId to check)
   */
  performSafetyCheck(
    amountXlm: number,
    requireConfirmation: boolean = true,
    config?: SafetyCheckConfig,
    paymentId?: string
  ): SafetyCheckResult {
    const result = this.emptyResult();

    // 1. Network consistency
    const networkCheck = this.detectNetworkConsistency();
    this.mergeIntoResult(result, networkCheck);

    // 2. Amount validation
    const amountCheck = this.validateAmount(amountXlm, config);
    this.mergeIntoResult(result, amountCheck);

    // 3. Mainnet-specific guards
    if (this.isMainnet()) {
      result.requiresConfirmation = requireConfirmation;

      if (!stellarConfig.mainnetConfirmed) {
        result.errors.push(
          'Mainnet operations require the MAINNET_CONFIRMED=true environment variable to be set'
        );
        result.passed = false;
      }

      // 4. Explicit per-transaction confirmation check
      if (requireConfirmation) {
        if (paymentId && !this.isConfirmed(paymentId)) {
          result.errors.push(
            `Mainnet transaction requires explicit confirmation — call recordConfirmation('${paymentId}', ...) first`
          );
          result.passed = false;
        }
        result.warnings.push('⚠️  MAINNET MODE: explicit confirmation is required for transactions');
      }

      result.warnings.push('🚨 MAINNET MODE ACTIVE — real XLM will be transferred 🚨');
    }

    this.logSafetyCheckResult('performSafetyCheck', result, { amountXlm, paymentId });
    return result;
  }

  // ── Assertion helpers ────────────────────────────────────────────────────

  /**
   * Run all safety checks and throw if any of them fail.
   * Warnings are logged but do not cause a throw.
   */
  assertSafeTransaction(
    amountXlm: number,
    requireConfirmation: boolean = true,
    config?: SafetyCheckConfig,
    paymentId?: string
  ): void {
    const result = this.performSafetyCheck(amountXlm, requireConfirmation, config, paymentId);

    if (!result.passed) {
      const message = result.errors.join('; ');
      logger.error(
        { amountXlm, paymentId, errors: result.errors },
        'Transaction safety assertion failed'
      );
      throw new Error(`Transaction safety check failed: ${message}`);
    }

    if (result.warnings.length) {
      logger.warn({ amountXlm, warnings: result.warnings }, 'Transaction passed safety check with warnings');
    }
  }

  // ── User-facing message helpers ──────────────────────────────────────────

  /**
   * Build a human-readable warning message from a SafetyCheckResult.
   */
  getWarningMessage(result: SafetyCheckResult): string {
    const lines: string[] = [];

    if (this.isMainnet()) {
      lines.push('⚠️  WARNING: You are operating on STELLAR MAINNET');
      lines.push('    Real XLM will be transferred. Transactions cannot be undone.');
      lines.push('');
    }

    for (const warning of result.warnings) {
      lines.push(`  ${warning}`);
    }

    return lines.join('\n');
  }

  /**
   * Build a human-readable error message from a SafetyCheckResult.
   */
  getErrorMessage(result: SafetyCheckResult): string {
    const lines = ['❌ Safety Check Failed:', ''];
    for (const error of result.errors) {
      lines.push(`  • ${error}`);
    }
    return lines.join('\n');
  }

  /**
   * Log the result of a safety check at the appropriate level.
   */
  logSafetyCheckResult(
    checkName: string,
    result: SafetyCheckResult,
    metadata: Record<string, unknown> = {}
  ): void {
    if (result.errors.length) {
      logger.error(
        { checkName, ...metadata, errors: result.errors, warnings: result.warnings },
        `Safety check failed: ${checkName}`
      );
    } else if (result.warnings.length) {
      logger.warn(
        { checkName, ...metadata, warnings: result.warnings },
        `Safety check passed with warnings: ${checkName}`
      );
    } else {
      logger.debug({ checkName, ...metadata }, `Safety check passed: ${checkName}`);
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private emptyResult(): SafetyCheckResult {
    return {
      passed: true,
      warnings: [],
      errors: [],
      network: this.getNetwork(),
      requiresConfirmation: false,
    };
  }

  private mergeConfig(config?: SafetyCheckConfig): Required<SafetyCheckConfig> {
    return { ...this.defaultConfig, ...config };
  }

  private mergeIntoResult(target: SafetyCheckResult, source: SafetyCheckResult): void {
    target.errors.push(...source.errors);
    target.warnings.push(...source.warnings);
    if (!source.passed) {
      target.passed = false;
    }
  }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const mainnetSafetyManager = new MainnetSafetyManager();
