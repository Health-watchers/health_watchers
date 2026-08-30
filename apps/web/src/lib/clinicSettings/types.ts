/**
 * Types for the clinic configuration interface.
 */

export interface ClinicProfile {
  name: string;
  legalName?: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
  logoUrl?: string;
}

export interface BusinessHoursEntry {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  open: string; // "HH:mm"
  close: string;
  closed: boolean;
}

export interface ProviderEntry {
  id: string;
  name: string;
  specialty: string;
  npi?: string;
  active: boolean;
}

export interface DepartmentEntry {
  id: string;
  name: string;
  specialty?: string;
  headProviderId?: string;
}

export interface FacilitySettings {
  roomsCount: number;
  maxDailyAppointments: number;
  telehealthEnabled: boolean;
  walkInsAllowed: boolean;
}

export interface ClosureDate {
  id: string;
  date: string;
  reason: string;
  recurringYearly: boolean;
}

export interface NotificationPreferences {
  appointmentReminders: boolean;
  reminderLeadHours: number;
  smsEnabled: boolean;
  emailEnabled: boolean;
  staffAlerts: boolean;
}

export interface BrandingSettings {
  primaryColor: string;
  secondaryColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
}

export interface SecurityPolicy {
  mfaRequired: boolean;
  sessionTimeoutMinutes: number;
  passwordMinLength: number;
  passwordRequiresSymbol: boolean;
  ipAllowList: string[];
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  previousValue?: unknown;
  newValue?: unknown;
}

export interface ClinicConfiguration {
  profile: ClinicProfile;
  businessHours: BusinessHoursEntry[];
  providers: ProviderEntry[];
  departments: DepartmentEntry[];
  facility: FacilitySettings;
  closureDates: ClosureDate[];
  notifications: NotificationPreferences;
  branding: BrandingSettings;
  security: SecurityPolicy;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursEntry[] = (
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
).map((day) => ({
  day,
  open: '09:00',
  close: '17:00',
  closed: day === 'sat' || day === 'sun',
}));
