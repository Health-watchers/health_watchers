import { Router, Request, Response } from "express";

const router = Router();

// POST /api/v1/auth/register
router.post("/register", (_req: Request, res: Response) => {
  res.status(501).json({ message: "register – not yet implemented" });
});

// POST /api/v1/auth/login
router.post("/login", (_req: Request, res: Response) => {
  res.status(501).json({ message: "login – not yet implemented" });
});

export default router;
