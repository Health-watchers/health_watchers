import { UnrecognizedTransactionModel } from './unrecognized-transaction.model';

interface StellarTx {
  hash: string;
  from: string;
  to: string;
  amount: string;
  asset: string;
}

export async function detectUnrecognizedTransactions(
  incomingTxs: StellarTx[],
  knownTxHashes: Set<string>,
  clinicId: string,
): Promise<StellarTx[]> {
  const unrecognized = incomingTxs.filter((tx) => !knownTxHashes.has(tx.hash));

  for (const tx of unrecognized) {
    await UnrecognizedTransactionModel.findOneAndUpdate(
      { stellarTxHash: tx.hash },
      {
        stellarTxHash: tx.hash,
        fromAddress: tx.from,
        toAddress: tx.to,
        amount: tx.amount,
        asset: tx.asset,
        detectedAt: new Date(),
        clinicId,
      },
      { upsert: true, new: true },
    );
  }

  return unrecognized;
}

export async function getUnrecognizedTransactions(clinicId: string) {
  return UnrecognizedTransactionModel.find({ clinicId, resolved: false }).sort({
    detectedAt: -1,
  });
}
