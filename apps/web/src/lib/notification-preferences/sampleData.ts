import type { NotificationHistoryEntry } from './types';

/** Demo notification history shown when no history has been synced yet. */
export const SAMPLE_NOTIFICATION_HISTORY: NotificationHistoryEntry[] = [
  {
    id: 'note-1',
    at: '2026-09-23T16:20:00.000Z',
    type: 'lab_results',
    channel: 'email',
    subject: 'Lab results ready for Ada Okafor',
    preview: 'HbA1c 8.4% (reference 4.0–5.6%).',
    read: false,
  },
  {
    id: 'note-2',
    at: '2026-09-23T09:05:00.000Z',
    type: 'appointment_reminders',
    channel: 'push',
    subject: 'Appointment tomorrow',
    preview: 'Ada Okafor has an appointment on 25 September 2026 at 09:15.',
    read: false,
  },
  {
    id: 'note-3',
    at: '2026-09-22T11:40:00.000Z',
    type: 'prescription_alerts',
    channel: 'email',
    subject: 'Prescription needs review: Warfarin 5 mg',
    preview: 'Major interaction with ibuprofen.',
    read: true,
  },
  {
    id: 'note-4',
    at: '2026-09-21T18:12:00.000Z',
    type: 'security_alerts',
    channel: 'sms',
    subject: 'Security alert',
    preview: 'New sign-in to your account at Lagos, Nigeria.',
    read: true,
  },
  {
    id: 'note-5',
    at: '2026-09-21T08:30:00.000Z',
    type: 'referral_updates',
    channel: 'in_app',
    subject: 'Referral accepted',
    preview: 'The referral for Ada Okafor was accepted at 08:30.',
    read: true,
  },
  {
    id: 'note-6',
    at: '2026-09-19T14:02:00.000Z',
    type: 'payment_updates',
    channel: 'email',
    subject: 'Payment received',
    preview: 'A payment of ₦45,000 was received for encounter ENC-2041.',
    read: true,
  },
  {
    id: 'note-7',
    at: '2026-09-18T07:45:00.000Z',
    type: 'lab_results',
    channel: 'push',
    subject: 'Lab results ready',
    preview: 'Creatinine for Chinedu Balogun is ready to review.',
    read: true,
  },
  {
    id: 'note-8',
    at: '2026-09-15T20:10:00.000Z',
    type: 'care_team_messages',
    channel: 'in_app',
    subject: 'New message from Dr. Ngozi Eze',
    preview: 'Please review the anticoagulation plan before the next clinic.',
    read: true,
  },
];

export function unreadCount(entries: readonly NotificationHistoryEntry[]): number {
  return entries.filter((entry) => !entry.read).length;
}

export function historyForChannel(
  entries: readonly NotificationHistoryEntry[],
  channel: NotificationHistoryEntry['channel'] | 'all'
): NotificationHistoryEntry[] {
  if (channel === 'all') return [...entries];
  return entries.filter((entry) => entry.channel === channel);
}

export function historyForType(
  entries: readonly NotificationHistoryEntry[],
  type: NotificationHistoryEntry['type'] | 'all'
): NotificationHistoryEntry[] {
  if (type === 'all') return [...entries];
  return entries.filter((entry) => entry.type === type);
}
