import StellarSdk from "stellar-sdk";
import { stellarConfig } from "./config";

export type PaymentStreamHandler = (payment: {
  memo: string;
  txHash: string;
  amount: string;
  from: string;
}) => void;

/**
 * Streams incoming payments for the clinic's platform public key via Horizon.
 * Calls onPayment for each confirmed incoming payment.
 * Returns a close() function to stop the stream.
 */
export function startPaymentStream(onPayment: PaymentStreamHandler): () => void {
  if (!stellarConfig.platformPublicKey) {
    console.warn("[stellar-stream] STELLAR_PLATFORM_PUBLIC_KEY not set — stream disabled");
    return () => {};
  }

  const server = new StellarSdk.Horizon.Server(
    stellarConfig.network === "mainnet"
      ? "https://horizon.stellar.org"
      : "https://horizon-testnet.stellar.org",
  );

  console.log(
    `[stellar-stream] Listening for payments on ${stellarConfig.platformPublicKey} (${stellarConfig.network})`,
  );

  const close = server
    .payments()
    .forAccount(stellarConfig.platformPublicKey)
    .cursor("now")
    .stream({
      onmessage: async (record: any) => {
        // Only process incoming payment_operations
        if (record.type !== "payment" || record.to !== stellarConfig.platformPublicKey) return;

        try {
          const tx = await record.transaction();
          const memo = tx.memo ?? "";
          onPayment({
            memo,
            txHash: record.transaction_hash,
            amount: record.amount,
            from:   record.from,
          });
        } catch (err) {
          console.error("[stellar-stream] Failed to fetch transaction for payment", err);
        }
      },
      onerror: (err: unknown) => {
        console.error("[stellar-stream] Stream error", err);
      },
    });

  return close as () => void;
}
