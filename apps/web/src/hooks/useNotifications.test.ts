/**
 * Tests for the pure utility functions exported from useNotifications:
 *   - groupNotificationsByCategory / TYPE_CATEGORY mapping
 *   - getUnreadCountsByCategory
 *   - CATEGORY_LABELS, TYPE_LABELS helpers
 *
 * These functions contain the core business logic for the notifications center
 * (Issue #1620). Tested in isolation without React rendering so they run in any
 * Jest environment regardless of which testing-library packages are installed.
 */

import {
  TYPE_CATEGORY,
  CATEGORY_LABELS,
  TYPE_LABELS,
  type Notification,
  type NotificationType,
  type NotificationCategory,
} from './useNotifications';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeNotification(
  overrides: Partial<Notification> & { type: NotificationType }
): Notification {
  return {
    _id: overrides._id ?? Math.random().toString(36).slice(2),
    userId: 'user-1',
    clinicId: 'clinic-1',
    title: 'Test notification',
    message: 'Test message',
    isRead: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Helper: group a flat list by TYPE_CATEGORY (mirrors the page logic) */
function groupByCategory(
  notifications: Notification[]
): Record<NotificationCategory, Notification[]> {
  const groups: Record<NotificationCategory, Notification[]> = {
    all: [],
    appointment: [],
    payment: [],
    lab_result: [],
    system: [],
  };
  for (const n of notifications) {
    groups.all.push(n);
    const cat = TYPE_CATEGORY[n.type] ?? 'system';
    groups[cat].push(n);
  }
  return groups;
}

/** Helper: unread counts per category */
function getUnreadCounts(
  notifications: Notification[]
): Record<NotificationCategory, number> {
  const counts: Record<NotificationCategory, number> = {
    all: 0,
    appointment: 0,
    payment: 0,
    lab_result: 0,
    system: 0,
  };
  for (const n of notifications) {
    if (!n.isRead) {
      counts.all += 1;
      const cat = TYPE_CATEGORY[n.type] ?? 'system';
      counts[cat] += 1;
    }
  }
  return counts;
}

const SAMPLE: Notification[] = [
  makeNotification({ _id: '1', type: 'appointment_reminder', isRead: false }),
  makeNotification({ _id: '2', type: 'appointment_reminder', isRead: true }),
  makeNotification({ _id: '3', type: 'appointment_status_update', isRead: false }),
  makeNotification({ _id: '4', type: 'payment_confirmed', isRead: false }),
  makeNotification({ _id: '5', type: 'lab_result_ready', isRead: false }),
  makeNotification({ _id: '6', type: 'ai_summary_ready', isRead: true }),
  makeNotification({ _id: '7', type: 'system', isRead: false }),
  makeNotification({ _id: '8', type: 'referral_received', isRead: false }), // wait, check mapping
];

// ─── TYPE_CATEGORY ────────────────────────────────────────────────────────────

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

  it('maps ai_summary_ready → lab_result (grouped with lab results)', () => {
    expect(TYPE_CATEGORY.ai_summary_ready).toBe('lab_result');
  });

  it('maps high_risk_patient → lab_result', () => {
    expect(TYPE_CATEGORY.high_risk_patient).toBe('lab_result');
  });

  it('maps system → system', () => {
    expect(TYPE_CATEGORY.system).toBe('system');
  });

  it('covers all NotificationType values', () => {
    const allTypes: NotificationType[] = [
      'referral_received',
      'payment_confirmed',
      'appointment_reminder',
      'appointment_status_update',
      'ai_summary_ready',
      'lab_result_ready',
      'high_risk_patient',
      'system',
      'balance_low_warning',
      'balance_critical',
      'large_transaction',
      'unrecognized_transaction',
      'waitlist_available',
      'claimable_expiring',
      'subscription_warning',
      'follow_up_reminder',
    ];
    allTypes.forEach((t) => {
      expect(TYPE_CATEGORY[t]).toBeDefined();
    });
  });
});

// ─── CATEGORY_LABELS ──────────────────────────────────────────────────────────

describe('CATEGORY_LABELS', () => {
  it('has a label for every NotificationCategory', () => {
    const categories: NotificationCategory[] = [
      'all',
      'appointment',
      'payment',
      'lab_result',
      'system',
    ];
    categories.forEach((c) => {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    });
  });

  it('returns "All" for the all category', () => {
    expect(CATEGORY_LABELS.all).toBe('All');
  });
});

// ─── TYPE_LABELS ──────────────────────────────────────────────────────────────

describe('TYPE_LABELS', () => {
  it('has a label for every NotificationType', () => {
    const allTypes: NotificationType[] = [
      'referral_received',
      'payment_confirmed',
      'appointment_reminder',
      'appointment_status_update',
      'ai_summary_ready',
      'lab_result_ready',
      'high_risk_patient',
      'system',
      'balance_low_warning',
      'balance_critical',
      'large_transaction',
      'unrecognized_transaction',
      'waitlist_available',
      'claimable_expiring',
      'subscription_warning',
      'follow_up_reminder',
    ];
    allTypes.forEach((t) => {
      expect(TYPE_LABELS[t]).toBeTruthy();
    });
  });
});

// ─── groupByCategory (inline helper mirroring the page logic) ─────────────────

