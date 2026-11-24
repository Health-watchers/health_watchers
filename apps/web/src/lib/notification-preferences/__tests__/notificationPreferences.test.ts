import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  countEnabledChannels,
  countEnabledTypes,
  createDefaultPreferences,
  setChannelEnabled,
  setDigestTime,
  setFrequency,
  setQuietHours,
  setTypeEnabled,
  setUnsubscribeAll,
} from '@/lib/notification-preferences/preferences';
import {
  describeQuietHours,
  effectiveDelivery,
  isWithinQuietHours,
  parseTimeOfDay,
} from '@/lib/notification-preferences/delivery';
import { sanitisePreferences } from '@/lib/notification-preferences/storage';
import {
  NOTIFICATION_TEMPLATES,
  applyContentLevel,
  renderTemplate,
} from '@/lib/notification-preferences/templates';
import {
  SAMPLE_NOTIFICATION_HISTORY,
  historyForChannel,
  historyForType,
  unreadCount,
} from '@/lib/notification-preferences/sampleData';
import type { QuietHours } from '@/lib/notification-preferences/types';

const at = (hour: number, minute = 0) => new Date(2026, 8, 24, hour, minute);

const QUIET_22_TO_07: QuietHours = {
  enabled: true,
  start: '22:00',
  end: '07:00',
  timezone: 'Local time',
  allowCriticalOverride: true,
};

describe('defaults and setters (#1315)', () => {
  it('enables sensible defaults', () => {
    const defaults = createDefaultPreferences();
    expect(NOTIFICATION_TYPES).toHaveLength(8);
    expect(NOTIFICATION_CHANNELS).toHaveLength(4);
    expect(countEnabledTypes(defaults)).toBe(7);
    expect(countEnabledChannels(defaults)).toBe(3);
    expect(defaults.types.system_updates).toBe(false);
    expect(defaults.channels.sms).toBe(false);
    expect(defaults.frequency).toBe('immediate');
    expect(defaults.content).toBe('full_details');
    expect(defaults.digestTime).toBe('09:00');
  });

  it('returns an independent object every time', () => {
    const first = createDefaultPreferences();
    const second = createDefaultPreferences();
    first.types.lab_results = false;
    expect(second.types.lab_results).toBe(true);
  });

  it('never mutates the preferences passed in', () => {
    const base = createDefaultPreferences();
    const updated = setTypeEnabled(base, 'system_updates', true);
    expect(base.types.system_updates).toBe(false);
    expect(updated.types.system_updates).toBe(true);

    const withSms = setChannelEnabled(updated, 'sms', true);
    expect(updated.channels.sms).toBe(false);
    expect(withSms.channels.sms).toBe(true);

    const digest = setFrequency(withSms, 'daily_digest');
    expect(withSms.frequency).toBe('immediate');
    expect(digest.frequency).toBe('daily_digest');

    expect(setDigestTime(digest, '07:30').digestTime).toBe('07:30');
    expect(setUnsubscribeAll(digest, true).unsubscribeAll).toBe(true);
    expect(digest.unsubscribeAll).toBe(false);
  });

  it('applies the quiet-hours draft while keeping the timezone', () => {
    const base = createDefaultPreferences();
    const updated = setQuietHours(base, {
      enabled: true,
      start: '23:00',
      end: '06:30',
      criticalOverride: false,
    });
    expect(updated.quietHours.enabled).toBe(true);
    expect(updated.quietHours.start).toBe('23:00');
    expect(updated.quietHours.end).toBe('06:30');
    expect(updated.quietHours.allowCriticalOverride).toBe(false);
    expect(updated.quietHours.timezone).toBe(base.quietHours.timezone);
    expect(describeQuietHours(updated.quietHours)).toContain('23:00–06:30');
  });
});

describe('quiet hours (#1315)', () => {
  it('validates times of day', () => {
    expect(parseTimeOfDay('22:00')).toBe(1320);
    expect(parseTimeOfDay('07:30')).toBe(450);
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('7:00')).toBeNull();
    expect(parseTimeOfDay('nonsense')).toBeNull();
  });

  it('wraps past midnight and ignores invalid windows', () => {
    expect(isWithinQuietHours(QUIET_22_TO_07, at(23))).toBe(true);
    expect(isWithinQuietHours(QUIET_22_TO_07, at(3))).toBe(true);
    expect(isWithinQuietHours(QUIET_22_TO_07, at(12))).toBe(false);
    expect(isWithinQuietHours(QUIET_22_TO_07, at(7))).toBe(false);
    expect(isWithinQuietHours({ ...QUIET_22_TO_07, enabled: false }, at(23))).toBe(false);
    expect(isWithinQuietHours({ ...QUIET_22_TO_07, end: '22:00' }, at(23))).toBe(false);
  });
});

