import * as StellarSdk from '@stellar/stellar-sdk';
import logger from '../logger.js';
import { withHorizonCall } from '../stellar.js';
import {
  invokeContract,
  SorobanInvokeResult,
  SorobanSimulationError,
} from '../soroban/client.js';

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

export interface SorobanEscrowParams {
  /** Soroban RPC server used for simulation and submission */
  server: StellarSdk.SorobanRpc.Server;
  /** Horizon server used to load the source account sequence number */
  horizonServer: StellarSdk.Horizon.Server;
  /** Public key of the account invoking the contract */
  sourcePublicKey: string;
  /** Secret key used to sign the assembled transaction */
  signerSecret: string;
  /** Deployed escrow contract id (C...) */
  contractId: string;
  /** Amount in stroops (i128) */
  amount: string;
  /** Asset contract address (C...) or 'native' for the native asset SAC */
  asset: string;
  /** Public key of the beneficiary that can release funds */
  claimantPublicKey: string;
  /** Public key of the account that can refund funds */
  refundPublicKey: string;
  /** Unix timestamp (seconds) after which the claimant can release */
  claimableAfter: number;
  /** Unix timestamp (seconds) after which the refunder can refund */
  claimableUntil: number;
  networkPassphrase: string;
  baseFee: string;
}

export interface SorobanEscrowActionResult {
  transactionHash: string;
  status: string;
  ledger?: number;
  returnValue?: unknown;
}

/**
 * Build, simulate, assemble, sign and submit a Soroban contract invocation.
 * Simulation failures are surfaced (thrown) without submitting the transaction.
 */
async function submitSorobanInvocation(
  server: StellarSdk.SorobanRpc.Server,
  horizonServer: StellarSdk.Horizon.Server,
  sourcePublicKey: string,
  signerSecret: string,
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
  networkPassphrase: string,
  baseFee: string
): Promise<SorobanEscrowActionResult> {
  const sourceAccount = await withHorizonCall(
    'loadAccount',
    { sourcePublicKey, operation: `soroban:${method}` },
    () => horizonServer.loadAccount(sourcePublicKey)
  );

  let result: SorobanInvokeResult;
  try {
    result = await invokeContract({
      server,
      sourceAccount,
      contractId,
      method,
      args,
      networkPassphrase,
      baseFee,
      signerSecret,
    });
  } catch (error) {
    if (error instanceof SorobanSimulationError) {
      logger.error(
        {
          operation: `soroban:${method}`,
          contractId,
          error: error.message,
          details: error.details,
        },
        'Soroban simulation failed; transaction not submitted'
      );
    } else {
      logger.error(
        { operation: `soroban:${method}`, contractId, error },
        'Soroban invocation failed'
      );
    }
    throw error;
  }

  logger.info(
    {
      operation: `soroban:${method}`,
      contractId,
      transactionHash: result.transactionHash,
      status: result.status,
      ledger: result.ledger,
    },
    'Soroban invocation submitted'
  );

  return {
    transactionHash: result.transactionHash,
    status: result.status,
    ledger: result.ledger,
    returnValue: result.returnValue,
  };
}

/**
 * Deposit funds into the Soroban escrow contract.
 * Returns the submitted transaction hash.
 */
export async function depositSorobanEscrow(
  params: SorobanEscrowParams
): Promise<SorobanEscrowActionResult> {
  const {
    server,
    horizonServer,
    sourcePublicKey,
    signerSecret,
    contractId,
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
    { operation: 'depositSorobanEscrow', contractId, amount, claimantPublicKey, refundPublicKey },
    'Invoking Soroban escrow deposit'
  );

  const args = [
    StellarSdk.Address.fromString(sourcePublicKey).toScVal(),
    StellarSdk.Address.fromString(claimantPublicKey).toScVal(),
    StellarSdk.Address.fromString(refundPublicKey).toScVal(),
    StellarSdk.nativeToScVal(BigInt(amount), { type: 'i128' }),
    StellarSdk.Address.fromString(asset).toScVal(),
    StellarSdk.nativeToScVal(BigInt(claimableAfter), { type: 'u64' }),
    StellarSdk.nativeToScVal(BigInt(claimableUntil), { type: 'u64' }),
  ];

  return submitSorobanInvocation(
    server,
    horizonServer,
    sourcePublicKey,
    signerSecret,
    contractId,
    'deposit',
    args,
    networkPassphrase,
    baseFee
  );
}

/**
 * Release escrowed funds to the claimant via the Soroban escrow contract.
 */
export async function releaseSorobanEscrow(params: {
  server: StellarSdk.SorobanRpc.Server;
  horizonServer: StellarSdk.Horizon.Server;
  sourcePublicKey: string;
  signerSecret: string;
  contractId: string;
  escrowId: string;
  networkPassphrase: string;
  baseFee: string;
}): Promise<SorobanEscrowActionResult> {
  const {
    server,
    horizonServer,
    sourcePublicKey,
    signerSecret,
    contractId,
    escrowId,
    networkPassphrase,
    baseFee,
  } = params;

  logger.debug(
    { operation: 'releaseSorobanEscrow', contractId, escrowId },
    'Invoking Soroban escrow release'
  );

  const args = [
    StellarSdk.Address.fromString(sourcePublicKey).toScVal(),
    StellarSdk.nativeToScVal(BigInt(escrowId), { type: 'u64' }),
  ];

  return submitSorobanInvocation(
    server,
    horizonServer,
    sourcePublicKey,
    signerSecret,
    contractId,
    'release',
    args,
    networkPassphrase,
    baseFee
  );
}

/**
 * Refund escrowed funds to the depositor via the Soroban escrow contract.
 */
export async function refundSorobanEscrow(params: {
  server: StellarSdk.SorobanRpc.Server;
  horizonServer: StellarSdk.Horizon.Server;
  sourcePublicKey: string;
  signerSecret: string;
  contractId: string;
  escrowId: string;
  networkPassphrase: string;
  baseFee: string;
}): Promise<SorobanEscrowActionResult> {
  const {
    server,
    horizonServer,
    sourcePublicKey,
    signerSecret,
    contractId,
    escrowId,
    networkPassphrase,
    baseFee,
  } = params;

  logger.debug(
    { operation: 'refundSorobanEscrow', contractId, escrowId },
    'Invoking Soroban escrow refund'
  );

  const args = [
    StellarSdk.Address.fromString(sourcePublicKey).toScVal(),
    StellarSdk.nativeToScVal(BigInt(escrowId), { type: 'u64' }),
  ];

  return submitSorobanInvocation(
    server,
    horizonServer,
    sourcePublicKey,
    signerSecret,
    contractId,
    'refund',
    args,
    networkPassphrase,
    baseFee
  );
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
