import express, { Request, Response } from "express";
import { stellarConfig } from "./config";
import { assertMainnetSafety, assertTransactionLimit, TransactionLimitError } from "./guards";

// Safety check — exits with code 1 if mainnet is not explicitly confirmed
assertMainnetSafety();

const app = express();
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    network: stellarConfig.network,
    dryRun: stellarConfig.dryRun,
  });
});

// ── Friendbot / Fund ──────────────────────────────────────────────────────────
// Disabled on mainnet — friendbot only exists on testnet
app.post("/fund", (_req: Request, res: Response) => {
  if (stellarConfig.network === "mainnet") {
    return res.status(403).json({
      error: "FundbotDisabled",
      message: "The /fund endpoint is disabled on mainnet.",
    });
  }

  // Testnet: proxy to friendbot
  return res.json({ status: "ok", message: "Friendbot request would be sent (testnet)." });
});

// ── Send Payment ──────────────────────────────────────────────────────────────
app.post("/send", async (req: Request, res: Response) => {
  const { destination, amount } = req.body as { destination?: string; amount?: number };

  if (!destination || amount == null) {
    return res.status(400).json({ error: "BadRequest", message: "destination and amount are required" });
  }

  const amountXlm = Number(amount);
  if (isNaN(amountXlm) || amountXlm <= 0) {
    return res.status(400).json({ error: "BadRequest", message: "amount must be a positive number" });
  }

  try {
    assertTransactionLimit(amountXlm);
  } catch (err) {
    if (err instanceof TransactionLimitError) {
      return res.status(400).json({
        error: "TransactionLimitExceeded",
        message: err.message,
        limit: stellarConfig.maxTransactionXlm,
      });
    }
    throw err;
  }

  if (stellarConfig.dryRun) {
    console.log(`[DRY RUN] Would send ${amountXlm} XLM to ${destination}`);
    return res.json({ status: "dry-run", destination, amount: amountXlm });
  }

  // Real submission would happen here
  return res.json({ status: "ok", destination, amount: amountXlm });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(stellarConfig.port, () => {
  console.log(`stellar-service running on port ${stellarConfig.port} [${stellarConfig.network}]`);
  if (stellarConfig.dryRun) {
    console.log("  ⚠️  Dry-run mode active — no transactions will be submitted");
  }
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Shutdown timeout exceeded — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
