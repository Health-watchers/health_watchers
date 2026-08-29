import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePatientDetail, useAllergyForm, useAiSummary } from './usePatientDetail';

// Mock modules
jest.mock('@/lib/api', () => ({ API_V1: 'http://localhost:3001/api/v1' }));
jest.mock('@/lib/queryKeys', () => ({
  queryKeys: {
    patients: { detail: (id: string) => ['patients', id] },
    encounters: { byPatient: (id: string) => ['encounters', id] },
    payments: { byPatient: (id: string) => ['payments', id] },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function mockFetchRouter(url: string) {
  if (
    url.includes('/patients/') &&
    !url.includes('/vitals') &&
    !url.includes('/analytics') &&
    !url.includes('/allergies') &&
    !url.includes('/encounters') &&
    !url.includes('/payments')
  ) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            _id: 'p1',
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: '1990-01-01',
            sex: 'M',
            systemId: 'SYS-001',
          },
        }),
    });
  }
  if (url.includes('/encounters/patient/')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 'e1',
              patientId: 'p1',
              chiefComplaint: 'Headache',
              status: 'open',
              createdAt: '2024-01-01',
            },
          ],
        }),
    });
  }
  if (url.includes('/payments')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [{ id: 'pay1', amount: '100', status: 'confirmed' }],
        }),
    });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: [] }),
  });
}

// ── usePatientDetail ─────────────────────────────────────────────────────────
describe('usePatientDetail', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(mockFetchRouter) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches patient data successfully', async () => {
    const { result } = renderHook(() => usePatientDetail('p1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.patientLoading).toBe(false);
    });

    expect(result.current.patient).toBeDefined();
    expect(result.current.patient?.firstName).toBe('John');
  });

  it('fetches encounters for the patient', async () => {
    const { result } = renderHook(() => usePatientDetail('p1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.encountersLoading).toBe(false);
    });

    expect(result.current.encounters).toHaveLength(1);
    expect(result.current.encounters[0].chiefComplaint).toBe('Headache');
  });

  it('fetches payments for the patient', async () => {
    const { result } = renderHook(() => usePatientDetail('p1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.paymentsLoading).toBe(false);
    });

    expect(result.current.payments).toHaveLength(1);
    expect(result.current.payments[0].amount).toBe('100');
  });

  it('handles 404 error for patient', async () => {
    global.fetch = jest.fn((url: string) => {
      if (
        url.includes('/patients/') &&
        !url.includes('/vitals') &&
        !url.includes('/analytics') &&
        !url.includes('/allergies') &&
        !url.includes('/encounters') &&
        !url.includes('/payments')
      ) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      });
    }) as any;

    const { result } = renderHook(() => usePatientDetail('nonexistent'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.patientLoading).toBe(false);
    });

    expect(result.current.patientError).toBeDefined();
    expect((result.current.patientError as Error).message).toBe('404');
  });

  it('provides invalidation functions', async () => {
    const { result } = renderHook(() => usePatientDetail('p1'), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.invalidatePatient).toBe('function');
    expect(typeof result.current.invalidateEncounters).toBe('function');
    expect(typeof result.current.invalidatePayments).toBe('function');
  });

  it('returns empty arrays when data fetching fails for encounters', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/encounters/patient/')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        });
      }
      return mockFetchRouter(url);
    }) as any;

    const { result } = renderHook(() => usePatientDetail('p1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.encountersLoading).toBe(false);
    });

    expect(result.current.encountersError).toBeDefined();
  });
});

// ── useAllergyForm ──────────────────────────────────────────────────────────
describe('useAllergyForm', () => {
  it('initializes with default form values', () => {
    const refetch = jest.fn();
    const { result } = renderHook(() => useAllergyForm('p1', refetch));

    expect(result.current.showAllergyForm).toBe(false);
    expect(result.current.allergyForm).toEqual({
      allergen: '',
      allergenType: 'drug',
      reaction: '',
      severity: 'mild',
    });
    expect(result.current.allergySubmitting).toBe(false);
  });

  it('provides form state setters', () => {
    const refetch = jest.fn();
    const { result } = renderHook(() => useAllergyForm('p1', refetch));

    expect(typeof result.current.setShowAllergyForm).toBe('function');
    expect(typeof result.current.setAllergyForm).toBe('function');
    expect(typeof result.current.handleAddAllergy).toBe('function');
  });

  it('can toggle allergy form visibility', () => {
    const refetch = jest.fn();
    const { result } = renderHook(() => useAllergyForm('p1', refetch));

    act(() => {
      result.current.setShowAllergyForm(true);
    });

    expect(result.current.showAllergyForm).toBe(true);

    act(() => {
      result.current.setShowAllergyForm(false);
    });

    expect(result.current.showAllergyForm).toBe(false);
  });

  it('can update form fields', () => {
    const refetch = jest.fn();
    const { result } = renderHook(() => useAllergyForm('p1', refetch));

    act(() => {
      result.current.setAllergyForm((f) => ({ ...f, allergen: 'Penicillin' }));
    });

    expect(result.current.allergyForm.allergen).toBe('Penicillin');
  });
});

// ── useAiSummary ────────────────────────────────────────────────────────────
describe('useAiSummary', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('initializes with null summary and no loading', () => {
    const encounters = [
      {
        id: 'e1',
        patientId: 'p1',
        chiefComplaint: 'Test',
        status: 'open',
        createdAt: '2024-01-01',
      },
    ];
    const { result } = renderHook(() => useAiSummary(encounters));

    expect(result.current.aiSummary).toBeNull();
    expect(result.current.aiLoading).toBe(false);
    expect(result.current.aiLastRun).toBeNull();
  });

  it('provides handleGenerateAI function', () => {
    const encounters = [
      {
        id: 'e1',
        patientId: 'p1',
        chiefComplaint: 'Test',
        status: 'open',
        createdAt: '2024-01-01',
      },
    ];
    const { result } = renderHook(() => useAiSummary(encounters));

    expect(typeof result.current.handleGenerateAI).toBe('function');
  });

  it('does nothing when encounters is empty', async () => {
    const mockFn = jest.fn();
    global.fetch = mockFn as any;

    const { result } = renderHook(() => useAiSummary([]));

    await act(async () => {
      await result.current.handleGenerateAI();
    });

    expect(mockFn).not.toHaveBeenCalled();
  });

  it('sets aiSummary on successful generation', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ summary: 'Patient has mild headache.' }),
      })
    ) as any;

    const encounters = [
      {
        id: 'e1',
        patientId: 'p1',
        chiefComplaint: 'Headache',
        status: 'open',
        createdAt: '2024-01-01',
      },
    ];
    const { result } = renderHook(() => useAiSummary(encounters));

    await act(async () => {
      await result.current.handleGenerateAI();
    });

    expect(result.current.aiSummary).toBe('Patient has mild headache.');
    expect(result.current.aiLastRun).not.toBeNull();
    expect(result.current.aiLoading).toBe(false);
  });

  it('sets error toast on failed generation', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ message: 'AI service unavailable' }),
      })
    ) as any;

    const encounters = [
      {
        id: 'e1',
        patientId: 'p1',
        chiefComplaint: 'Headache',
        status: 'open',
        createdAt: '2024-01-01',
      },
    ];
    const { result } = renderHook(() => useAiSummary(encounters));

    await act(async () => {
      await result.current.handleGenerateAI();
    });

    expect(result.current.toast).toEqual({
      message: 'AI service unavailable',
      type: 'error',
    });
    expect(result.current.aiLoading).toBe(false);
  });
});
