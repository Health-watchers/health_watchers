import * as StellarSdk from '@stellar/stellar-sdk';
import logger from '../logger.js';
import { withHorizonCall } from '../stellar.js';

export interface EscrowParams {
  sourceAccount: StellarSdk.Account;
  amount: string;
  asset: StellarSdk.Asset;
  claimantPublicKey: string;
  refundPublicKey: string;
  claimableAfter: Date;
  claimableUntil: Date;
  networkPassphrase: string;
  baseFee: string;
}

export interface EscrowClaimParams {
  claimerAccount: StellarSdk.Account;
  balanceId: string;
  networkPassphrase: string;
  baseFee: string;
}

export interface EscrowRefundParams {
  refunderAccount: StellarSdk.Account;
  balanceId: string;
  networkPassphrase: string;
  baseFee: string;
}

export interface ClaimableBalanceRecord {
  id: string;
  amount: string;
  asset: string;
  claimants: any[];
  lastModifiedLedger: number;
  lastModifiedTime: string;
}

/**
 * Create an escrow with time-based claimable balance
 * Allows refunding if the balance is not claimed by claimableUntil
 */
export function createEscrow(params: EscrowParams): StellarSdk.Transaction {
  const {
    sourceAccount,
    amount,
    asset,
    claimantPublicKey,
    refundPublicKey,
    claimableAfter,
    claimableUntil,
    networkPassphrase,
    baseFee,
  } = params;

  logger.debug(
    {
      operation: 'createEscrow',
      amount,
      claimant: claimantPublicKey,
      refund: refundPublicKey,
      claimableAfter: claimableAfter.toISOString(),
      claimableUntil: claimableUntil.toISOString(),
    },
    'Creating escrow'
  );

  // Create predicate: claimable after claimableAfter AND before claimableUntil
  // After that time, the refunder can reclaim
  const claimantPredicate = StellarSdk.Claimant.predicateAnd(
    StellarSdk.Claimant.predicateNot(
      StellarSdk.Claimant.predicateBeforeAbsoluteTime(
        Math.floor(claimableAfter.getTime() / 1000).toString()
      )
    ),
    StellarSdk.Claimant.predicateBeforeAbsoluteTime(
      Math.floor(claimableUntil.getTime() / 1000).toString()
    )
  );

  // Refunder can claim anytime after claimableUntil
  const refunderPredicate = StellarSdk.Claimant.predicateBeforeAbsoluteTime(
    Math.floor(new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 100).getTime() / 1000).toString() // Far future
  );

  const claimants = [
    new StellarSdk.Claimant(claimantPublicKey, claimantPredicate),
    new StellarSdk.Claimant(refundPublicKey, refunderPredicate),
  ];

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: baseFee,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.createClaimableBalance({
        asset,
        amount,
        claimants,
      })
    )
    .setTimeout(30)
    .build();

  logger.debug({ operation: 'createEscrow', balanceId: 'pending' }, 'Escrow transaction built');

  return transaction;
}

/**
 * Claim a claimable balance (escrow)
 */
export function claimEscrow(params: EscrowClaimParams): StellarSdk.Transaction {
  const { claimerAccount, balanceId, networkPassphrase, baseFee } = params;

  logger.debug(
    { operation: 'claimEscrow', balanceId, claimerAccount: claimerAccount.accountId() },
    'Building claim escrow transaction'
  );

  const transaction = new StellarSdk.TransactionBuilder(claimerAccount, {
    fee: baseFee,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.claimClaimableBalance({
        balanceId,
      })
    )
    .setTimeout(30)
    .build();

  return transaction;
}

/**
 * Refund an escrow (by refunder)
 */
export function refundEscrow(params: EscrowRefundParams): StellarSdk.Transaction {
  const { refunderAccount, balanceId, networkPassphrase, baseFee } = params;

  logger.debug(
    { operation: 'refundEscrow', balanceId, refundAccount: refunderAccount.accountId() },
    'Building refund escrow transaction'
  );

  const transaction = new StellarSdk.TransactionBuilder(refunderAccount, {
    fee: baseFee,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.claimClaimableBalance({
        balanceId,
      })
    )
    .setTimeout(30)
    .build();

  return transaction;
}

/**
 * Get all claimable balances for a public key
 */
export async function getClaimableBalances(
  server: StellarSdk.Horizon.Server,
  publicKey: string
): Promise<ClaimableBalanceRecord[]> {
  try {
    const response = await withHorizonCall(
      'claimableBalances',
      { publicKey, operation: 'getClaimableBalances' },
      () => server.claimableBalances().claimant(publicKey).limit(200).call()
    );

    return response.records.map((record: any) => ({
      id: record.id,
      amount: record.amount,
      asset: record.asset,
      claimants: record.claimants,
      lastModifiedLedger: record.last_modified_ledger,
      lastModifiedTime: record.last_modified_time || record.created_at || new Date().toISOString(),
    }));
  } catch (error) {
    logger.error(
      { operation: 'getClaimableBalances', publicKey, error },
      'Failed to get claimable balances'
    );
    throw error;
  }
}

/**
 * Get claimable balance by ID
 */
export async function getClaimableBalanceById(
  server: StellarSdk.Horizon.Server,
  balanceId: string
): Promise<ClaimableBalanceRecord | null> {
  try {
    const response = await withHorizonCall(
      'claimableBalance',
      { balanceId, operation: 'getClaimableBalanceById' },
      () => server.claimableBalances().claimableBalance(balanceId).call()
    );

    return {
      id: response.id,
      amount: response.amount,
      asset: response.asset,
      claimants: response.claimants,
      lastModifiedLedger: response.last_modified_ledger,
      lastModifiedTime:
        (response as any).last_modified_time ||
        (response as any).created_at ||
        new Date().toISOString(),
    };
  } catch (error: any) {
    if (error.response?.status === 404) {
      logger.debug({ balanceId }, 'Claimable balance not found');
      return null;
    }
    logger.error(
      { operation: 'getClaimableBalanceById', balanceId, error },
      'Failed to get claimable balance'
    );
    throw error;
  }
}

/**
 * Check if a claimable balance is still claimable by a given account
 */
export function isBalanceClaimable(
  balance: ClaimableBalanceRecord,
  claimantPublicKey: string
): boolean {
  const claimant = balance.claimants.find((c: any) => c.destination === claimantPublicKey);
  return !!claimant;
}

/**
 * Get claimable balance by refunder (refund perspective)
 */
export async function getRefundableBalances(
  server: StellarSdk.Horizon.Server,
  refunderPublicKey: string
): Promise<ClaimableBalanceRecord[]> {
  try {
    const response = await withHorizonCall(
      'claimableBalances',
      { refunderPublicKey, operation: 'getRefundableBalances' },
      () => server.claimableBalances().claimant(refunderPublicKey).limit(200).call()
    );

    return response.records.map((record: any) => ({
      id: record.id,
      amount: record.amount,
      asset: record.asset,
      claimants: record.claimants,
      lastModifiedLedger: record.last_modified_ledger,
      lastModifiedTime: record.last_modified_time || record.created_at || new Date().toISOString(),
    }));
  } catch (error) {
    logger.error(
      { operation: 'getRefundableBalances', refunderPublicKey, error },
      'Failed to get refundable balances'
    );
    throw error;
  }
}
