/**
 * Authentication Analytics Service
 * Tracks login patterns and detects anomalies
 * Issue #1235
 */

import { UserModel } from '../models/user.model';
import { auditLog } from '../../audit/audit.service';
import logger from '@api/utils/logger';

export interface LoginEvent {
  userId: string;
  ip: string;
  userAgent?: string;
  location?: { country: string; city: string; lat: number; lng: number };
  deviceFingerprint?: string;
  success: boolean;
  method: 'password' | 'mfa' | 'passkey' | 'security-questions';
  timestamp: Date;
}

export interface AnomalyScore {
  score: number; // 0-100
  factors: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export class AuthAnalyticsService {
  /**
   * Record login event
   */
  async recordLoginEvent(event: LoginEvent): Promise<void> {
    try {
      const user = await UserModel.findById(event.userId);
      if (!user) return;

      // Initialize login history if needed
      if (!user.loginHistory) {
        user.loginHistory = [];
      }

      // Add event to history (keep last 100)
      user.loginHistory.push(event);
      if (user.loginHistory.length > 100) {
        user.loginHistory = user.loginHistory.slice(-100);
      }

      // Update stats
      user.totalLoginAttempts = (user.totalLoginAttempts || 0) + 1;
      if (event.success) {
        user.successfulLogins = (user.successfulLogins || 0) + 1;
      } else {
        user.failedLogins = (user.failedLogins || 0) + 1;
      }

      await user.save();

      // Audit log
      await auditLog({
        userId: event.userId,
        action: event.success ? 'login_success' : 'login_failure',
        resourceType: 'auth',
        changes: {
          ip: event.ip,
          method: event.method,
          location: event.location?.city,
        },
      });
    } catch (error) {
      logger.error('Failed to record login event:', error);
    }
  }

  /**
   * Calculate anomaly score for login
   */
  async calculateAnomalyScore(
    userId: string,
    currentIp: string,
    userAgent?: string
  ): Promise<AnomalyScore> {
    const user = await UserModel.findById(userId);
    if (!user || !user.loginHistory || user.loginHistory.length === 0) {
      return { score: 10, factors: ['new_user'], riskLevel: 'low' };
    }

    const factors: string[] = [];
    let score = 0;

    // 1. Check time-based anomaly
    const lastLoginTime = user.loginHistory[user.loginHistory.length - 1]?.timestamp;
    if (lastLoginTime) {
      const hoursSinceLastLogin = (Date.now() - lastLoginTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastLogin < 1) {
        factors.push('rapid_successive_login');
        score += 15;
      }
    }

    // 2. Check for unusual time of day
    const hour = new Date().getHours();
    const typicalLoginHours = this.getTypicalLoginHours(user.loginHistory);
    if (!this.isWithinTypicalWindow(hour, typicalLoginHours)) {
      factors.push('unusual_time');
      score += 10;
    }

    // 3. Check for new IP
    const recentIps = new Set(user.loginHistory.slice(-20).map((e: any) => e.ip));
    if (!recentIps.has(currentIp)) {
      factors.push('new_ip_address');
      score += 20;
    }

    // 4. Check for new user agent
    if (userAgent) {
      const recentAgents = new Set(
        user.loginHistory
          .slice(-10)
          .filter((e: any) => e.userAgent)
          .map((e: any) => e.userAgent)
      );
      if (!recentAgents.has(userAgent)) {
        factors.push('new_device');
        score += 15;
      }
    }

    // 5. Check for VPN/Proxy
    const isVpn = this.detectVpn(currentIp);
    if (isVpn) {
      factors.push('vpn_detected');
      score += 10;
    }

    // 6. Check login velocity
    const recentAttempts = user.loginHistory.filter(
      (e: any) => Date.now() - e.timestamp.getTime() < 60 * 60 * 1000 // last hour
    );
    if (recentAttempts.length > 10) {
      factors.push('high_login_velocity');
      score += 20;
    }

    // 7. Failed login attempts before this
    const recentFailures = recentAttempts.filter((e: any) => !e.success);
    if (recentFailures.length > 3) {
      factors.push('multiple_failed_attempts');
      score += 25;
    }

    const riskLevel = score > 70 ? 'critical' : score > 50 ? 'high' : score > 25 ? 'medium' : 'low';

    return { score: Math.min(100, score), factors, riskLevel };
  }

  /**
   * Get login statistics for user
   */
  async getLoginStatistics(userId: string): Promise<{
    totalLogins: number;
    successfulLogins: number;
    failedLogins: number;
    successRate: number;
    lastLoginAt?: Date;
    deviceCount: number;
    locationCount: number;
  }> {
    const user = await UserModel.findById(userId).select('loginHistory');
    const history = user?.loginHistory || [];

    const successfulLogins = history.filter((e: any) => e.success).length;
    const failedLogins = history.filter((e: any) => !e.success).length;
    const totalLogins = successfulLogins + failedLogins;

    const devices = new Set(history.map((e: any) => e.userAgent));
    const locations = new Set(history.map((e: any) => e.location?.city));

    return {
      totalLogins,
      successfulLogins,
      failedLogins,
      successRate: totalLogins > 0 ? (successfulLogins / totalLogins) * 100 : 0,
      lastLoginAt: history[history.length - 1]?.timestamp,
      deviceCount: devices.size,
      locationCount: locations.size,
    };
  }

  /**
   * Alert on suspicious activity
   */
  async alertOnSuspiciousActivity(userId: string, anomalyScore: AnomalyScore): Promise<void> {
    if (anomalyScore.riskLevel === 'critical' || anomalyScore.riskLevel === 'high') {
      logger.warn(`Suspicious login detected for user ${userId}:`, {
        score: anomalyScore.score,
        factors: anomalyScore.factors,
      });

      // In production, send email alert
      // await sendSuspiciousActivityAlert(userId, anomalyScore);
    }
  }

  /**
   * Get typical login hours from history
   */
  private getTypicalLoginHours(loginHistory: any[]): number[] {
    const hourCounts = new Map<number, number>();

    loginHistory.forEach((event: any) => {
      const hour = new Date(event.timestamp).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    // Get top 4 hours
    return Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([hour]) => hour);
  }

  /**
   * Check if hour is within typical login window
   */
  private isWithinTypicalWindow(hour: number, typicalHours: number[]): boolean {
    if (typicalHours.length === 0) return true;
    return typicalHours.some((h) => Math.abs(h - hour) <= 2); // 2-hour window
  }

  /**
   * Detect if IP is from VPN/Proxy
   */
  private detectVpn(ip: string): boolean {
    // This is a simplified check. In production, use a VPN detection service
    // like MaxMind, IPQualityScore, etc.
    const vpnIndicators = ['vpn', 'proxy', 'tor'];
    return vpnIndicators.some((indicator) => ip.includes(indicator));
  }
}

export const authAnalyticsService = new AuthAnalyticsService();
