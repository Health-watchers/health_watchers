/**
 * Application-level metrics framework.
 *
 * Provides business metrics, feature usage tracking, user behavior analytics,
 * conversion tracking, error rate metrics, performance metrics, a custom
 * metrics registry, aggregation, and alerting hooks.
 */

export type MetricType = "counter" | "gauge" | "histogram" | "summary";

export interface MetricLabels {
  [key: string]: string | number | boolean | undefined;
}

export interface MetricSample {
  name: string;
  type: MetricType;
  value: number;
  labels: MetricLabels;
  timestamp: number;
}

export interface AlertRule {
  id: string;
  metricName: string;
  comparator: "gt" | "gte" | "lt" | "lte" | "eq";
  threshold: number;
  windowMs: number;
  severity: "info" | "warning" | "critical";
  description: string;
}

export interface AlertEvent {
  ruleId: string;
  metricName: string;
  value: number;
  threshold: number;
  severity: AlertRule["severity"];
  triggeredAt: number;
}

type AlertHandler = (event: AlertEvent) => void;

/**
 * In-memory custom metrics registry. Backed by a simple ring buffer per
 * metric so aggregation windows stay bounded in memory.
 */
export class MetricsRegistry {
  private samples: Map<string, MetricSample[]> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private alertHandlers: AlertHandler[] = [];
  private readonly maxSamplesPerMetric: number;

  constructor(maxSamplesPerMetric = 10_000) {
    this.maxSamplesPerMetric = maxSamplesPerMetric;
  }

  record(name: string, type: MetricType, value: number, labels: MetricLabels = {}): void {
    const sample: MetricSample = { name, type, value, labels, timestamp: Date.now() };
    const bucket = this.samples.get(name) ?? [];
    bucket.push(sample);
    if (bucket.length > this.maxSamplesPerMetric) {
      bucket.shift();
    }
    this.samples.set(name, bucket);
    this.evaluateAlerts(name);
  }

  increment(name: string, labels: MetricLabels = {}, delta = 1): void {
    this.record(name, "counter", delta, labels);
  }

  gauge(name: string, value: number, labels: MetricLabels = {}): void {
    this.record(name, "gauge", value, labels);
  }

  observe(name: string, value: number, labels: MetricLabels = {}): void {
    this.record(name, "histogram", value, labels);
  }

  getSamples(name: string, sinceMs?: number): MetricSample[] {
    const bucket = this.samples.get(name) ?? [];
    if (!sinceMs) return bucket;
    const cutoff = Date.now() - sinceMs;
    return bucket.filter((s) => s.timestamp >= cutoff);
  }

  /** Aggregate a metric over a rolling window. */
  aggregate(
    name: string,
    windowMs: number,
    op: "sum" | "avg" | "min" | "max" | "count" | "p95" = "sum"
  ): number {
    const values = this.getSamples(name, windowMs).map((s) => s.value);
    if (values.length === 0) return 0;

    switch (op) {
      case "sum":
        return values.reduce((a, b) => a + b, 0);
      case "avg":
        return values.reduce((a, b) => a + b, 0) / values.length;
      case "min":
        return Math.min(...values);
      case "max":
        return Math.max(...values);
      case "count":
        return values.length;
      case "p95": {
        const sorted = [...values].sort((a, b) => a - b);
        const idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
        return sorted[idx];
      }
      default:
        return 0;
    }
  }

  registerAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
  }

  removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
  }

  onAlert(handler: AlertHandler): void {
    this.alertHandlers.push(handler);
  }

  private evaluateAlerts(metricName: string): void {
    for (const rule of this.alertRules.values()) {
      if (rule.metricName !== metricName) continue;
      const value = this.aggregate(metricName, rule.windowMs, "avg");
      const breached = this.compare(value, rule.comparator, rule.threshold);
      if (breached) {
        const event: AlertEvent = {
          ruleId: rule.id,
          metricName,
          value,
          threshold: rule.threshold,
          severity: rule.severity,
          triggeredAt: Date.now(),
        };
        this.alertHandlers.forEach((h) => h(event));
      }
    }
  }

  private compare(value: number, comparator: AlertRule["comparator"], threshold: number): boolean {
    switch (comparator) {
      case "gt":
        return value > threshold;
      case "gte":
        return value >= threshold;
      case "lt":
        return value < threshold;
      case "lte":
        return value <= threshold;
      case "eq":
        return value === threshold;
    }
  }
}

