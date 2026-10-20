import {
  formatDate,
  formatDateTime,
  formatScheduleDate,
  formatTime,
  calculateAge,
  calculateAgeInMonths,
  getAgeGroup,
  getUtcOffset,
  getUtcOffsetString,
  toOffsetIsoString,
  utcToLocalIsoString,
  getLocalTimezone,
  formatRelativeTime,
  formatRelativeTimeShort,
} from './index';

// ─── formatDate ──────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats a Date object as "Jan 1, 2024"', () => {
    expect(formatDate(new Date('2024-01-01'))).toBe('Jan 1, 2024');
  });

  it('formats an ISO string as "Jan 1, 2024"', () => {
    expect(formatDate('2024-01-01')).toBe('Jan 1, 2024');
  });

  it('returns "N/A" for undefined', () => {
    expect(formatDate(undefined)).toBe('N/A');
  });

  it('returns "N/A" for empty string', () => {
    expect(formatDate('')).toBe('N/A');
  });
});

// ─── formatDateTime ──────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('formats a Date with time', () => {
    const result = formatDateTime(new Date('2024-01-01T12:00:00'));
    expect(result).toContain('Jan 1, 2024');
    expect(result).toContain('12:00:00');
  });

  it('formats an ISO string with time', () => {
    const result = formatDateTime('2024-01-01T12:00:00');
    expect(result).toContain('Jan 1, 2024');
  });
});

// ─── formatScheduleDate ──────────────────────────────────────────────

describe('formatScheduleDate', () => {
  it('formats as "Monday, Jan 1"', () => {
    const result = formatScheduleDate(new Date('2024-01-01'));
    expect(result).toBe('Monday, Jan 1');
  });

  it('formats an ISO string', () => {
    const result = formatScheduleDate('2024-01-01');
    expect(result).toBe('Monday, Jan 1');
  });
});

// ─── formatTime ──────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats a time as "12:00 AM"', () => {
    const result = formatTime(new Date('2024-01-01T00:00:00'));
    expect(result).toBe('12:00 AM');
  });

  it('formats an ISO string', () => {
    const result = formatTime('2024-01-01T13:30:00');
    expect(result).toBe('1:30 PM');
  });
});

// ─── calculateAge ────────────────────────────────────────────────────

describe('calculateAge', () => {
  it('calculates age from a Date object', () => {
    // A person born 20 years ago
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 20);
    expect(calculateAge(dob)).toBe(20);
  });

  it('calculates age from a string', () => {
    expect(calculateAge('2004-01-01')).toBeGreaterThanOrEqual(21);
  });

  it('returns 0 for a future date', () => {
    expect(calculateAge('2099-01-01')).toBeLessThan(0);
  });
});

// ─── calculateAgeInMonths ────────────────────────────────────────────

describe('calculateAgeInMonths', () => {
  it('calculates age in months', () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 1);
    const months = calculateAgeInMonths(dob);
    expect(months).toBeGreaterThanOrEqual(11);
    expect(months).toBeLessThanOrEqual(13);
  });
});

// ─── getAgeGroup ─────────────────────────────────────────────────────

describe('getAgeGroup', () => {
  it('returns infant for age < 1', () => {
    expect(getAgeGroup(0)).toBe('infant');
  });

  it('returns toddler for age 1-2', () => {
    expect(getAgeGroup(1)).toBe('toddler');
    expect(getAgeGroup(2)).toBe('toddler');
  });

  it('returns child for age 3-11', () => {
    expect(getAgeGroup(5)).toBe('child');
    expect(getAgeGroup(11)).toBe('child');
  });

  it('returns adolescent for age 12-17', () => {
    expect(getAgeGroup(12)).toBe('adolescent');
    expect(getAgeGroup(17)).toBe('adolescent');
  });

  it('returns adult for age 18-64', () => {
    expect(getAgeGroup(18)).toBe('adult');
    expect(getAgeGroup(64)).toBe('adult');
  });

  it('returns elderly for age >= 65', () => {
    expect(getAgeGroup(65)).toBe('elderly');
    expect(getAgeGroup(80)).toBe('elderly');
  });
});

