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
  labResults: {
    all: ['lab-results'] as const,
    byPatient: (patientId: string) => [...queryKeys.labResults.all, 'patient', patientId] as const,
  },
} as const;
