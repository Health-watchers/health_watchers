import { Router, Request, Response } from "express";

const router = Router();

// POST /api/v1/patients
router.post("/", (_req: Request, res: Response) => {
  res.status(501).json({ message: "create patient – not yet implemented" });
});

// GET /api/v1/patients/:id
router.get("/:id", (_req: Request, res: Response) => {
  res.status(501).json({ message: "get patient – not yet implemented" });
});

export default router;
