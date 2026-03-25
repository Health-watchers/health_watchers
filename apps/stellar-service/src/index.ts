import { config } from "@health-watchers/config";
import { Horizon, Keypair, TransactionBuilder, Operation, Asset, BASE_FEE } from "@stellar/stellar-sdk";
import express, { Request, Response } from "express";
import fetch from "node-fetch";

const horizon = new Horizon.Server(config.stellarHorizonUrl);
const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "health-watchers-stellar-service" });
});

app.post("/fund", async (req: Request, res: Response) => {
  const { publicKey } = req.body;
  if (!publicKey) return res.status(400).json({ error: "publicKey required" });
  try {
    const response = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
    const data = await response.json();
    res.json({ success: true, data });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

app.post("/intent", async (req: Request, res: Response) => {
  const { fromSecret, toPublic, amount, assetCode = "XLM", issuer } = req.body;
  if (!fromSecret || !toPublic || !amount) return res.status(400).json({ error: "fromSecret, toPublic, amount required" });
  
  try {
    const fromKeypair = Keypair.fromSecret(fromSecret);
    const account = await horizon.loadAccount(fromKeypair.publicKey());
    const asset = issuer ? new Asset(assetCode, issuer) : Asset.native();
    
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE.toString(),
      networkPassphrase: config.stellarNetwork === "mainnet" ? "Public Global Stellar Network ; September 2015" : "Test SDF Network ; September 2015",
    })
      .addOperation(Operation.payment({ destination: toPublic, asset, amount: amount.toString() }))
      .setTimeout(30)
      .build();
    
    tx.sign(fromKeypair);
    const result = await horizon.submitTransaction(tx);
    res.json({ success: true, transactionHash: result.hash });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

app.get("/verify/:hash", async (req: Request, res: Response) => {
  const { hash } = req.params;
  try {
    const tx = await horizon.transactions().transaction(hash).call();
    res.json({ success: true, transaction: tx });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(404).json({ error: "Transaction not found: " + err.message });
  }
});

const port = process.env.STELLAR_SERVICE_PORT || process.env.STELLAR_PORT || 3002;
app.listen(Number(port), () => {
  console.log(`Health Watchers Stellar Service on port ${port}, network: ${config.stellarNetwork}`);
});

