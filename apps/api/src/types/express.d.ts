export type AppRole =
  | 'SUPER_ADMIN'
  | 'CLINIC_ADMIN'
  | 'DOCTOR'
  | 'NURSE'
  | 'ASSISTANT'
  | 'READ_ONLY'
  | 'PATIENT';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: AppRole;
        clinicId: string;
        patientId?: string;
      };
    }
  }
}

// Typed request helpers
import { Request } from 'express';
import { z } from 'zod';

export type TypedRequest<
  B = unknown,
  P = Record<string, string>,
  Q = Record<string, string>,
> = Request<P, unknown, B, Q>;
