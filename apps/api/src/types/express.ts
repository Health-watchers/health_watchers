export type AppRole =
  | 'SUPER_ADMIN'
  | 'CLINIC_ADMIN'
  | 'DOCTOR'
  | 'NURSE'
  | 'ASSISTANT'
  | 'READ_ONLY'
  | 'PATIENT';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        id?: string;
        role: AppRole;
        clinicId: string;
        patientId?: string;
        isSuperAdmin?: boolean;
      };
      requestId?: string;
    }
  }
}
