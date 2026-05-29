import { Injectable } from '@nestjs/common';

export type FeeStrategy = 'slow' | 'standard' | 'fast';

export interface NetworkConditions {
  congestionLevel: 'low' | 'medium' | 'high';
  currentHour: number;
}

@Injectable()
export class FeeOptimizerService {
  selectStrategy(
    amountXLM: number,
    conditions: NetworkConditions,
  ): FeeStrategy {
    if (amountXLM >= 1000) return 'fast';
    if (conditions.congestionLevel === 'high') return 'fast';
    const isOffPeak = conditions.currentHour >= 0 && conditions.currentHour < 6;
    if (isOffPeak && conditions.congestionLevel === 'low') return 'slow';
    return 'standard';
  }

  getCurrentConditions(): NetworkConditions {
    return {
      congestionLevel: 'low',
      currentHour: new Date().getUTCHours(),
    };
  }
}
