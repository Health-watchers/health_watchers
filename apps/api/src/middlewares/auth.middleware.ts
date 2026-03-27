import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '@api/modules/auth/token.service';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
  req.user = payload as typeof req.user;
  return next();
}
