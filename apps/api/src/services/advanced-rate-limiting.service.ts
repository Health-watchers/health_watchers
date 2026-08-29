import logger from '../utils/logger';

export enum SubscriptionTier {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

export interface RateLimitConfig {
  tier: SubscriptionTier;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstSize: number;
  concurrentRequests: number;
}

export interface RateLimitViolation {
  userId?: string;
  ip: string;
  endpoint: string;
  timestamp: Date;
  limitType: 'minute' | 'hour' | 'day' | 'burst';
}

const TIER_CONFIGS: Record<SubscriptionTier, RateLimitConfig> = {
  [SubscriptionTier.FREE]: {
    tier: SubscriptionTier.FREE,
    requestsPerMinute: 10,
    requestsPerHour: 100,
    requestsPerDay: 1000,
    burstSize: 5,
    concurrentRequests: 2,
  },
  [SubscriptionTier.BASIC]: {
    tier: SubscriptionTier.BASIC,
    requestsPerMinute: 30,
    requestsPerHour: 500,
    requestsPerDay: 5000,
    burstSize: 15,
    concurrentRequests: 5,
  },
  [SubscriptionTier.PREMIUM]: {
    tier: SubscriptionTier.PREMIUM,
    requestsPerMinute: 100,
    requestsPerHour: 2000,
    requestsPerDay: 20000,
    burstSize: 50,
    concurrentRequests: 20,
  },
  [SubscriptionTier.ENTERPRISE]: {
    tier: SubscriptionTier.ENTERPRISE,
    requestsPerMinute: 500,
    requestsPerHour: 10000,
    requestsPerDay: 100000,
    burstSize: 200,
    concurrentRequests: 100,
  },
};

export class AdvancedRateLimitingService {
  private violations: Map<string, RateLimitViolation[]> = new Map();
  private adaptiveThresholds: Map<string, number> = new Map();
  private requestCounts: Map<string, { timestamp: number; count: number }> = new Map();

  getTierConfig(tier: SubscriptionTier): RateLimitConfig {
    return TIER_CONFIGS[tier];
  }

  async checkRateLimit(
    key: string,
    tier: SubscriptionTier,
    limitType: 'minute' | 'hour' | 'day' = 'minute'
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    reason?: string;
  }> {
    const config = this.getTierConfig(tier);
    const limit =
      limitType === 'minute'
        ? config.requestsPerMinute
        : limitType === 'hour'
          ? config.requestsPerHour
          : config.requestsPerDay;

    const now = Date.now();
    const windowMs = limitType === 'minute' ? 60000 : limitType === 'hour' ? 3600000 : 86400000;

    const current = this.requestCounts.get(key) || { timestamp: now, count: 0 };

    if (now - current.timestamp > windowMs) {
      current.timestamp = now;
      current.count = 1;
      this.requestCounts.set(key, current);
      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: current.timestamp + windowMs,
      };
    }

    if (current.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: current.timestamp + windowMs,
        reason: `${limitType} rate limit exceeded`,
      };
    }

    current.count++;
    this.requestCounts.set(key, current);

    return {
      allowed: true,
      remaining: Math.max(0, limit - current.count),
      resetTime: current.timestamp + windowMs,
    };
  }

  async checkAdaptiveRateLimit(
    key: string,
    baseLimit: number,
    errorRate: number
  ): Promise<{
    allowed: boolean;
    adjustedLimit: number;
    reason?: string;
  }> {
    // Reduce limit if error rate is high
    if (errorRate > 0.5) {
      const adjustedLimit = Math.ceil(baseLimit * 0.5);
      return {
        allowed: baseLimit > adjustedLimit,
        adjustedLimit,
        reason: 'High error rate detected, limit reduced to 50%',
      };
    }

    // Restore limit if error rate is low
    if (errorRate < 0.1) {
      const adjustedLimit = Math.ceil(baseLimit * 1.2);
      return {
        allowed: true,
        adjustedLimit,
      };
    }

    return {
      allowed: true,
      adjustedLimit: baseLimit,
    };
  }

  async checkBurstAllowance(
    key: string,
    tier: SubscriptionTier,
    currentLoad: number
  ): Promise<{
    allowed: boolean;
    burstRemaining: number;
  }> {
    const config = this.getTierConfig(tier);
    const burstKey = `burst:${key}`;
    const current = this.requestCounts.get(burstKey) || { timestamp: Date.now(), count: 0 };
    const now = Date.now();

    // Reset burst every 5 minutes
    if (now - current.timestamp > 5 * 60 * 1000) {
      current.timestamp = now;
      current.count = 0;
    }

    const burstAllowed = current.count < config.burstSize;
    if (burstAllowed && currentLoad > 0.8) {
      current.count++;
      this.requestCounts.set(burstKey, current);
    }

    return {
      allowed: burstAllowed,
      burstRemaining: Math.max(0, config.burstSize - current.count),
    };
  }

  recordViolation(violation: RateLimitViolation): void {
    const key = violation.userId || violation.ip;
    const violations = this.violations.get(key) || [];
    violations.push(violation);

    // Keep last 100 violations per key
    if (violations.length > 100) {
      violations.shift();
    }

    this.violations.set(key, violations);
    logger.warn(
      { userId: violation.userId, ip: violation.ip, endpoint: violation.endpoint, limitType: violation.limitType },
      '[rate-limit] Violation recorded'
    );
  }

  getViolations(key: string, hoursBack: number = 24): RateLimitViolation[] {
    const violations = this.violations.get(key) || [];
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    return violations.filter((v) => v.timestamp >= cutoff);
  }

  getBypassList(): Set<string> {
    const bypassList = new Set<string>();
    // Add internal service IPs/keys here
    return bypassList;
  }

  async isInternalService(key: string): Promise<boolean> {
    return this.getBypassList().has(key);
  }

  resetCounters(): void {
    this.requestCounts.clear();
    this.violations.clear();
    this.adaptiveThresholds.clear();
    logger.info('[rate-limit] Counters reset');
  }

  getMetrics() {
    return {
      activeKeys: this.requestCounts.size,
      totalViolations: Array.from(this.violations.values()).reduce((sum, v) => sum + v.length, 0),
      violatedKeys: this.violations.size,
    };
  }
}

export const advancedRateLimiting = new AdvancedRateLimitingService();
