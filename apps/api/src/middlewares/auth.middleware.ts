import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../modules/auth/token.service';
import { AppRole } from '../types/express';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }

  req.user = {
    userId: payload.userId,
    role: payload.role as AppRole,
    clinicId: payload.clinicId,
    patientId: payload.patientId,
  };
  return next();
}

export function requireRoles(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }
    return next();
  };
}
