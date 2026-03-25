import { RequestHandler } from 'express';
import { verifyAccessToken } from '@api/modules/auth/token.service';

export enum Roles {
  SUPER_ADMIN  = 'SUPER_ADMIN',
  CLINIC_ADMIN = 'CLINIC_ADMIN',
  DOCTOR       = 'DOCTOR',
  NURSE        = 'NURSE',
  ASSISTANT    = 'ASSISTANT',
  READ_ONLY    = 'READ_ONLY',
}

const ROLE_SET = new Set(Object.values(Roles));

const getBearerToken = (auth: unknown): string | null => {
  if (typeof auth !== 'string') return null;
  const [scheme, token] = auth.split(' ');
  return scheme === 'Bearer' && token ? token : null;
};

export const authorize = (allowedRoles: Roles[]): RequestHandler => (req, res, next) => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });

  const user = verifyAccessToken(token);
  if (!user || !ROLE_SET.has(user.role as Roles))
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });

  req.user = user;
  if (!allowedRoles.includes(user.role as Roles))
    return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });

  return next();
};
