import StellarSdk from 'stellar-sdk';
import { stellarConfig } from './config.js';
import logger from './logger.js';

function getServer() {
  return new StellarSdk.Horizon.Server(stellarConfig.network === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org');
}

/** Fund a testnet account via Friendbot */
export async function fundAccount(publicKey: string, _amount?: string) {
  if (stellarConfig.network !== 'testnet') {
    throw new Error('Friendbot is only available on testnet');
  }
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Friendbot error: ${res.status}`);
  }
  const data = await res.json();
  logger.info({ publicKey }, 'Account funded via Friendbot');
  return { funded: true, hash: data.hash };
}

/** Get XLM balance and recent transactions for an account */
export async function getAccountBalance(publicKey: string) {
  const server = getServer();
  const account = await server.loadAccount(publicKey);
  const xlmBalance = account.balances.find((b: any) => b.asset_type === 'native');
  const usdcBalance = account.balances.find(
    (b: any) => b.asset_code === 'USDC' && b.asset_type !== 'native',
  );

  const payments = await server.payments().forAccount(publicKey).limit(10).order('desc').call();
  const transactions = payments.records
    .filter((r: any) => r.type === 'payment' || r.type === 'create_account')
    .map((r: any) => ({
      id: r.id,
      type: r.type,
      amount: r.amount ?? r.starting_balance ?? '0',
      asset: r.asset_type === 'native' ? 'XLM' : `${r.asset_code}:${r.asset_issuer}`,
      from: r.from ?? r.funder,
      to: r.to ?? r.account,
      hash: r.transaction_hash,
      createdAt: r.created_at,
    }));

  return {
    balance: xlmBalance ? xlmBalance.balance : '0',
    usdcBalance: usdcBalance ? usdcBalance.balance : null,
    transactions,
  };
}

/** Create a USDC trustline for an account */
export async function createUsdcTrustline(publicKey: string, usdcIssuer: string) {
  const server = getServer();
  const sourceAccount = await server.loadAccount(publicKey);

  // Check if trustline already exists
  const existing = sourceAccount.balances.find(
    (b: any) => b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer,
  );
  if (existing) {
    return { alreadyExists: true, trustline: 'USDC' };
  }

  const fee = await server.fetchBaseFee();
  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: String(fee),
    networkPassphrase:
      stellarConfig.network === 'mainnet'
        ? StellarSdk.Networks.PUBLIC
        : StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.changeTrust({
        asset: new StellarSdk.Asset('USDC', usdcIssuer),
      }),
    )
    .setTimeout(30)
    .build();

  if (stellarConfig.stellarSecretKey) {
    const keypair = StellarSdk.Keypair.fromSecret(stellarConfig.stellarSecretKey);
    transaction.sign(keypair);
    if (!stellarConfig.dryRun) {
      const result = await server.submitTransaction(transaction);
      return { created: true, hash: result.hash };
    }
  }

  return { envelope: transaction.toEnvelope().toXDR('base64'), dryRun: true };
}

/** Create a payment intent (build + sign + submit) */
export async function createIntent(fromPublicKey: string, toPublicKey: string, amount: string) {
  const server = getServer();
  const sourceAccount = await server.loadAccount(fromPublicKey);
  const fee = await server.fetchBaseFee();

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: String(fee),
    networkPassphrase: stellarConfig.network === 'mainnet'
      ? StellarSdk.Networks.PUBLIC
      : StellarSdk.Networks.TESTNET,
  })
    .addOperation(StellarSdk.Operation.payment({
      destination: toPublicKey,
      asset: StellarSdk.Asset.native(),
      amount,
    }))
    .setTimeout(30)
    .build();

  if (stellarConfig.stellarSecretKey) {
    const keypair = StellarSdk.Keypair.fromSecret(stellarConfig.stellarSecretKey);
    transaction.sign(keypair);
    if (!stellarConfig.dryRun) {
      const result = await server.submitTransaction(transaction);
      return { hash: result.hash, envelope: transaction.toEnvelope().toXDR('base64') };
    }
  }

  return { envelope: transaction.toEnvelope().toXDR('base64'), dryRun: true };
}

/** Verify a transaction by hash */
export async function verifyIntent(hash: string) {
  const server = getServer();
  const tx = await server.transactions().transaction(hash).call();
  return {
    found: true,
    hash: tx.hash,
    successful: tx.successful,
    createdAt: tx.created_at,
  };
}
