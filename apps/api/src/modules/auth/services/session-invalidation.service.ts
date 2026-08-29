/**
 * Session Invalidation Service
 * Handles suspicious activity detection and session invalidation
 * Issue #1235
 */

import { UserModel } from '../models/user.model';
import { addToDenylist } from '@api/services/token-denylist.service';
import logger from '@api/utils/logger';

export interface SuspiciousActivity {
  type: 'multiple_failed_logins' | 'unusual_location' | 'rapid_requests' | 'impossible_travel' | 'new_device';
  severity: 'low' | 'medium' | 'high' | 'critical';
  ip: string;
  userAgent?: string;
  timestamp: Date;
  description: string;
}

export class SessionInvalidationService {
  private readonly failedLoginThreshold = 5;
  private readonly timeWindowMs = 15 * 60 * 1000; // 15 minutes
  private readonly minSecsBetweenLocations = 3600; // 1 hour

  /**
   * Record failed login attempt
   */
  async recordFailedLogin(userId: string, ip: string, userAgent?: string): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user) return;

    const now = new Date();
    user.failedLoginAttempts = user.failedLoginAttempts || [];

    // Add new attempt
    user.failedLoginAttempts.push({
      ip,
      userAgent,
      timestamp: now,
    });

    // Remove attempts older than time window
    user.failedLoginAttempts = user.failedLoginAttempts.filter(
      (attempt: any) => now.getTime() - attempt.timestamp.getTime() < this.timeWindowMs
    );

    // Check if threshold exceeded
    if (user.failedLoginAttempts.length >= this.failedLoginThreshold) {
      await this.lockAccount(userId, 'suspicious_activity');
      logger.warn(`Account locked due to multiple failed logins: ${userId}`);
    }

    await user.save();
  }

  /**
   * Clear failed login attempts on successful login
   */
  async clearFailedLogins(userId: string): Promise<void> {
    await UserModel.findByIdAndUpdate(userId, {
      failedLoginAttempts: [],
      lastSuccessfulLoginAt: new Date(),
    });
  }

  /**
   * Detect impossible travel (rapid location changes)
   */
  async detectImpossibleTravel(
    userId: string,
    currentIp: string,
    getLocation: (ip: string) => Promise<{ lat: number; lng: number } | null>
  ): Promise<SuspiciousActivity | null> {
    const user = await UserModel.findById(userId).select('lastLoginLocation lastLoginAt');
    if (!user || !user.lastLoginLocation) {
      return null; // No previous login to compare
    }

    const currentLocation = await getLocation(currentIp);
    if (!currentLocation) {
      return null; // Unable to geolocate
    }

    const lastLocation = user.lastLoginLocation;
    const timeSinceLastLogin = user.lastLoginAt ? Date.now() - user.lastLoginAt.getTime() : null;

    if (timeSinceLastLogin && timeSinceLastLogin < this.minSecsBetweenLocations * 1000) {
      const distance = this.calculateDistance(lastLocation.lat, lastLocation.lng, currentLocation.lat, currentLocation.lng);
      const requiredSpeed = distance / (timeSinceLastLogin / 1000 / 3600); // km/h

      // Speed > 900 km/h is impossible for human travel
      if (requiredSpeed > 900) {
        return {
          type: 'impossible_travel',
          severity: 'high',
          ip: currentIp,
          timestamp: new Date(),
          description: `Impossible travel detected: ${requiredSpeed.toFixed(0)} km/h`,
        };
      }
    }

    return null;
  }

  /**
   * Lock account with gradual unlock
   */
  async lockAccount(userId: string, reason: string): Promise<void> {
    const lockDurationMs = 15 * 60 * 1000; // Start with 15 minutes
    const unlockedAt = new Date(Date.now() + lockDurationMs);

    await UserModel.findByIdAndUpdate(userId, {
      isAccountLocked: true,
      lockReason: reason,
      lockStartedAt: new Date(),
      willUnlockAt: unlockedAt,
      lockAttempts: 1,
    });

    logger.warn(`Account locked for user ${userId}: ${reason}`);
  }

  /**
   * Check if account is currently locked
   */
  async isAccountLocked(userId: string): Promise<boolean> {
    const user = await UserModel.findById(userId).select('isAccountLocked willUnlockAt');
    if (!user || !user.isAccountLocked) {
      return false;
    }

    // Check if lock has expired
    if (user.willUnlockAt && user.willUnlockAt <= new Date()) {
      await UserModel.findByIdAndUpdate(userId, {
        isAccountLocked: false,
        lockReason: null,
        lockStartedAt: null,
        willUnlockAt: null,
      });
      return false;
    }

    return true;
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllSessions(userId: string, reason: string): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user) return;

    // Add all active refresh tokens to denylist
    const refreshTokens = await UserModel.collection
      .find({ userId, type: 'refresh' })
      .toArray();

    for (const token of refreshTokens) {
      await addToDenylist(token._id.toString());
    }

    // Update invalidation timestamp
    await UserModel.findByIdAndUpdate(userId, {
      allSessionsInvalidatedAt: new Date(),
      sessionInvalidationReason: reason,
    });

    logger.info(`All sessions invalidated for user ${userId}: ${reason}`);
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export const sessionInvalidationService = new SessionInvalidationService();
