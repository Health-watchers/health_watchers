import type {
  NotificationContent,
  NotificationTemplate,
  RenderedNotification,
} from './types';

/** Issue #1315 — notification templates viewer. */
export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    key: 'lab_result_email',
    type: 'lab_results',
    channel: 'email',
    subject: 'Lab results ready for {{patient}}',
    body: 'New results are available for {{patient}}.\n\n{{test}}: {{result}} (reference {{reference}}).\n\nSign in to review the full report and acknowledge the result.',
  },
  {
    key: 'lab_result_push',
    type: 'lab_results',
    channel: 'push',
    subject: 'Lab results ready',
    body: '{{test}} for {{patient}} is ready to review.',
  },
  {
    key: 'appointment_reminder_push',
    type: 'appointment_reminders',
    channel: 'push',
    subject: 'Appointment tomorrow',
    body: 'Reminder: {{patient}} has an appointment on {{date}} at {{time}}.',
  },
  {
    key: 'prescription_alert_email',
    type: 'prescription_alerts',
    channel: 'email',
    subject: 'Prescription needs review: {{medication}}',
    body: '{{medication}} for {{patient}} needs review.\n\nInteraction: {{interaction}}.',
  },
  {
    key: 'security_alert_sms',
    type: 'security_alerts',
    channel: 'sms',
    subject: 'Security alert',
    body: 'Health Watchers: new sign-in to your account at {{location}}. If this was not you, contact the clinic.',
  },
  {
    key: 'referral_update_in_app',
    type: 'referral_updates',
    channel: 'in_app',
    subject: 'Referral {{status}}',
    body: 'The referral for {{patient}} was {{status}} at {{time}}.',
  },
];

/** Values used to render the templates in the preview and tester. */
export const SAMPLE_TEMPLATE_VALUES: Record<string, string> = {
  patient: 'Ada Okafor',
  test: 'HbA1c',
  result: '8.4%',
  reference: '4.0–5.6%',
  date: '25 September 2026',
  time: '09:15',
  medication: 'Warfarin 5 mg',
  interaction: 'major interaction with ibuprofen',
  location: 'Lagos, Nigeria',
  status: 'accepted',
};

/** Replaces `{{placeholder}}` tokens; unknown tokens are left untouched. */
export function renderTemplate(
  template: NotificationTemplate,
  values: Record<string, string> = SAMPLE_TEMPLATE_VALUES
): RenderedNotification {
  const replace = (text: string): string =>
    text.replace(/\{\{(\w+)\}\}/g, (match, token: string) => values[token] ?? match);

  return { subject: replace(template.subject), body: replace(template.body) };
}

/**
 * Applies the user's content preference to a rendered body so the preview shows
 * exactly how much detail will be included.
 */
export function applyContentLevel(text: string, content: NotificationContent): string {
  if (content === 'full_details') return text;

  if (content === 'minimal') {
    const lineBreak = text.indexOf('\n');
    return lineBreak === -1 ? text : text.slice(0, lineBreak);
  }

  const sentenceEnd = text.indexOf('. ');
  return sentenceEnd === -1 ? text : text.slice(0, sentenceEnd + 1);
}
