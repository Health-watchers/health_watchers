import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppRole } from '@api/types/express';

const ACCESS_SECRET = process.env.JWT_ACCESS_TOKEN_SECRET || 'access-secret';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing token' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), ACCESS_SECRET) as {
      userId: string; role: AppRole; clinicId: string;
    };
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
  }
}

export function requireRoles(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
    }
    return next();
  };
}
