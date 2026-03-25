import { Router, Request, Response } from "express";

const router = Router();

// POST /api/v1/payments/intent  – generate a Stellar payment request
router.post("/intent", (_req: Request, res: Response) => {
  res.status(501).json({ message: "payment intent – not yet implemented" });
});

// POST /api/v1/payments/confirm – verify on-chain Stellar transaction
router.post("/confirm", (_req: Request, res: Response) => {
  res.status(501).json({ message: "payment confirm – not yet implemented" });
});

export default router;