describe('delivery rules (#1315)', () => {
  it('delivers immediately during the day by default', () => {
    const result = effectiveDelivery(createDefaultPreferences(), 'lab_results', 'email', at(12));
    expect(result.decision).toBe('delivered');
    expect(result.reason).toBe('Delivered immediately.');
  });

  it('respects disabled types, disabled channels and unsubscribe-all', () => {
    const defaults = createDefaultPreferences();

    const disabledType = effectiveDelivery(defaults, 'system_updates', 'email', at(12));
    expect(disabledType.decision).toBe('suppressed');
    expect(disabledType.reason).toContain('System updates');

    const disabledChannel = effectiveDelivery(defaults, 'lab_results', 'sms', at(12));
    expect(disabledChannel.decision).toBe('suppressed');
    expect(disabledChannel.reason).toContain('SMS');

    const unsubscribed = effectiveDelivery(
      setUnsubscribeAll(defaults, true),
      'lab_results',
      'email',
      at(12)
    );
    expect(unsubscribed.decision).toBe('suppressed');
  });

  it('batches notifications when a digest is selected', () => {
    const digest = setDigestTime(setFrequency(createDefaultPreferences(), 'daily_digest'), '08:15');
    const result = effectiveDelivery(digest, 'appointment_reminders', 'push', at(12));
    expect(result.decision).toBe('held_for_digest');
    expect(result.reason).toBe('Batched into the daily digest at 08:15.');
  });

  it('only lets critical notifications break through quiet hours', () => {
    const quietOn = setQuietHours(createDefaultPreferences(), {
      enabled: true,
      start: '22:00',
      end: '07:00',
      criticalOverride: true,
    });

    const critical = effectiveDelivery(quietOn, 'lab_results', 'push', at(23));
    expect(critical.decision).toBe('delivered');
    expect(critical.reason).toContain('break through');

    const routine = effectiveDelivery(quietOn, 'care_team_messages', 'push', at(23));
    expect(routine.decision).toBe('held_for_digest');
    expect(routine.reason).toContain('quiet hours');

    const noOverride = setQuietHours(quietOn, {
      enabled: true,
      start: '22:00',
      end: '07:00',
      criticalOverride: false,
    });
    expect(effectiveDelivery(noOverride, 'lab_results', 'push', at(23)).decision).toBe(
      'held_for_digest'
    );
  });
});

describe('templates and content levels (#1315)', () => {
  it('renders placeholders and leaves unknown tokens alone', () => {
    const template = NOTIFICATION_TEMPLATES[0];
    expect(template).toBeDefined();

    const rendered = renderTemplate(template!);
    expect(rendered.subject).toBe('Lab results ready for Ada Okafor');
    expect(rendered.body).toContain('HbA1c: 8.4% (reference 4.0–5.6%).');

    expect(
      renderTemplate(template!, {
        patient: 'Bo',
        test: 'Na',
        result: '140',
        reference: '135-145',
      }).subject
    ).toBe('Lab results ready for Bo');

    expect(renderTemplate(template!, { patient: 'Bo' }).body).toContain('{{test}}');
  });

  it('trims the rendered body according to the content preference', () => {
    const template = NOTIFICATION_TEMPLATES[0];
    expect(template).toBeDefined();
    const full = renderTemplate(template!).body;

    expect(applyContentLevel(full, 'full_details')).toBe(full);
    expect(applyContentLevel(full, 'summary_only')).toMatch(/^New results are available for Ada Okafor\./);
    expect(applyContentLevel(full, 'minimal')).toBe('New results are available for Ada Okafor.');
  });
});

describe('persistence (#1315)', () => {
  it('falls back to defaults for unusable payloads', () => {
    const defaults = createDefaultPreferences();
    expect(sanitisePreferences(null).types.lab_results).toBe(defaults.types.lab_results);
    expect(sanitisePreferences('nope').frequency).toBe('immediate');
  });

  it('merges valid values and discards invalid ones', () => {
    const merged = sanitisePreferences({
      types: { lab_results: false, bogus_key: true },
      channels: { sms: true, nonsense: true },
      frequency: 'weekly_digest',
      content: 'summary_only',
      digestTime: '07:15',
      quietHours: { enabled: true, start: '99:99', end: '07:00', allowCriticalOverride: false },
      unsubscribeAll: true,
    });

    expect(merged.types.lab_results).toBe(false);
    expect('bogus_key' in merged.types).toBe(false);
    expect(merged.channels.sms).toBe(true);
    expect('nonsense' in merged.channels).toBe(false);
    expect(merged.frequency).toBe('weekly_digest');
    expect(merged.content).toBe('summary_only');
    expect(merged.digestTime).toBe('07:15');
    expect(merged.quietHours.enabled).toBe(true);
    expect(merged.quietHours.start).toBe('22:00');
    expect(merged.quietHours.end).toBe('07:00');
    expect(merged.quietHours.allowCriticalOverride).toBe(false);
    expect(merged.unsubscribeAll).toBe(true);

    const badFrequency = sanitisePreferences({ frequency: 'hourly' });
    expect(badFrequency.frequency).toBe('immediate');
    expect(badFrequency.digestTime).toBe('09:00');
  });
});

describe('history helpers (#1315)', () => {
  it('counts unread and filters by channel and type', () => {
    expect(SAMPLE_NOTIFICATION_HISTORY).toHaveLength(8);
    expect(unreadCount(SAMPLE_NOTIFICATION_HISTORY)).toBe(2);
    expect(historyForChannel(SAMPLE_NOTIFICATION_HISTORY, 'sms')).toHaveLength(1);
    expect(historyForChannel(SAMPLE_NOTIFICATION_HISTORY, 'all')).toHaveLength(8);
    expect(historyForType(SAMPLE_NOTIFICATION_HISTORY, 'lab_results')).toHaveLength(2);
    expect(historyForType(SAMPLE_NOTIFICATION_HISTORY, 'all')).toHaveLength(8);
  });
});

