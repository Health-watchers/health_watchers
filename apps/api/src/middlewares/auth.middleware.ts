import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../modules/auth/token.service";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({
        error: "Unauthorized",
        message: "Missing or invalid Authorization header",
      });
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res
      .status(401)
      .json({ error: "Unauthorized", message: "Invalid or expired token" });
  }

  req.user = payload;
  return next();
}
