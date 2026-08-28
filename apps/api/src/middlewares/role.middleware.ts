import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export type UserRole = 'admin' | 'doctor' | 'staff' | 'patient' | 'clinic_manager';

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      logger.warn({ path: req.path }, '[role-middleware] User not authenticated');
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    const userRole = (req.user.role as UserRole) || 'patient';
    if (!allowedRoles.includes(userRole)) {
      logger.warn(
        { userId: req.user.userId, userRole, allowedRoles, path: req.path },
        '[role-middleware] User role not authorized'
      );
      res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
