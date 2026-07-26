export type AppRole =
  | 'SUPER_ADMIN'
  | 'CLINIC_ADMIN'
  | 'ADMIN'
  | 'DOCTOR'
  | 'NURSE'
  | 'ASSISTANT'
  | 'READ_ONLY'
  | 'PATIENT';

export interface AuthenticatedUser {
  userId: string;
  id?: string;
  role: AppRole;
  clinicId: string;
  patientId?: string;
  isSuperAdmin?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
      tokenJti?: string;
      apiKey?: {
        id: string;
        userId: string;
        clinicId: string;
        scopes: string[];
      };
    }
  }
}
