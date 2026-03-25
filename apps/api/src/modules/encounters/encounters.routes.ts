import { Router, Request, Response } from "express";

const router = Router();

// POST /api/v1/encounters
router.post("/", (_req: Request, res: Response) => {
  res.status(501).json({ message: "log encounter – not yet implemented" });
});

// GET /api/v1/encounters/:id
router.get("/:id", (_req: Request, res: Response) => {
  res.status(501).json({ message: "get encounter – not yet implemented" });
});

// GET /api/v1/encounters/patient/:patientId
router.get("/patient/:patientId", (_req: Request, res: Response) => {
  res.status(501).json({ message: "get patient encounters – not yet implemented" });
});

export default router;
