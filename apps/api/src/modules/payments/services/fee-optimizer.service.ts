import axios from 'axios';
import { config } from '@health-watchers/config';
import logger from '@api/utils/logger';

export type FeeStrategy = 'slow' | 'standard' | 'fast';

export interface NetworkConditions {
  congestionLevel: 'low' | 'medium' | 'high';
  currentHour: number;
}

export class FeeOptimizerService {
  selectStrategy(amountXLM: number, conditions: NetworkConditions): FeeStrategy {
    if (amountXLM >= 1000) return 'fast';
    if (conditions.congestionLevel === 'high') return 'fast';
    const isOffPeak = conditions.currentHour >= 0 && conditions.currentHour < 6;
    if (isOffPeak && conditions.congestionLevel === 'low') return 'slow';
    return 'standard';
  }

  async getCurrentConditions(): Promise<NetworkConditions> {
    try {
      const response = await axios.get(`${config.stellarServiceUrl}/network-status`, {
        timeout: 3000,
      });
      const backlog = response.data?.backlog;
      const congestionRaw: string = backlog?.congestionLevel ?? 'low';

      // Map stellar-service congestion levels to optimizer levels
      let congestionLevel: NetworkConditions['congestionLevel'];
      if (congestionRaw === 'high' || congestionRaw === 'critical') {
        congestionLevel = 'high';
      } else if (congestionRaw === 'moderate') {
        congestionLevel = 'medium';
      } else {
        congestionLevel = 'low';
      }

      return { congestionLevel, currentHour: new Date().getUTCHours() };
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to fetch network conditions, defaulting to low');
      return { congestionLevel: 'low', currentHour: new Date().getUTCHours() };
    }
  }

  async selectStrategyAuto(
    amountXLM: number,
    clinicPreference?: FeeStrategy | 'auto'
  ): Promise<FeeStrategy> {
    // If clinic has a fixed preference, respect it
    if (clinicPreference && clinicPreference !== 'auto') return clinicPreference;
    const conditions = await this.getCurrentConditions();
    return this.selectStrategy(amountXLM, conditions);
  }
}

export const feeOptimizer = new FeeOptimizerService();
