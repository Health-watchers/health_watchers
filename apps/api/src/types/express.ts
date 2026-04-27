export type AppRole =
  | 'SUPER_ADMIN'
  | 'CLINIC_ADMIN'
  | 'DOCTOR'
  | 'NURSE'
  | 'ASSISTANT'
  | 'READ_ONLY';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { userId: string; role: AppRole; clinicId: string };
    }
  }
}