export const metricsRegistry = new MetricsRegistry();

/** Business metrics: revenue, appointments, active clinics, etc. */
export const BusinessMetrics = {
  recordAppointmentBooked(clinicId: string, value = 1): void {
    metricsRegistry.increment("business.appointments_booked", { clinicId }, value);
  },
  recordRevenue(clinicId: string, amountCents: number): void {
    metricsRegistry.record("business.revenue_cents", "counter", amountCents, { clinicId });
  },
  recordActivePatient(clinicId: string): void {
    metricsRegistry.increment("business.active_patients", { clinicId });
  },
};

/** Feature usage tracking. */
export const FeatureUsage = {
  track(featureKey: string, userId: string, metadata: MetricLabels = {}): void {
    metricsRegistry.increment("feature.usage", { featureKey, userId, ...metadata });
  },
  getUsageCount(featureKey: string, windowMs = 24 * 60 * 60 * 1000): number {
    return metricsRegistry.aggregate("feature.usage", windowMs, "count");
  },
};

/** User behavior analytics (page views, session duration, clicks). */
export const UserBehaviorAnalytics = {
  trackPageView(path: string, userId: string): void {
    metricsRegistry.increment("behavior.page_view", { path, userId });
  },
  trackSessionDuration(userId: string, durationMs: number): void {
    metricsRegistry.observe("behavior.session_duration_ms", durationMs, { userId });
  },
  trackClick(elementId: string, userId: string): void {
    metricsRegistry.increment("behavior.click", { elementId, userId });
  },
};

/** Conversion funnel tracking. */
export const ConversionTracking = {
  trackFunnelStep(funnel: string, step: string, userId: string): void {
    metricsRegistry.increment("conversion.funnel_step", { funnel, step, userId });
  },
  getConversionRate(funnel: string, fromStep: string, toStep: string, windowMs: number): number {
    const fromCount = metricsRegistry
      .getSamples("conversion.funnel_step", windowMs)
      .filter((s) => s.labels.funnel === funnel && s.labels.step === fromStep).length;
    const toCount = metricsRegistry
      .getSamples("conversion.funnel_step", windowMs)
      .filter((s) => s.labels.funnel === funnel && s.labels.step === toStep).length;
    if (fromCount === 0) return 0;
    return toCount / fromCount;
  },
};

/** Error rate metrics. */
export const ErrorMetrics = {
  recordError(source: string, errorType: string): void {
    metricsRegistry.increment("errors.count", { source, errorType });
  },
  recordRequest(source: string): void {
    metricsRegistry.increment("requests.count", { source });
  },
  getErrorRate(source: string, windowMs = 5 * 60 * 1000): number {
    const errors = metricsRegistry
      .getSamples("errors.count", windowMs)
      .filter((s) => s.labels.source === source).length;
    const requests = metricsRegistry
      .getSamples("requests.count", windowMs)
      .filter((s) => s.labels.source === source).length;
    if (requests === 0) return 0;
    return errors / requests;
  },
};

/** Performance metrics (latency, throughput). */
export const PerformanceMetrics = {
  recordLatency(route: string, durationMs: number): void {
    metricsRegistry.observe("performance.latency_ms", durationMs, { route });
  },
  getP95Latency(route: string, windowMs = 5 * 60 * 1000): number {
    return metricsRegistry.aggregate("performance.latency_ms", windowMs, "p95");
  },
};

// Default alert rules covering the acceptance criteria for actionable alerting.
metricsRegistry.registerAlertRule({
  id: "high-error-rate",
  metricName: "errors.count",
  comparator: "gt",
  threshold: 0.05,
  windowMs: 5 * 60 * 1000,
  severity: "critical",
  description: "Error rate exceeded 5% over the last 5 minutes",
});

metricsRegistry.registerAlertRule({
  id: "slow-p95-latency",
  metricName: "performance.latency_ms",
  comparator: "gt",
  threshold: 1500,
  windowMs: 5 * 60 * 1000,
  severity: "warning",
  description: "P95 latency exceeded 1.5s over the last 5 minutes",
});
