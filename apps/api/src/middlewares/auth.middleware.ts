import { Request, Response, NextFunction } from 'express';
import { verifyAccessTokenAsync } from '../modules/auth/token.service';
import { AppRole } from '../types/express';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7);
  const payload = await verifyAccessTokenAsync(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }

  req.user = {
    userId: payload.userId,
    role: payload.role as AppRole,
    clinicId: payload.clinicId,
    patientId: payload.patientId,
    isSuperAdmin: payload.isSuperAdmin ?? payload.role === 'SUPER_ADMIN',
  };
  req.tokenJti = payload.jti;
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
