import { ErrorCategory, ErrorSeverity } from '../utils/error-taxonomy';
import logger from '../utils/logger';

export interface ErrorAnalytics {
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  avgResponseTime?: number;
  affectedUsers?: Set<string>;
}

export interface ErrorTrend {
  timestamp: Date;
  code: string;
  count: number;
  severity: ErrorSeverity;
}

export class ErrorAnalyticsService {
  private errorCounts: Map<string, ErrorAnalytics> = new Map();
  private errorTrends: ErrorTrend[] = [];
  private maxTrendEntries = 10000;

  recordError(
    code: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    userId?: string,
    responseTime?: number
  ): void {
    const existing = this.errorCounts.get(code) || {
      code,
      category,
      severity,
      count: 0,
      firstOccurrence: new Date(),
      lastOccurrence: new Date(),
      avgResponseTime: 0,
      affectedUsers: new Set<string>(),
    };

    existing.count++;
    existing.lastOccurrence = new Date();
    if (userId) existing.affectedUsers?.add(userId);
    if (responseTime && existing.avgResponseTime) {
      existing.avgResponseTime = (existing.avgResponseTime + responseTime) / 2;
    } else if (responseTime) {
      existing.avgResponseTime = responseTime;
    }

    this.errorCounts.set(code, existing);

    // Track trends
    this.errorTrends.push({
      timestamp: new Date(),
      code,
      count: 1,
      severity,
    });

    // Keep trends bounded
    if (this.errorTrends.length > this.maxTrendEntries) {
      this.errorTrends = this.errorTrends.slice(-this.maxTrendEntries);
    }
  }

  getErrorAnalytics(code?: string): ErrorAnalytics[] {
    if (code) {
      const error = this.errorCounts.get(code);
      return error ? [error] : [];
    }
    return Array.from(this.errorCounts.values());
  }

  getErrorTrends(
    code?: string,
    hoursBack: number = 24
  ): ErrorTrend[] {
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    let trends = this.errorTrends.filter((t) => t.timestamp >= cutoff);
    if (code) {
      trends = trends.filter((t) => t.code === code);
    }
    return trends;
  }

  getSeverityDistribution(): Record<ErrorSeverity, number> {
    const distribution: Record<ErrorSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const error of this.errorCounts.values()) {
      distribution[error.severity]++;
    }

    return distribution;
  }

  getCategoryDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const error of this.errorCounts.values()) {
      distribution[error.category] = (distribution[error.category] ?? 0) + error.count;
    }

    return distribution;
  }

  getTopErrors(limit = 10): ErrorAnalytics[] {
    return Array.from(this.errorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getCriticalErrors(): ErrorAnalytics[] {
    return Array.from(this.errorCounts.values())
      .filter((e) => e.severity === ErrorSeverity.CRITICAL || e.severity === ErrorSeverity.HIGH)
      .sort((a, b) => b.count - a.count);
  }

  getAffectedUsersCount(code?: string): number {
    if (code) {
      return this.errorCounts.get(code)?.affectedUsers?.size ?? 0;
    }

    const affectedUsers = new Set<string>();
    for (const error of this.errorCounts.values()) {
      error.affectedUsers?.forEach((userId) => affectedUsers.add(userId));
    }
    return affectedUsers.size;
  }

  reset(): void {
    this.errorCounts.clear();
    this.errorTrends = [];
    logger.info('[error-analytics] Counters reset');
  }

  getSummary() {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((sum, e) => sum + e.count, 0),
      uniqueErrorCodes: this.errorCounts.size,
      severityDistribution: this.getSeverityDistribution(),
      categoryDistribution: this.getCategoryDistribution(),
      affectedUsers: this.getAffectedUsersCount(),
      topErrors: this.getTopErrors(5),
      criticalErrors: this.getCriticalErrors(),
    };
  }
}

export const errorAnalytics = new ErrorAnalyticsService();
