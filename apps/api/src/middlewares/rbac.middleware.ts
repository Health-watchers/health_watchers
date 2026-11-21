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
  MEDICAL_DIRECTOR: 'MEDICAL_DIRECTOR' as AppRole,
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

/**
 * Roles permitted to author (create/update/delete) CDS rules.
 * `admin` is represented by SUPER_ADMIN and CLINIC_ADMIN; `medical_director`
 * is represented by the MEDICAL_DIRECTOR role.
 */
export const CDS_RULE_AUTHOR_ROLES: AppRole[] = [
  Roles.SUPER_ADMIN,
  Roles.CLINIC_ADMIN,
  Roles.MEDICAL_DIRECTOR,
];

/**
 * Guard for CDS rule mutation routes. Only admins (SUPER_ADMIN / CLINIC_ADMIN)
 * and medical directors may create, update, or delete CDS rules.
 */
export const requireCdsRuleAuthor = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!CDS_RULE_AUTHOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return next();
};