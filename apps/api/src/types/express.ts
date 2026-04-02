export type AppRole =
  | 'SUPER_ADMIN'
  | 'CLINIC_ADMIN'
  | 'DOCTOR'
  | 'NURSE'
  | 'ASSISTANT'
  | 'READ_ONLY';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: AppRole; clinicId: string };
    }
  }
}