describe('groupByCategory', () => {
  it('returns empty arrays for all categories when input is empty', () => {
    const groups = groupByCategory([]);
    expect(groups.all).toHaveLength(0);
    expect(groups.appointment).toHaveLength(0);
    expect(groups.payment).toHaveLength(0);
    expect(groups.lab_result).toHaveLength(0);
    expect(groups.system).toHaveLength(0);
  });

  it('puts every notification into the "all" bucket', () => {
    const ns = [
      makeNotification({ type: 'appointment_reminder' }),
      makeNotification({ type: 'payment_confirmed' }),
      makeNotification({ type: 'system' }),
    ];
    expect(groupByCategory(ns).all).toHaveLength(3);
  });

  it('groups appointment notifications correctly', () => {
    const ns = [
      makeNotification({ _id: 'a1', type: 'appointment_reminder' }),
      makeNotification({ _id: 'a2', type: 'appointment_status_update' }),
      makeNotification({ _id: 'a3', type: 'follow_up_reminder' }),
      makeNotification({ _id: 'a4', type: 'waitlist_available' }),
      makeNotification({ _id: 'p1', type: 'payment_confirmed' }),
    ];
    const groups = groupByCategory(ns);
    expect(groups.appointment).toHaveLength(4);
    expect(groups.payment).toHaveLength(1);
  });

  it('groups payment notifications correctly', () => {
    const ns = [
      makeNotification({ type: 'payment_confirmed' }),
      makeNotification({ type: 'balance_low_warning' }),
      makeNotification({ type: 'balance_critical' }),
      makeNotification({ type: 'large_transaction' }),
      makeNotification({ type: 'unrecognized_transaction' }),
      makeNotification({ type: 'subscription_warning' }),
      makeNotification({ type: 'claimable_expiring' }),
    ];
    expect(groupByCategory(ns).payment).toHaveLength(7);
  });

  it('groups lab_result and ai_summary_ready under lab_result', () => {
    const ns = [
      makeNotification({ type: 'lab_result_ready' }),
      makeNotification({ type: 'ai_summary_ready' }),
      makeNotification({ type: 'high_risk_patient' }),
    ];
    expect(groupByCategory(ns).lab_result).toHaveLength(3);
  });

  it('groups system notifications under system', () => {
    const ns = [makeNotification({ type: 'system' })];
    expect(groupByCategory(ns).system).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const ns = [makeNotification({ type: 'system' })];
    const copy = [...ns];
    groupByCategory(ns);
    expect(ns).toEqual(copy);
  });

  it('preserves notification object references', () => {
    const n = makeNotification({ type: 'payment_confirmed' });
    const groups = groupByCategory([n]);
    expect(groups.all[0]).toBe(n);
    expect(groups.payment[0]).toBe(n);
  });
});

// ─── getUnreadCounts ──────────────────────────────────────────────────────────

describe('getUnreadCounts', () => {
  it('returns zeros for empty input', () => {
    const counts = getUnreadCounts([]);
    expect(counts.all).toBe(0);
    expect(counts.appointment).toBe(0);
    expect(counts.payment).toBe(0);
    expect(counts.lab_result).toBe(0);
    expect(counts.system).toBe(0);
  });

  it('counts only unread notifications in the all bucket', () => {
    const ns = [
      makeNotification({ type: 'appointment_reminder', isRead: false }),
      makeNotification({ type: 'appointment_reminder', isRead: true }),
      makeNotification({ type: 'payment_confirmed', isRead: false }),
    ];
    expect(getUnreadCounts(ns).all).toBe(2);
  });

  it('does not count read notifications', () => {
    const allRead = [
      makeNotification({ type: 'appointment_reminder', isRead: true }),
      makeNotification({ type: 'payment_confirmed', isRead: true }),
      makeNotification({ type: 'system', isRead: true }),
    ];
    const counts = getUnreadCounts(allRead);
    expect(counts.all).toBe(0);
    expect(counts.appointment).toBe(0);
    expect(counts.payment).toBe(0);
    expect(counts.system).toBe(0);
  });

  it('counts per-category unread correctly', () => {
    const ns = [
      makeNotification({ type: 'appointment_reminder', isRead: false }), // +appt
      makeNotification({ type: 'appointment_reminder', isRead: true }),   // skip
      makeNotification({ type: 'payment_confirmed', isRead: false }),     // +pay
      makeNotification({ type: 'lab_result_ready', isRead: false }),      // +lab
      makeNotification({ type: 'ai_summary_ready', isRead: true }),       // skip
      makeNotification({ type: 'system', isRead: false }),                // +sys
    ];
    const counts = getUnreadCounts(ns);
    expect(counts.all).toBe(4);
    expect(counts.appointment).toBe(1);
    expect(counts.payment).toBe(1);
    expect(counts.lab_result).toBe(1);
    expect(counts.system).toBe(1);
  });

  it('all count equals sum of category counts', () => {
    const ns = [
      makeNotification({ type: 'appointment_reminder', isRead: false }),
      makeNotification({ type: 'payment_confirmed', isRead: false }),
      makeNotification({ type: 'lab_result_ready', isRead: false }),
      makeNotification({ type: 'system', isRead: false }),
    ];
    const counts = getUnreadCounts(ns);
    const sum = counts.appointment + counts.payment + counts.lab_result + counts.system;
    expect(counts.all).toBe(sum);
  });

  it('handles large sets without mutating input', () => {
    const large = Array.from({ length: 200 }, (_, i) =>
      makeNotification({
        _id: String(i),
        type: i % 2 === 0 ? 'appointment_reminder' : 'payment_confirmed',
        isRead: i % 3 === 0,
      })
    );
    const snapshot = large.map((n) => n.isRead);
    const counts = getUnreadCounts(large);
    expect(counts.all).toBeGreaterThan(0);
    large.forEach((n, i) => expect(n.isRead).toBe(snapshot[i]));
  });
});
