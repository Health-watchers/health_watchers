import { stellarConfig } from "./config";

/**
 * Run at startup. Exits with code 1 if mainnet is configured without
 * the explicit confirmation flag.
 */
export function assertMainnetSafety(): void {
  const { network, mainnetConfirmed, dryRun } = stellarConfig;

  if (network === "mainnet") {
    // Prominent warning regardless
    console.warn("⚠️  ============================================================");
    console.warn("⚠️  STELLAR_NETWORK=mainnet — REAL XLM WILL BE USED");
    console.warn("⚠️  ============================================================");

    if (!mainnetConfirmed) {
      console.error(
        "❌  STELLAR_MAINNET_CONFIRMED is not set to 'true'.\n" +
        "    Set STELLAR_MAINNET_CONFIRMED=true to acknowledge mainnet operation.\n" +
        "    Exiting to prevent accidental real-funds usage."
      );
      process.exit(1);
    }

    if (dryRun) {
      console.warn("⚠️  STELLAR_DRY_RUN=true — transactions will be simulated, not submitted.");
    }
  }
}

/**
 * Throws if the given XLM amount exceeds the configured per-transaction limit.
 */
export function assertTransactionLimit(amountXlm: number): void {
  const { maxTransactionXlm } = stellarConfig;
  if (amountXlm > maxTransactionXlm) {
    throw new TransactionLimitError(amountXlm, maxTransactionXlm);
  }
}

export class TransactionLimitError extends Error {
  constructor(requested: number, limit: number) {
    super(`Transaction amount ${requested} XLM exceeds limit of ${limit} XLM`);
    this.name = "TransactionLimitError";
  }
}
