// ── Existing domains ──────────────────────────────────────────────────────────
export { usePatients } from './usePatients';
export { useEncounters, type Encounter } from './useEncounters';
export { useEncounter, type EncounterDetails } from './useEncounter';
export { usePayments, type Payment } from './usePayments';
export { useStaffList, type StaffFilters } from './useStaff';
export { usePatientCommunications, useLogCommunication } from './useCommunications';
export { usePreAuths, usePreAuth, useCreatePreAuth, useApprovePreAuth } from './usePreAuth';

// ── New domains (Issue #1422) ─────────────────────────────────────────────────
export {
  useAppointments,
  useCreateAppointment,
  useUpdateAppointmentStatus,
  type Appointment,
  type AppointmentFilters,
  type AppointmentDraft,
} from './useAppointments';

export {
  useImmunizationRecords,
  useUpcomingVaccines,
  useCreateImmunization,
  type ImmunizationRecord,
  type UpcomingVaccine,
} from './useImmunizations';

export {
  useReferrals,
  useCreateReferral,
  useUpdateReferralStatus,
  type Referral,
  type ReferralDraft,
} from './useReferrals';

export {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type AppNotification,
} from './useNotifications';

export { useInvoices, useSendInvoice, type Invoice } from './useInvoices';

export { useWalletBalance, useWalletSnapshots } from './useWallet';

// ── Research Exports (Issue #1423) ────────────────────────────────────────────
export {
  useResearchExports,
  useResearchExportJob,
  useRequestResearchExport,
  type ExportJob,
  type ExportRequest,
  type AnonymizationLevel,
} from './useResearchExports';
