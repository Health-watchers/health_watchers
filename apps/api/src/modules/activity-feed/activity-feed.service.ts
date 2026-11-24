import {
  ActivityEvent,
  ActivityEventType,
  ActivityFilter,
  NotificationPreference,
  RetentionPolicy,
  SuspiciousActivityFlag,
} from './activity-feed.types';

const DEFAULT_RETENTION_DAYS = 730;
const SUSPICIOUS_LOGIN_WINDOW_MS = 10 * 60 * 1000;
const SUSPICIOUS_LOGIN_THRESHOLD = 5;

/**
 * ActivityFeedService implements a chronological patient activity feed
 * with filtering/search, per-user notification settings, aggregation,
 * privacy controls, retention policies, bulk export, pattern analysis,
 * and suspicious activity detection.
 */
export class ActivityFeedService {
  private events: ActivityEvent[] = [];
  private preferences: NotificationPreference[] = [];
  private retentionPolicies = new Map<ActivityEventType, RetentionPolicy>();

  recordEvent(input: {
    patientId: string;
    actorId: string;
    type: ActivityEventType;
    summary: string;
    metadata?: Record<string, unknown>;
    visibility?: ActivityEvent['visibility'];
  }): ActivityEvent {
    const event: ActivityEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      patientId: input.patientId,
      actorId: input.actorId,
      type: input.type,
      timestamp: new Date().toISOString(),
      summary: input.summary,
      metadata: input.metadata,
      visibility: input.visibility ?? 'care_team',
    };
    this.events.push(event);
    return event;
  }

  /** Chronological timeline for a patient, most recent first. */
  getTimeline(patientId: string, viewerRole: 'patient' | 'care_team' | 'restricted' = 'care_team'): ActivityEvent[] {
    return this.events
      .filter((e) => e.patientId === patientId && this.isVisibleTo(e, viewerRole))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /** Event filtering and search across type, actor, date range, and free text. */
  search(patientId: string, filter: ActivityFilter): ActivityEvent[] {
    return this.getTimeline(patientId).filter((event) => {
      if (filter.types && !filter.types.includes(event.type)) return false;
      if (filter.actorId && event.actorId !== filter.actorId) return false;
      if (filter.from && new Date(event.timestamp) < new Date(filter.from)) return false;
      if (filter.to && new Date(event.timestamp) > new Date(filter.to)) return false;
      if (filter.search) {
        const haystack = `${event.summary} ${event.type}`.toLowerCase();
        if (!haystack.includes(filter.search.toLowerCase())) return false;
      }
      return true;
    });
  }

  /** Per-user notification settings management. */
  setNotificationPreference(pref: NotificationPreference): void {
    const existing = this.preferences.find(
      (p) => p.userId === pref.userId && p.eventType === pref.eventType && p.channel === pref.channel,
    );
    if (existing) {
      existing.enabled = pref.enabled;
    } else {
      this.preferences.push(pref);
    }
  }

  getNotificationPreferences(userId: string): NotificationPreference[] {
    return this.preferences.filter((p) => p.userId === userId);
  }

  /** Aggregated summary view of activity, grouped by event type. */
  getSummary(patientId: string, sinceDays = 30): Record<ActivityEventType, number> {
    const since = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    const recent = this.getTimeline(patientId).filter((e) => new Date(e.timestamp).getTime() >= since);
    return recent.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    }, {} as Record<ActivityEventType, number>);
  }

  private isVisibleTo(event: ActivityEvent, viewerRole: 'patient' | 'care_team' | 'restricted'): boolean {
    if (viewerRole === 'restricted') return event.visibility === 'restricted' || event.visibility === 'care_team';
    if (viewerRole === 'care_team') return event.visibility !== 'restricted';
    return event.visibility === 'patient';
  }

  /** Retention policy configuration per event type. */
  setRetentionPolicy(policy: RetentionPolicy): void {
    this.retentionPolicies.set(policy.eventType, policy);
  }

  /** Purges events older than their configured (or default) retention window. */
  applyRetention(): number {
    const before = this.events.length;
    const now = Date.now();
    this.events = this.events.filter((event) => {
      const policy = this.retentionPolicies.get(event.type);
      const retentionDays = policy?.retentionDays ?? DEFAULT_RETENTION_DAYS;
      const ageMs = now - new Date(event.timestamp).getTime();
      return ageMs <= retentionDays * 24 * 60 * 60 * 1000;
    });
    return before - this.events.length;
  }

  /** Bulk download / export of a patient's activity history for records. */
  exportActivity(patientId: string, format: 'json' | 'csv' = 'json'): string {
    const events = this.getTimeline(patientId);
    if (format === 'json') {
      return JSON.stringify(events, null, 2);
    }

    const header = 'id,type,actorId,timestamp,summary';
    const rows = events.map(
      (e) => `${e.id},${e.type},${e.actorId},${e.timestamp},"${e.summary.replace(/"/g, '""')}"`,
    );
    return [header, ...rows].join('\n');
  }

  /** Simple pattern analysis: activity counts by hour-of-day, used for engagement insight. */
  analyzePatterns(patientId: string): Record<number, number> {
    const timeline = this.getTimeline(patientId);
    return timeline.reduce((acc, e) => {
      const hour = new Date(e.timestamp).getHours();
      acc[hour] = (acc[hour] ?? 0) + 1;
      return acc;
    }, {} as Record<number, number>);
  }

  /** Flags bursts of login/access activity that may indicate account compromise. */
  detectSuspiciousActivity(patientId: string): SuspiciousActivityFlag[] {
    const logins = this.getTimeline(patientId)
      .filter((e) => e.type === 'login')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const flags: SuspiciousActivityFlag[] = [];
    for (let i = 0; i < logins.length; i++) {
      const windowEvents = logins.filter(
        (e) =>
          new Date(e.timestamp).getTime() >= new Date(logins[i].timestamp).getTime() &&
          new Date(e.timestamp).getTime() < new Date(logins[i].timestamp).getTime() + SUSPICIOUS_LOGIN_WINDOW_MS,
      );
      if (windowEvents.length >= SUSPICIOUS_LOGIN_THRESHOLD) {
        flags.push({
          patientId,
          reason: `${windowEvents.length} logins within 10 minutes`,
          events: windowEvents.map((e) => e.id),
          detectedAt: new Date().toISOString(),
          severity: windowEvents.length >= SUSPICIOUS_LOGIN_THRESHOLD * 2 ? 'high' : 'medium',
        });
        break;
      }
    }
    return flags;
  }
}

export const activityFeedService = new ActivityFeedService();
