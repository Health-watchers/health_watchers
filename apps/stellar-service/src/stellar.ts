import { 
  Keypair, 
  Horizon, 
  TransactionBuilder, 
  BASE_FEE, 
  Networks, 
  Operation, 
  Asset 
} from '@stellar/stellar-sdk';
import { stellarConfig } from './config.js';
import { assertTransactionLimit } from './guards.js';
import logger from './logger.js';

/**
 * Get the appropriate network passphrase using SDK constants
 */
export function getNetworkPassphrase(): string {
  return stellarConfig.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

/**
 * Get Horizon server instance
 */
export function getHorizonServer(): Horizon.Server {
  return new Horizon.Server(stellarConfig.horizonUrl);
}

/**
 * Fund an account using Friendbot (testnet only)
 * Returns 403 on mainnet as Friendbot is testnet-only
 */
export async function fundAccount(publicKey: string, amount?: number) {
  // Friendbot is testnet-only
  if (stellarConfig.network === 'mainnet') {
    throw new Error('Friendbot funding is not available on mainnet. Use real XLM instead.');
  }

  logger.info({ publicKey, amount }, 'Funding account via Friendbot');

  try {
    const response = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail ?? `Friendbot request failed: ${response.statusText}`);
    }

    const json = await response.json();
    logger.info({ publicKey }, 'Account funded successfully');
    
    return {
      funded: true,
      hash: json.hash,
      ledger: json.ledger,
    };
  } catch (error) {
    logger.error({ error, publicKey }, 'Failed to fund account');
    throw error;
  }
}

/**
 * Get account balance and recent transactions
 */
export async function getAccountBalance(publicKey: string) {
  const server = getHorizonServer();
  try {
    const account = await server.loadAccount(publicKey);
    const xlmBalance = account.balances.find((b: any) => b.asset_type === 'native');
    const usdcBalance = account.balances.find(
      (b: any) => b.asset_code === 'USDC' && b.asset_type !== 'native'
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
  } catch (error: any) {
    logger.error({ error, publicKey }, 'Failed to get account balance');
    throw error;
  }
}

/**
 * Create a USDC trustline for an account
 */
export async function createUsdcTrustline(publicKey: string, usdcIssuer: string) {
  const server = getHorizonServer();
  const sourceAccount = await server.loadAccount(publicKey);

  // Check if trustline already exists
  const existing = sourceAccount.balances.find(
    (b: any) => b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer
  );
  if (existing) {
    return { alreadyExists: true, trustline: 'USDC' };
  }

  const fee = await server.fetchBaseFee();
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: String(fee),
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset('USDC', usdcIssuer),
      })
    )
    .setTimeout(30)
    .build();

  if (stellarConfig.stellarSecretKey) {
    const keypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);
    transaction.sign(keypair);
    if (!stellarConfig.dryRun) {
      const result = await server.submitTransaction(transaction);
      return { created: true, hash: result.hash };
    }
  }

  return { envelope: transaction.toEnvelope().toXDR('base64'), dryRun: true };
}

/**
 * Create a payment intent (transaction envelope)
 */
export async function createIntent(
  fromPublicKey: string,
  toPublicKey: string,
  amount: string
) {
  const amountNum = parseFloat(amount);
  assertTransactionLimit(amountNum);

  logger.info({ from: fromPublicKey, to: toPublicKey, amount }, 'Creating payment intent');

  const server = getHorizonServer();
  const sourceKeypair = Keypair.fromSecret(stellarConfig.stellarSecretKey);

  try {
    const account = await server.loadAccount(fromPublicKey);
    
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(
        Operation.payment({
          destination: toPublicKey,
          asset: Asset.native(),
          amount: amount,
        })
      )
      .setTimeout(300)
      .build();

    transaction.sign(sourceKeypair);

    const xdr = transaction.toXDR();
    const hash = transaction.hash().toString('hex');

    logger.info({ hash }, 'Payment intent created');

    return {
      xdr,
      hash,
      networkPassphrase: getNetworkPassphrase(),
      envelope: transaction.toEnvelope().toXDR('base64'),
    };
  } catch (error) {
    logger.error({ error, from: fromPublicKey, to: toPublicKey }, 'Failed to create intent');
    throw error;
  }
}

/**
 * Verify a transaction by hash
 */
export async function verifyIntent(hash: string) {
  logger.info({ hash }, 'Verifying transaction');

  const server = getHorizonServer();

  try {
    const transaction = await server.transactions().transaction(hash).call();
    
    logger.info({ hash, successful: transaction.successful }, 'Transaction verified');

    return {
      found: true,
      hash: transaction.hash,
      successful: transaction.successful,
      ledger: transaction.ledger_attr,
      createdAt: transaction.created_at,
    };
  } catch (error: any) {
    logger.error({ error, hash }, 'Failed to verify transaction');
    if (error.response?.status === 404) {
      return { found: false, error: 'Transaction not found' };
    }
    throw error;
  }
}

/**
 * Discover payment paths using strict-receive
 */
export async function findPaths(
  sourceAssetCode: string,
  sourceAssetIssuer: string | undefined,
  destinationAssetCode: string,
  destinationAssetIssuer: string | undefined,
  destinationAmount: string
) {
  const server = getHorizonServer();
  
  const destAsset = destinationAssetCode === 'XLM' 
    ? Asset.native() 
    : new Asset(destinationAssetCode, destinationAssetIssuer!);
    
  const sourceAssets = sourceAssetCode === 'XLM'
    ? [Asset.native()]
    : [new Asset(sourceAssetCode, sourceAssetIssuer!)];

  try {
    const paths = await server
      .strictReceivePaths(sourceAssets, destAsset, destinationAmount)
      .call();

    return paths.records.map((p: Horizon.ServerApi.PaymentPathRecord) => ({
      sourceAssetCode: p.source_asset_type === 'native' ? 'XLM' : p.source_asset_code,
      sourceAssetIssuer: p.source_asset_issuer,
      sourceAmount: p.source_amount,
      destinationAssetCode: p.destination_asset_type === 'native' ? 'XLM' : p.destination_asset_code,
      destinationAssetIssuer: p.destination_asset_issuer,
      destinationAmount: p.destination_amount,
      path: p.path.map((a: any) => a.asset_type === 'native' ? 'XLM' : a.asset_code),
    }));
  } catch (error: any) {
    logger.error({ error, sourceAssetCode, destinationAssetCode }, 'Failed to find paths');
    throw error;
  }
}

/**
 * Get order book for an asset pair
 */
export async function getOrderbook(
  baseAssetCode: string,
  baseAssetIssuer: string | undefined,
  counterAssetCode: string,
  counterAssetIssuer: string | undefined
) {
  const server = getHorizonServer();
  
  const base = baseAssetCode === 'XLM' ? Asset.native() : new Asset(baseAssetCode, baseAssetIssuer!);
  const counter = counterAssetCode === 'XLM' ? Asset.native() : new Asset(counterAssetCode, counterAssetIssuer!);

  try {
    const orderbook = await server.orderbook(base, counter).call();
    return {
      base: baseAssetCode,
      counter: counterAssetCode,
      bids: orderbook.bids.slice(0, 10),
      asks: orderbook.asks.slice(0, 10),
    };
  } catch (error: any) {
    logger.error({ error, baseAssetCode, counterAssetCode }, 'Failed to get orderbook');
    throw error;
  }
}
