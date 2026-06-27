import { Request, Response, NextFunction } from 'express';
import { AppRole } from '@api/types/express';

export const Roles = {
  PATIENT: 'PATIENT' as AppRole,
  READ_ONLY: 'READ_ONLY' as AppRole,
  ASSISTANT: 'ASSISTANT' as AppRole,
  NURSE: 'NURSE' as AppRole,
  DOCTOR: 'DOCTOR' as AppRole,
  CLINIC_ADMIN: 'CLINIC_ADMIN' as AppRole,
  SUPER_ADMIN: 'SUPER_ADMIN' as AppRole,
};

export const authorize = (allowedRoles: AppRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return next();
  };
};