// ─── getUtcOffset ────────────────────────────────────────────────────

describe('getUtcOffset', () => {
  it('returns a number', () => {
    const offset = getUtcOffset();
    expect(typeof offset).toBe('number');
  });

  it('returns the correct offset for a known timezone', () => {
    // UTC should be 0
    const offset = getUtcOffset('2024-01-01T00:00:00Z');
    expect(offset).toBe(0);
  });
});

// ─── getUtcOffsetString ──────────────────────────────────────────────

describe('getUtcOffsetString', () => {
  it('returns a formatted string for UTC', () => {
    expect(getUtcOffsetString('2024-01-01T00:00:00Z')).toBe('+00:00');
  });

  it('returns a formatted string with sign', () => {
    const offset = getUtcOffsetString();
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
  });
});

// ─── toOffsetIsoString ───────────────────────────────────────────────

describe('toOffsetIsoString', () => {
  it('converts a UTC date to an offset ISO string', () => {
    const result = toOffsetIsoString('2024-01-01T00:00:00Z', 300);
    expect(result).toBe('2024-01-01T05:00:00.000Z');
  });
});

// ─── utcToLocalIsoString ─────────────────────────────────────────────

describe('utcToLocalIsoString', () => {
  it('converts a UTC ISO string to an offset ISO string', () => {
    const result = utcToLocalIsoString('2024-01-01T00:00:00Z', 300);
    expect(result).toBe('2024-01-01T05:00:00.000Z');
  });
});

// ─── getLocalTimezone ────────────────────────────────────────────────

describe('getLocalTimezone', () => {
  it('returns a non-empty string', () => {
    const tz = getLocalTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });
});

// ─── formatRelativeTime ──────────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('returns "just now" for a very recent date', () => {
    const recent = new Date(Date.now() - 1000);
    expect(formatRelativeTime(recent)).toBe('just now');
  });

  it('returns "X minutes ago" for past dates', () => {
    const past = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe('5 minutes ago');
  });

  it('returns "X hours ago" for past dates', () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe('3 hours ago');
  });

  it('returns "X days ago" for past dates', () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe('5 days ago');
  });

  it('returns "in X minutes" for future dates', () => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    expect(formatRelativeTime(future)).toBe('in 10 minutes');
  });

  it('returns "in X days" for future dates', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(future)).toBe('in 3 days');
  });

  it('falls back to formatted date for distant past', () => {
    const distant = new Date('2020-01-01');
    const result = formatRelativeTime(distant);
    expect(result).toBe('Jan 1, 2020');
  });

  it('falls back to formatted date for distant future', () => {
    const distant = new Date('2030-01-01');
    const result = formatRelativeTime(distant);
    expect(result).toBe('Jan 1, 2030');
  });

  it('does not include "in X" prefix when includeFuture is false', () => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    expect(formatRelativeTime(future, { includeFuture: false })).toBe('Jan 1, 2025');
  });
});

// ─── formatRelativeTimeShort ─────────────────────────────────────────

describe('formatRelativeTimeShort', () => {
  it('returns "now" for very recent dates', () => {
    const recent = new Date(Date.now() - 1000);
    expect(formatRelativeTimeShort(recent)).toBe('now');
  });

  it('returns "Xm" for past minutes', () => {
    const past = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTimeShort(past)).toBe('5m');
  });

  it('returns "Xh" for past hours', () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTimeShort(past)).toBe('3h');
  });

  it('returns "Xd" for past days', () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTimeShort(past)).toBe('5d');
  });

  it('returns "in Xm" for future minutes', () => {
    const future = new Date(Date.now() + 10 * 60 * 1000);
    expect(formatRelativeTimeShort(future)).toBe('in 10m');
  });
});
