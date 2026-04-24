export const queryKeys = {
  patients: {
    all: ['patients'] as const,
    list: (query?: string) => [...queryKeys.patients.all, 'list', query] as const,
    detail: (id: string) => [...queryKeys.patients.all, 'detail', id] as const,
  },
  encounters: {
    all: ['encounters'] as const,
    list: () => [...queryKeys.encounters.all, 'list'] as const,
    byPatient: (patientId: string) => [...queryKeys.encounters.all, 'patient', patientId] as const,
  },
  payments: {
    all: ['payments'] as const,
    list: () => [...queryKeys.payments.all, 'list'] as const,
    byPatient: (patientId: string) => [...queryKeys.payments.all, 'patient', patientId] as const,
  },
  wallet: {
    all: ['wallet'] as const,
    balance: () => [...queryKeys.wallet.all, 'balance'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (page?: number) => [...queryKeys.notifications.all, 'list', page] as const,
    unreadCount: () => [...queryKeys.notifications.all, 'unread-count'] as const,
  labResults: {
    all: ['lab-results'] as const,
    byPatient: (patientId: string) => [...queryKeys.labResults.all, 'patient', patientId] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    list: () => [...queryKeys.invoices.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.invoices.all, 'detail', id] as const,
  },
} as const;
