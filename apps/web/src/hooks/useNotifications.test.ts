/**
 * Tests for the pure utility functions exported from useNotifications:
 *   - groupNotificationsByCategory
 *   - getUnreadCountsByCategory
 *   - TYPE_TO_CATEGORY mapping
 *
 * These functions contain the core business logic for the notifications center
 * (Issue #1620). They are tested in isolation without React rendering.
 */

import {
  groupNotificationsByCategory,
  getUnreadCountsByCategory,
  TYPE_TO_CATEGORY,
  CATEGORY_LABELS,
  type Notification,
  type NotificationCategory,
  type NotificationType,
} from '@/hooks/useNotifications';

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

const SAMPLE_NOTIFICATIONS: Notification[] = [
  makeNotification({ _id: '1', type: 'appointment_reminder', isRead: false }),
  makeNotification({ _id: '2', type: 'appointment_reminder', isRead: true }),
  makeNotification({ _id: '3', type: 'payment_confirmed', isRead: false }),
  makeNotification({ _id: '4', type: 'lab_result_ready', isRead: false }),
  makeNotification({ _id: '5', type: 'ai_summary_ready', isRead: true }),
  makeNotification({ _id: '6', type: 'referral_received', isRead: false }),
  makeNotification({ _id: '7', type: 'system', isRead: false }),
];

// ─── TYPE_TO_CATEGORY ─────────────────────────────────────────────────────────

