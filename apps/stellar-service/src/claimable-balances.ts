/**
 * Stellar Claimable Balances / Escrow Service
 * Issue #1082 — Claimable Balances Implementation
 *
 * Provides a high-level escrow API built on Stellar's claimable balance feature.
 * - createEscrow: locks funds with time-bound claimants (destination + source refund)
 * - claimBalance: claim a balance as the designated claimant
 * - refundEscrow: source reclaims funds after expiry
 * - getBalance / listBalancesForAccount: query helpers
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import logger from './logger.js';

export interface ClaimableBalanceConfig {
  sourceKeypair: StellarSdk.Keypair;
  destinationPublicKey: string;
  amount: string;
  asset: StellarSdk.Asset;
  claimants?: StellarSdk.Claimant[];
  escrowTimeoutSeconds?: number; // default 7 days (604800s)
}

export interface ClaimableBalanceResult {
  balanceId: string;
  transactionHash: string;
  claimants: string[];
  amount: string;
  asset: string;
  expiresAt?: Date;
}

export interface ClaimResult {
  transactionHash: string;
  claimedAmount: string;
  claimedAsset: string;
}

export class ClaimableBalanceService {
  private server: StellarSdk.Horizon.Server;
  private networkPassphrase: string;

  constructor(horizonUrl: string, networkPassphrase: string) {
    this.server = new StellarSdk.Horizon.Server(horizonUrl);
    this.networkPassphrase = networkPassphrase;
  }

  /**
   * Create a claimable balance (escrow) on Stellar.
   *
   * The destination can claim the funds before `expiresAt`.
   * The source can reclaim them after `expiresAt` if the destination has not claimed.
   */
  async createEscrow(config: ClaimableBalanceConfig): Promise<ClaimableBalanceResult> {
    const {
      sourceKeypair,
      destinationPublicKey,
      amount,
      asset,
      escrowTimeoutSeconds = 604800,
    } = config;

    try {
      const sourceAccount = await this.server.loadAccount(sourceKeypair.publicKey());

      const expiresAt = new Date(Date.now() + escrowTimeoutSeconds * 1000);
      const expiresAtUnix = Math.floor(expiresAt.getTime() / 1000);

      // Destination can claim any time before expiry
      const destinationClaimant = new StellarSdk.Claimant(
        destinationPublicKey,
        StellarSdk.Claimant.predicateBeforeAbsoluteTime(expiresAtUnix.toString())
      );

      // Source can reclaim only after the expiry (NOT before)
      const sourceClaimant = new StellarSdk.Claimant(
        sourceKeypair.publicKey(),
        StellarSdk.Claimant.predicateNot(
          StellarSdk.Claimant.predicateBeforeAbsoluteTime(expiresAtUnix.toString())
        )
      );

      const claimants = config.claimants ?? [destinationClaimant, sourceClaimant];

      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.createClaimableBalance({
            claimants,
            asset,
            amount,
          })
        )
        .setTimeout(30)
        .build();

      transaction.sign(sourceKeypair);

      const result = await this.server.submitTransaction(transaction);

      const balanceId = this.extractBalanceId(result);

      logger.info({
        event: 'claimable_balance_created',
        balanceId,
        transactionHash: result.hash,
        amount,
        asset: asset.code,
        destination: destinationPublicKey,
        expiresAt: expiresAt.toISOString(),
      });

      return {
        balanceId,
        transactionHash: result.hash,
        claimants: claimants.map((c) => c.destination),
        amount,
        asset: asset.isNative() ? 'XLM' : `${asset.code}:${asset.issuer}`,
        expiresAt,
      };
    } catch (error) {
      logger.error({ event: 'claimable_balance_create_error', error });
      throw this.wrapError(error, 'Failed to create claimable balance');
    }
  }

  /**
   * Claim a claimable balance as the designated claimant.
   */
  async claimBalance(
    claimantKeypair: StellarSdk.Keypair,
    balanceId: string
  ): Promise<ClaimResult> {
    try {
      const claimantAccount = await this.server.loadAccount(claimantKeypair.publicKey());

      // Fetch balance info for logging purposes
      const balance = await this.server
        .claimableBalances()
        .claimableBalance(balanceId)
        .call();

      const transaction = new StellarSdk.TransactionBuilder(claimantAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.claimClaimableBalance({
            balanceId,
          })
        )
        .setTimeout(30)
        .build();

      transaction.sign(claimantKeypair);

      const result = await this.server.submitTransaction(transaction);

      logger.info({
        event: 'claimable_balance_claimed',
        balanceId,
        transactionHash: result.hash,
        claimant: claimantKeypair.publicKey(),
      });

      return {
        transactionHash: result.hash,
        claimedAmount: balance.amount,
        claimedAsset: balance.asset,
      };
    } catch (error) {
      logger.error({ event: 'claimable_balance_claim_error', balanceId, error });
      throw this.wrapError(error, 'Failed to claim balance');
    }
  }

  /**
   * Refund escrow back to source after expiry (source claims using its claimant predicate).
   * This is functionally the same as claimBalance, but logged as a refund for clarity.
   */
  async refundEscrow(
    sourceKeypair: StellarSdk.Keypair,
    balanceId: string
  ): Promise<ClaimResult> {
    logger.info({ event: 'escrow_refund_initiated', balanceId });
    return this.claimBalance(sourceKeypair, balanceId);
  }

  /**
   * Fetch details for a single claimable balance.
   */
  async getBalance(balanceId: string) {
    try {
      const balance = await this.server
        .claimableBalances()
        .claimableBalance(balanceId)
        .call();
      return balance;
    } catch (error) {
      throw this.wrapError(error, `Balance ${balanceId} not found`);
    }
  }

  /**
   * List all claimable balances for which the given account is a claimant.
   */
  async listBalancesForAccount(publicKey: string) {
    try {
      const balances = await this.server
        .claimableBalances()
        .claimant(publicKey)
        .call();
      return balances.records;
    } catch (error) {
      throw this.wrapError(error, 'Failed to list claimable balances');
    }
  }

  /**
   * Extract the balance ID from the XDR-encoded transaction result.
   * Falls back to a hash-based identifier if XDR parsing fails.
   */
  private extractBalanceId(
    result: StellarSdk.Horizon.HorizonApi.SubmitTransactionResponse
  ): string {
    try {
      if (result.result_xdr) {
        const txResult = StellarSdk.xdr.TransactionResult.fromXDR(result.result_xdr, 'base64');
        const operationResults = txResult.result().results();
        if (operationResults.length > 0) {
          const opResult = operationResults[0].tr();
          // @ts-ignore — createClaimableBalanceResult() is defined in the XDR but not typed upstream
          const balanceId = opResult.createClaimableBalanceResult().balanceID();
          return StellarSdk.xdr.ClaimableBalanceID.toXDR(balanceId).toString('hex');
        }
      }
    } catch {
      // XDR parsing failed — use fallback
    }
    return `${result.hash}-balance`;
  }

  private wrapError(error: unknown, message: string): Error {
    if (error instanceof Error) {
      const wrapped = new Error(`${message}: ${error.message}`);
      wrapped.stack = error.stack;
      return wrapped;
    }
    return new Error(message);
  }
}
