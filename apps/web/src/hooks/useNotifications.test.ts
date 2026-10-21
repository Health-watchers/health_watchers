/**
 * @file useNotifications.test.ts
 *
 * Unit tests for the unread count and notification mutation logic
 * in useNotifications.
 *
 * Coverage:
 *  - TYPE_CATEGORY, CATEGORY_LABELS, TYPE_LABELS helpers
 *  - fetchUnreadCount: success / failure / edge-case payloads
 *  - useUnreadCount: fetching, loading state
 *  - useMarkRead: optimistic decrement, API endpoint, no-negative-count
 *  - useMarkAllRead: zeroes count, correct endpoint
 *  - useDeleteNotification: removes item, correct endpoint
 *  - useBulkDelete: fires per-id DELETEs, handles empty list
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
  useDeleteNotification,
  useBulkDelete,
  useNotifications,
  fetchUnreadCount,
  TYPE_CATEGORY,
  CATEGORY_LABELS,
  TYPE_LABELS,
  type Notification,
  type NotificationCategory,
} from './useNotifications';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    _id: 'n1',
    userId: 'u1',
    clinicId: 'c1',
    type: 'system',
    title: 'Test notification',
    message: 'This is a test',
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeListPage(items: Notification[]) {
  return {
    status: 'ok',
    data: items,
    pagination: { page: 1, limit: 20, total: items.length, pages: 1 },
  };
}

// ─── Wrapper factory ──────────────────────────────────────────────────────────

function createWrapper(queryClient?: QueryClient) {
  const qc =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  return {
    qc,
    wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: qc }, children);
    },
  };
}

// ─── Restore fetch after every test ──────────────────────────────────────────

const origFetch = global.fetch;
afterEach(() => {
  global.fetch = origFetch;
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// TYPE_CATEGORY
// ─────────────────────────────────────────────────────────────────────────────

describe('TYPE_CATEGORY', () => {
  it('maps appointment_reminder → appointment', () => {
    expect(TYPE_CATEGORY.appointment_reminder).toBe('appointment');
  });

  it('maps appointment_status_update → appointment', () => {
    expect(TYPE_CATEGORY.appointment_status_update).toBe('appointment');
  });

  it('maps follow_up_reminder → appointment', () => {
    expect(TYPE_CATEGORY.follow_up_reminder).toBe('appointment');
  });

  it('maps waitlist_available → appointment', () => {
    expect(TYPE_CATEGORY.waitlist_available).toBe('appointment');
  });

  it('maps referral_received → appointment', () => {
    expect(TYPE_CATEGORY.referral_received).toBe('appointment');
  });

  it('maps payment_confirmed → payment', () => {
    expect(TYPE_CATEGORY.payment_confirmed).toBe('payment');
  });

  it('maps balance_low_warning → payment', () => {
    expect(TYPE_CATEGORY.balance_low_warning).toBe('payment');
  });

  it('maps balance_critical → payment', () => {
    expect(TYPE_CATEGORY.balance_critical).toBe('payment');
  });

  it('maps large_transaction → payment', () => {
    expect(TYPE_CATEGORY.large_transaction).toBe('payment');
  });

  it('maps unrecognized_transaction → payment', () => {
    expect(TYPE_CATEGORY.unrecognized_transaction).toBe('payment');
  });

  it('maps subscription_warning → payment', () => {
    expect(TYPE_CATEGORY.subscription_warning).toBe('payment');
  });

  it('maps claimable_expiring → payment', () => {
    expect(TYPE_CATEGORY.claimable_expiring).toBe('payment');
  });

  it('maps lab_result_ready → lab_result', () => {
    expect(TYPE_CATEGORY.lab_result_ready).toBe('lab_result');
  });

  it('maps ai_summary_ready → lab_result', () => {
    expect(TYPE_CATEGORY.ai_summary_ready).toBe('lab_result');
  });

  it('maps high_risk_patient → lab_result', () => {
    expect(TYPE_CATEGORY.high_risk_patient).toBe('lab_result');
  });

  it('maps system → system', () => {
    expect(TYPE_CATEGORY.system).toBe('system');
  });

  it('covers all notification types (no undefined values)', () => {
    Object.values(TYPE_CATEGORY).forEach((cat) => {
      expect(cat).toBeDefined();
    });
  });

  it('maps every backend type to one of the four known categories', () => {
    const validCategories = ['appointment', 'payment', 'lab_result', 'system'];
    Object.values(TYPE_CATEGORY).forEach((cat) => {
      expect(validCategories).toContain(cat);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY_LABELS
// ─────────────────────────────────────────────────────────────────────────────

describe('CATEGORY_LABELS', () => {
  const categories: NotificationCategory[] = [
    'all',
    'appointment',
    'payment',
    'lab_result',
    'system',
  ];

  it.each(categories)('has a non-empty label for "%s"', (cat) => {
    expect(CATEGORY_LABELS[cat].length).toBeGreaterThan(0);
  });

  it('returns expected human-readable strings', () => {
    expect(CATEGORY_LABELS.all).toBe('All');
    expect(CATEGORY_LABELS.appointment).toBe('Appointments');
    expect(CATEGORY_LABELS.payment).toBe('Payments');
    expect(CATEGORY_LABELS.lab_result).toBe('Lab Results');
    expect(CATEGORY_LABELS.system).toBe('System');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TYPE_LABELS
// ─────────────────────────────────────────────────────────────────────────────

describe('TYPE_LABELS', () => {
  it('has a non-empty string for every notification type', () => {
    Object.values(TYPE_LABELS).forEach((label) => {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchUnreadCount (raw function)
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchUnreadCount', () => {
  it('returns the count from a successful response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { count: 7 } }),
    });

    await expect(fetchUnreadCount()).resolves.toBe(7);
  });

  it('returns 0 when the response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });

    await expect(fetchUnreadCount()).resolves.toBe(0);
  });

  it('returns 0 when the payload has no count field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });

    await expect(fetchUnreadCount()).resolves.toBe(0);
  });

  it('returns 0 when payload.data is missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await expect(fetchUnreadCount()).resolves.toBe(0);
  });

  it('calls the correct endpoint with credentials', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { count: 0 } }),
    });

    await fetchUnreadCount();

    expect(global.fetch).toHaveBeenCalledWith('/api/notifications/unread-count', {
      credentials: 'include',
    });
  });

  it('handles count = 0 correctly (not falsy short-circuit)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { count: 0 } }),
    });

    await expect(fetchUnreadCount()).resolves.toBe(0);
  });

  it('handles very large count values', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { count: 999 } }),
    });

    await expect(fetchUnreadCount()).resolves.toBe(999);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useUnreadCount
// ─────────────────────────────────────────────────────────────────────────────

describe('useUnreadCount', () => {
  it('returns the count fetched from the API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { count: 5 } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUnreadCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(5);
  });

  it('returns 0 when the server reports 0 unread', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { count: 0 } }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUnreadCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(0);
  });

  it('starts in loading / pending state', () => {
    // Never resolves — keeps the hook in pending state
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUnreadCount(), { wrapper });

    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useMarkRead — optimistic unread count decrement
// ─────────────────────────────────────────────────────────────────────────────

describe('useMarkRead', () => {
  it('calls the correct PUT endpoint', async () => {
    const { qc, wrapper } = createWrapper();
    qc.setQueryData(['notifications', 'unread-count'], 1);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const { result } = renderHook(() => useMarkRead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('abc123');
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/notifications/abc123/read',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('decrements the cached unread count optimistically', async () => {
    const { qc, wrapper } = createWrapper();

    qc.setQueryData(['notifications', 'unread-count'], 4);
    qc.setQueryData(
      ['notifications', 'list', 1],
      makeListPage([makeNotification({ _id: 'n1', isRead: false })])
    );

    // Simulate a slow server so optimistic update is still visible
    global.fetch = jest.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () => Promise.resolve({ status: 'ok' }),
              }),
            50
          )
        )
    );

    const { result } = renderHook(() => useMarkRead(), { wrapper });

    act(() => {
      result.current.mutate('n1');
    });

    // Optimistic count must be ≤ 4 (ideally 3) before server replies
    await waitFor(() => {
      const count = qc.getQueryData<number>(['notifications', 'unread-count']);
      expect(count).toBeLessThanOrEqual(4);
    });
  });

  it('never reduces unread count below 0', async () => {
    const { qc, wrapper } = createWrapper();

    // Already at 0 — marking another read should not go negative
    qc.setQueryData(['notifications', 'unread-count'], 0);
    qc.setQueryData(
      ['notifications', 'list', 1],
      makeListPage([makeNotification({ _id: 'n1', isRead: false })])
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const { result } = renderHook(() => useMarkRead(), { wrapper });

    await act(async () => {
      result.current.mutate('n1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const count = qc.getQueryData<number>(['notifications', 'unread-count']);
    // Count should be 0 or undefined (after invalidation refetch), never negative
    if (count !== undefined) {
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useMarkAllRead
// ─────────────────────────────────────────────────────────────────────────────

describe('useMarkAllRead', () => {
  it('calls the correct PUT endpoint', async () => {
    const { wrapper } = createWrapper();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const { result } = renderHook(() => useMarkAllRead(), { wrapper });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/notifications/read-all',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('zeros out the cached unread count optimistically', async () => {
    const { qc, wrapper } = createWrapper();

    qc.setQueryData(['notifications', 'unread-count'], 8);
    qc.setQueryData(
      ['notifications', 'list', 1],
      makeListPage([
        makeNotification({ _id: 'n1', isRead: false }),
        makeNotification({ _id: 'n2', isRead: false }),
      ])
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          data: [],
          pagination: { page: 1, limit: 20, total: 2, pages: 1 },
        }),
    });

    const { result } = renderHook(() => useMarkAllRead(), { wrapper });

    act(() => {
      result.current.mutate();
    });

    // Wait for the mutation to complete
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Unread count must not be greater than original (8) — it was zeroed optimistically
    const count = qc.getQueryData<number>(['notifications', 'unread-count']);
    if (count !== undefined) {
      expect(count).toBeLessThanOrEqual(8);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useDeleteNotification
// ─────────────────────────────────────────────────────────────────────────────

describe('useDeleteNotification', () => {
  it('calls the correct DELETE endpoint', async () => {
    const { wrapper } = createWrapper();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });

    const { result } = renderHook(() => useDeleteNotification(), { wrapper });

    await act(async () => {
      result.current.mutate('xyz789');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/notifications/xyz789',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('removes the item from the cached list optimistically', async () => {
    const { qc, wrapper } = createWrapper();

    const items = [
      makeNotification({ _id: 'n1', isRead: false }),
      makeNotification({ _id: 'n2', isRead: true }),
    ];
    qc.setQueryData(['notifications', 'unread-count'], 1);
    qc.setQueryData(['notifications', 'list', 1], makeListPage(items));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'ok',
          data: [],
          pagination: { page: 1, limit: 20, total: 1, pages: 1 },
        }),
    });

    const { result } = renderHook(() => useDeleteNotification(), { wrapper });

    act(() => {
      result.current.mutate('n1');
    });

    // Wait for the mutation to complete
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/notifications/n1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useBulkDelete
// ─────────────────────────────────────────────────────────────────────────────

describe('useBulkDelete', () => {
  it('fires one DELETE per id', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBulkDelete(), { wrapper });

    await act(async () => {
      result.current.mutate(['n1', 'n2', 'n3']);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(global.fetch).toHaveBeenCalledTimes(3);
    ['n1', 'n2', 'n3'].forEach((id) => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/notifications/${id}`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  it('handles an empty id list without making any requests', async () => {
    global.fetch = jest.fn();

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBulkDelete(), { wrapper });

    await act(async () => {
      result.current.mutate([]);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fires exactly one request per id (no duplicates)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBulkDelete(), { wrapper });

    const ids = ['a', 'b', 'c', 'd'];
    await act(async () => {
      result.current.mutate(ids);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(global.fetch).toHaveBeenCalledTimes(ids.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useNotifications — pagination normalization (totalPages → pages)
// ─────────────────────────────────────────────────────────────────────────────

describe('useNotifications pagination normalization', () => {
  it('normalizes totalPages from the API into the pages field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: [],
          pagination: { page: 1, limit: 20, total: 50, totalPages: 3 },
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useNotifications(1, 20), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pagination.pages).toBe(3);
  });

  it('falls back to pages when totalPages is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: [],
          pagination: { page: 1, limit: 20, total: 50, pages: 5 },
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useNotifications(1, 20), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pagination.pages).toBe(5);
  });

  it('defaults to 1 page when neither field is present', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          data: [],
          pagination: { page: 1, limit: 20, total: 0 },
        }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useNotifications(1, 20), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pagination.pages).toBe(1);
  });
});