describe('TYPE_TO_CATEGORY', () => {
  it('maps appointment_reminder → appointment', () => {
    expect(TYPE_TO_CATEGORY.appointment_reminder).toBe('appointment');
  });

  it('maps payment_confirmed → payment', () => {
    expect(TYPE_TO_CATEGORY.payment_confirmed).toBe('payment');
  });

  it('maps lab_result_ready → lab_result', () => {
    expect(TYPE_TO_CATEGORY.lab_result_ready).toBe('lab_result');
  });

  it('maps ai_summary_ready → lab_result (grouped with lab results)', () => {
    expect(TYPE_TO_CATEGORY.ai_summary_ready).toBe('lab_result');
  });

  it('maps referral_received → system_alert', () => {
    expect(TYPE_TO_CATEGORY.referral_received).toBe('system_alert');
  });

  it('maps system → system_alert', () => {
    expect(TYPE_TO_CATEGORY.system).toBe('system_alert');
  });

  it('covers all NotificationType values', () => {
    const allTypes: NotificationType[] = [
      'appointment_reminder',
      'payment_confirmed',
      'lab_result_ready',
      'ai_summary_ready',
      'referral_received',
      'system',
    ];
    allTypes.forEach((t) => {
      expect(TYPE_TO_CATEGORY[t]).toBeDefined();
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
      'system_alert',
    ];
    categories.forEach((c) => {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    });
  });

  it('returns "All" for the all category', () => {
    expect(CATEGORY_LABELS.all).toBe('All');
  });
});

// ─── groupNotificationsByCategory ────────────────────────────────────────────

describe('groupNotificationsByCategory', () => {
  it('returns empty arrays for all categories when input is empty', () => {
    const groups = groupNotificationsByCategory([]);
    expect(groups.all).toHaveLength(0);
    expect(groups.appointment).toHaveLength(0);
    expect(groups.payment).toHaveLength(0);
    expect(groups.lab_result).toHaveLength(0);
    expect(groups.system_alert).toHaveLength(0);
  });

  it('puts every notification into the "all" bucket', () => {
    const groups = groupNotificationsByCategory(SAMPLE_NOTIFICATIONS);
    expect(groups.all).toHaveLength(SAMPLE_NOTIFICATIONS.length);
  });

  it('groups appointment_reminder notifications under appointment', () => {
    const groups = groupNotificationsByCategory(SAMPLE_NOTIFICATIONS);
    const apptIds = groups.appointment.map((n) => n._id);
    expect(apptIds).toContain('1');
    expect(apptIds).toContain('2');
    expect(apptIds).not.toContain('3'); // payment
  });

  it('groups payment_confirmed notifications under payment', () => {
    const groups = groupNotificationsByCategory(SAMPLE_NOTIFICATIONS);
    expect(groups.payment.map((n) => n._id)).toContain('3');
    expect(groups.payment).toHaveLength(1);
  });

  it('groups both lab_result_ready and ai_summary_ready under lab_result', () => {
    const groups = groupNotificationsByCategory(SAMPLE_NOTIFICATIONS);
    const labIds = groups.lab_result.map((n) => n._id);
    expect(labIds).toContain('4'); // lab_result_ready
    expect(labIds).toContain('5'); // ai_summary_ready
    expect(groups.lab_result).toHaveLength(2);
  });

  it('groups referral_received and system under system_alert', () => {
    const groups = groupNotificationsByCategory(SAMPLE_NOTIFICATIONS);
    const alertIds = groups.system_alert.map((n) => n._id);
    expect(alertIds).toContain('6'); // referral_received
    expect(alertIds).toContain('7'); // system
    expect(groups.system_alert).toHaveLength(2);
  });

  it('does not mutate the input array', () => {
    const copy = [...SAMPLE_NOTIFICATIONS];
    groupNotificationsByCategory(SAMPLE_NOTIFICATIONS);
    expect(SAMPLE_NOTIFICATIONS).toEqual(copy);
  });

  it('handles a single notification correctly', () => {
    const single = [makeNotification({ _id: 'x', type: 'payment_confirmed' })];
    const groups = groupNotificationsByCategory(single);
    expect(groups.all).toHaveLength(1);
    expect(groups.payment).toHaveLength(1);
    expect(groups.appointment).toHaveLength(0);
    expect(groups.lab_result).toHaveLength(0);
    expect(groups.system_alert).toHaveLength(0);
  });

  it('preserves notification objects by reference', () => {
    const n = makeNotification({ type: 'system' });
    const groups = groupNotificationsByCategory([n]);
    expect(groups.all[0]).toBe(n);
    expect(groups.system_alert[0]).toBe(n);
  });
});

// ─── getUnreadCountsByCategory ────────────────────────────────────────────────

describe('getUnreadCountsByCategory', () => {
  it('returns zeros for all categories when input is empty', () => {
    const counts = getUnreadCountsByCategory([]);
    expect(counts.all).toBe(0);
    expect(counts.appointment).toBe(0);
    expect(counts.payment).toBe(0);
    expect(counts.lab_result).toBe(0);
    expect(counts.system_alert).toBe(0);
  });

  it('counts only unread notifications in the all bucket', () => {
    const counts = getUnreadCountsByCategory(SAMPLE_NOTIFICATIONS);
    // '2' (appointment, read) and '5' (ai_summary, read) are read → 5 unread
    expect(counts.all).toBe(5);
  });

  it('does not count read notifications', () => {
    const allRead = SAMPLE_NOTIFICATIONS.map((n) => ({ ...n, isRead: true }));
    const counts = getUnreadCountsByCategory(allRead);
    expect(counts.all).toBe(0);
    expect(counts.appointment).toBe(0);
    expect(counts.payment).toBe(0);
    expect(counts.lab_result).toBe(0);
    expect(counts.system_alert).toBe(0);
  });

  it('counts unread appointment_reminder notifications', () => {
    const counts = getUnreadCountsByCategory(SAMPLE_NOTIFICATIONS);
    // id '1' is unread, id '2' is read
    expect(counts.appointment).toBe(1);
  });

  it('counts unread payment_confirmed notifications', () => {
    const counts = getUnreadCountsByCategory(SAMPLE_NOTIFICATIONS);
    expect(counts.payment).toBe(1);
  });

  it('counts unread lab results (lab_result_ready + ai_summary_ready)', () => {
    const counts = getUnreadCountsByCategory(SAMPLE_NOTIFICATIONS);
    // id '4' (lab_result_ready, unread), id '5' (ai_summary_ready, read)
    expect(counts.lab_result).toBe(1);
  });

  it('counts unread system_alert notifications (referral_received + system)', () => {
    const counts = getUnreadCountsByCategory(SAMPLE_NOTIFICATIONS);
    // id '6' (referral_received, unread), id '7' (system, unread)
    expect(counts.system_alert).toBe(2);
  });

  it('all count equals sum of category counts', () => {
    const counts = getUnreadCountsByCategory(SAMPLE_NOTIFICATIONS);
    const categorySum =
      counts.appointment + counts.payment + counts.lab_result + counts.system_alert;
    expect(counts.all).toBe(categorySum);
  });

  it('handles all-unread list', () => {
    const all = [
      makeNotification({ type: 'appointment_reminder', isRead: false }),
      makeNotification({ type: 'payment_confirmed', isRead: false }),
      makeNotification({ type: 'lab_result_ready', isRead: false }),
      makeNotification({ type: 'system', isRead: false }),
    ];
    const counts = getUnreadCountsByCategory(all);
    expect(counts.all).toBe(4);
    expect(counts.appointment).toBe(1);
    expect(counts.payment).toBe(1);
    expect(counts.lab_result).toBe(1);
    expect(counts.system_alert).toBe(1);
  });

  it('handles large sets efficiently without mutating input', () => {
    const large = Array.from({ length: 200 }, (_, i) =>
      makeNotification({
        _id: String(i),
        type: i % 2 === 0 ? 'appointment_reminder' : 'payment_confirmed',
        isRead: i % 3 === 0,
      })
    );
    const copy = large.map((n) => ({ ...n }));
    const counts = getUnreadCountsByCategory(large);
    expect(counts.all).toBeGreaterThan(0);
    // Input unchanged
    large.forEach((n, i) => expect(n.isRead).toBe(copy[i]?.isRead));
  });
});
