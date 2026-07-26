import { stellarConfig } from './config.js';
import logger from './logger.js';

export interface SafetyCheckResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
}

export interface SafetyCheckConfig {
  requireConfirmation?: boolean;
  maxAmountXlm?: number;
  warningThresholdXlm?: number;
}

export class MainnetSafetyManager {
  private defaultConfig: SafetyCheckConfig = {
    requireConfirmation: true,
    maxAmountXlm: stellarConfig.maxTransactionXlm,
    warningThresholdXlm: stellarConfig.maxTransactionXlm * 0.8,
  };

  /**
   * Get the current network being used
   */
  getNetwork(): 'mainnet' | 'testnet' {
    return (stellarConfig.network === 'mainnet' ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet';
  }

  /**
   * Check if we're on mainnet
   */
  isMainnet(): boolean {
    return stellarConfig.network === 'mainnet';
  }

  /**
   * Detect network consistency
   */
  detectNetworkConsistency(): SafetyCheckResult {
    const result: SafetyCheckResult = {
      passed: true,
      warnings: [],
      errors: [],
    };

    const { network, horizonUrl } = stellarConfig;

    if (network === 'mainnet' && horizonUrl.includes('testnet')) {
      result.errors.push(
        'Network/Horizon URL mismatch: mainnet configured with testnet Horizon URL'
      );
      result.passed = false;
    }

    if (network === 'testnet' && !horizonUrl.includes('testnet')) {
      result.errors.push(
        'Network/Horizon URL mismatch: testnet configured with mainnet Horizon URL'
      );
      result.passed = false;
    }

    return result;
  }

  /**
   * Validate transaction amount
   */
  validateAmount(amountXlm: number, config?: SafetyCheckConfig): SafetyCheckResult {
    const safetyConfig = { ...this.defaultConfig, ...config };
    const result: SafetyCheckResult = {
      passed: true,
      warnings: [],
      errors: [],
    };

    if (amountXlm < 0) {
      result.errors.push(`Invalid amount: ${amountXlm} XLM cannot be negative`);
      result.passed = false;
      return result;
    }

    if (amountXlm > safetyConfig.maxAmountXlm!) {
      result.errors.push(
        `Amount exceeds maximum limit: ${amountXlm} XLM > ${safetyConfig.maxAmountXlm} XLM`
      );
      result.passed = false;
    }

    if (this.isMainnet() && amountXlm > safetyConfig.warningThresholdXlm!) {
      result.warnings.push(
        `⚠️  Large transaction on mainnet: ${amountXlm} XLM exceeds warning threshold of ${safetyConfig.warningThresholdXlm} XLM`
      );
    }

    return result;
  }

  /**
   * Comprehensive safety check for transactions
   */
  performSafetyCheck(
    amountXlm: number,
    requireConfirmation: boolean = true,
    config?: SafetyCheckConfig
  ): SafetyCheckResult {
    const result: SafetyCheckResult = {
      passed: true,
      warnings: [],
      errors: [],
    };

    // Check network consistency
    const networkCheck = this.detectNetworkConsistency();
    result.errors.push(...networkCheck.errors);
    result.warnings.push(...networkCheck.warnings);
    result.passed = result.passed && networkCheck.passed;

    // Validate amount
    const amountCheck = this.validateAmount(amountXlm, config);
    result.errors.push(...amountCheck.errors);
    result.warnings.push(...amountCheck.warnings);
    result.passed = result.passed && amountCheck.passed;

    // Mainnet specific checks
    if (this.isMainnet()) {
      if (!stellarConfig.mainnetConfirmed) {
        result.errors.push(
          'Mainnet operation requires MAINNET_CONFIRMED=true environment variable'
        );
        result.passed = false;
      }

      if (requireConfirmation) {
        result.warnings.push('⚠️  MAINNET MODE: Explicit confirmation required for transactions');
      }

      result.warnings.push('🚨 MAINNET MODE ACTIVE - Real XLM will be used 🚨');
    }

    return result;
  }

  /**
   * Log safety check results
   */
  logSafetyCheckResult(
    checkName: string,
    result: SafetyCheckResult,
    metadata: Record<string, unknown> = {}
  ): void {
    if (result.errors.length > 0) {
      logger.error(
        { checkName, ...metadata, errors: result.errors, warnings: result.warnings },
        `Safety check failed: ${checkName}`
      );
    } else if (result.warnings.length > 0) {
      logger.warn(
        { checkName, ...metadata, warnings: result.warnings },
        `Safety check passed with warnings: ${checkName}`
      );
    } else {
      logger.debug({ checkName, ...metadata }, `Safety check passed: ${checkName}`);
    }
  }

  /**
   * Assert transaction is safe, throw if not
   */
  assertSafeTransaction(
    amountXlm: number,
    requireConfirmation: boolean = true,
    config?: SafetyCheckConfig
  ): void {
    const result = this.performSafetyCheck(amountXlm, requireConfirmation, config);

    if (!result.passed) {
      const errorMessage = result.errors.join('; ');
      logger.error(
        { amountXlm, errors: result.errors, warnings: result.warnings },
        'Transaction safety check failed'
      );
      throw new Error(`Transaction safety check failed: ${errorMessage}`);
    }

    if (result.warnings.length > 0) {
      logger.warn(
        { amountXlm, warnings: result.warnings },
        'Transaction passed safety check but with warnings'
      );
    }
  }

  /**
   * Get formatted warning message for user
   */
  getWarningMessage(result: SafetyCheckResult): string {
    const lines: string[] = [];

    if (this.isMainnet()) {
      lines.push('⚠️  WARNING: You are operating on STELLAR MAINNET');
      lines.push('    Real XLM will be transferred. This cannot be undone.');
      lines.push('');
    }

    result.warnings.forEach((warning) => {
      lines.push(`  ${warning}`);
    });

    return lines.join('\n');
  }

  /**
   * Get formatted error message for user
   */
  getErrorMessage(result: SafetyCheckResult): string {
    const lines: string[] = [];

    lines.push('❌ Safety Check Failed:');
    lines.push('');

    result.errors.forEach((error) => {
      lines.push(`  • ${error}`);
    });

    return lines.join('\n');
  }
}

export const mainnetSafetyManager = new MainnetSafetyManager();
