import express, { Request, Response } from "express";
import { stellarConfig } from "./config";
import { assertMainnetSafety, assertTransactionLimit, TransactionLimitError } from "./guards";
import { startPaymentStream } from "./payment-stream";

// Safety check — exits with code 1 if mainnet is not explicitly confirmed
assertMainnetSafety();

const app = express();
app.use(express.json());

const API_WEBHOOK_URL = process.env.API_WEBHOOK_URL || "http://localhost:3001/api/v1/webhooks/stellar";

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    network: stellarConfig.network,
    dryRun: stellarConfig.dryRun,
  });
});

// ── Friendbot / Fund ──────────────────────────────────────────────────────────
app.post("/fund", (_req: Request, res: Response) => {
  if (stellarConfig.network === "mainnet") {
    return res.status(403).json({
      error: "FundbotDisabled",
      message: "The /fund endpoint is disabled on mainnet.",
    });
  }
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

  return res.json({ status: "ok", destination, amount: amountXlm });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(stellarConfig.port, () => {
  console.log(`stellar-service running on port ${stellarConfig.port} [${stellarConfig.network}]`);
  if (stellarConfig.dryRun) {
    console.log("  ⚠️  Dry-run mode active — no transactions will be submitted");
  }
});

// Start Horizon payment stream — forwards confirmed payments to the API webhook
const stopStream = startPaymentStream(async (payment) => {
  try {
    await fetch(API_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payment),
    });
  } catch (err) {
    console.error("[stellar-stream] Failed to forward payment to API webhook", err);
  }
});

function shutdown(signal: string) {
  console.log(`[stellar-service] ${signal} received — shutting down`);
  stopStream();
  server.close(() => {
    console.log("[stellar-service] HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
