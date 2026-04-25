import * as StellarSdk from '@stellar/stellar-sdk';

export interface ClaimableBalanceParams {
  sourceAccount: StellarSdk.Account;
  amount: string;
  asset: StellarSdk.Asset;
  claimantPublicKey: string;
  claimableAfter: Date;
  claimableUntil: Date;
  networkPassphrase: string;
  baseFee: string;
}

export interface ClaimBalanceParams {
  claimerAccount: StellarSdk.Account;
  balanceId: string;
  networkPassphrase: string;
  baseFee: string;
}

export function createClaimableBalance(params: ClaimableBalanceParams): StellarSdk.Transaction {
  const {
    sourceAccount,
    amount,
    asset,
    claimantPublicKey,
    claimableAfter,
    claimableUntil,
    networkPassphrase,
    baseFee,
  } = params;

  // Create claimant with time-based predicates
  const claimant = new StellarSdk.Claimant(
    claimantPublicKey,
    StellarSdk.Claimant.predicateAnd(
      StellarSdk.Claimant.predicateNot(
        StellarSdk.Claimant.predicateBeforeAbsoluteTime(
          Math.floor(claimableAfter.getTime() / 1000).toString()
        )
      ),
      StellarSdk.Claimant.predicateBeforeAbsoluteTime(
        Math.floor(claimableUntil.getTime() / 1000).toString()
      )
    )
  );

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: baseFee,
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.createClaimableBalance({
        asset,
        amount,
        claimants: [claimant],
      })
    )
    .setTimeout(30)
    .build();

  return transaction;
}

export function claimClaimableBalance(params: ClaimBalanceParams): StellarSdk.Transaction {
  const { claimerAccount, balanceId, networkPassphrase, baseFee } = params;

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

export async function getClaimableBalances(
  server: StellarSdk.Horizon.Server,
  claimantPublicKey: string
): Promise<StellarSdk.ServerApi.ClaimableBalanceRecord[]> {
  const balances = await server
    .claimableBalances()
    .claimant(claimantPublicKey)
    .limit(200)
    .call();

  return balances.records;
}
