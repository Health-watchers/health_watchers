import { Types } from 'mongoose';
import { FeatureFlagModel } from './feature-flag.model';
import redis from '@api/lib/redis';

const CACHE_PREFIX = 'feature_flag:';
const CACHE_TTL = 60; // 60 seconds

export interface FeatureFlagContext {
  userId?: string;
  clinicId?: string;
}

export class FeatureFlagsService {
  async isEnabled(flag: string, context?: FeatureFlagContext): Promise<boolean> {
    const cacheKey = `${CACHE_PREFIX}${flag}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const config = JSON.parse(cached);
        return this.evaluateFlag(config, context);
      }
    } catch (error) {
      console.error('Cache read error:', error);
    }

    try {
      const flagConfig = await FeatureFlagModel.findOne({ key: flag });
      if (!flagConfig) return false;

      // Cache the flag configuration
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(flagConfig.toObject()));

      return this.evaluateFlag(flagConfig.toObject(), context);
    } catch (error) {
      console.error('Database error:', error);
      return false;
    }
  }

  private evaluateFlag(config: any, context?: FeatureFlagContext): boolean {
    if (!context?.clinicId) {
      return config.enabled && Math.random() * 100 < config.rolloutPercentage;
    }

    // Check clinic overrides
    const override = config.clinicOverrides?.find(
      (o: any) => o.clinicId.toString() === context.clinicId
    );

    if (override) {
      return override.enabled && Math.random() * 100 < override.rolloutPercentage;
    }

    // Fall back to global setting
    return config.enabled && Math.random() * 100 < config.rolloutPercentage;
  }

  async invalidateCache(flagKey: string): Promise<void> {
    await redis.del(`${CACHE_PREFIX}${flagKey}`);
  }

  async getAllFlags(clinicId?: string): Promise<any[]> {
    const flags = await FeatureFlagModel.find().exec();

    return flags.map((flag) => ({
      key: flag.key,
      enabled: this.getClinicEnabled(flag, clinicId),
      rolloutPercentage: this.getClinicRollout(flag, clinicId),
    }));
  }

  private getClinicEnabled(flag: any, clinicId?: string): boolean {
    if (!clinicId) return flag.enabled;
    const override = flag.clinicOverrides?.find((o: any) => o.clinicId.toString() === clinicId);
    return override ? override.enabled : flag.enabled;
  }

  private getClinicRollout(flag: any, clinicId?: string): number {
    if (!clinicId) return flag.rolloutPercentage;
    const override = flag.clinicOverrides?.find((o: any) => o.clinicId.toString() === clinicId);
    return override ? override.rolloutPercentage : flag.rolloutPercentage;
  }
}

export const featureFlagsService = new FeatureFlagsService();
