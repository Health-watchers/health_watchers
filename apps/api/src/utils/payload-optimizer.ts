import { Response } from 'express';

export interface PayloadMetrics {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  fieldsRemoved: number;
  executionTime: number;
}

export interface OptimizationConfig {
  removeNullFields?: boolean;
  removeEmptyArrays?: boolean;
  removeEmptyObjects?: boolean;
  maxDepth?: number;
  excludeFields?: string[];
  includeFields?: string[];
  stripHtmlTags?: boolean;
  truncateStrings?: number;
}

export class PayloadOptimizer {
  private defaultConfig: OptimizationConfig = {
    removeNullFields: true,
    removeEmptyArrays: true,
    removeEmptyObjects: false,
    maxDepth: 10,
  };

  optimizePayload(data: any, config?: OptimizationConfig): { data: any; metrics: PayloadMetrics } {
    const startTime = performance.now();
    const mergedConfig = { ...this.defaultConfig, ...config };

    const originalData = JSON.stringify(data);
    const originalSize = Buffer.byteLength(originalData, 'utf8');

    const optimizedData = this.recursiveOptimize(data, mergedConfig, 0);

    const optimizedDataStr = JSON.stringify(optimizedData);
    const optimizedSize = Buffer.byteLength(optimizedDataStr, 'utf8');

    const executionTime = performance.now() - startTime;

    const metrics: PayloadMetrics = {
      originalSize,
      optimizedSize,
      compressionRatio: ((originalSize - optimizedSize) / originalSize) * 100,
      fieldsRemoved: this.countRemovedFields(data, optimizedData),
      executionTime,
    };

    return { data: optimizedData, metrics };
  }

  optimizePayloadWithMetrics(data: any, res: Response, config?: OptimizationConfig): any {
    const { data: optimized, metrics } = this.optimizePayload(data, config);

    res.setHeader('X-Payload-Original-Size', metrics.originalSize);
    res.setHeader('X-Payload-Optimized-Size', metrics.optimizedSize);
    res.setHeader('X-Payload-Compression-Ratio', metrics.compressionRatio.toFixed(2));
    res.setHeader('X-Payload-Fields-Removed', metrics.fieldsRemoved);
    res.setHeader('X-Payload-Optimization-Time', metrics.executionTime.toFixed(2));

    return optimized;
  }

  private recursiveOptimize(data: any, config: OptimizationConfig, depth: number): any {
    if (data === null || data === undefined) {
      if (config.removeNullFields) return undefined;
      return data;
    }

    if (depth > (config.maxDepth || 10)) {
      return data;
    }

    if (Array.isArray(data)) {
      let arr = data
        .map((item) => this.recursiveOptimize(item, config, depth + 1))
        .filter((item) => item !== undefined);

      if (config.removeEmptyArrays && arr.length === 0) {
        return undefined;
      }

      return arr;
    }

    if (typeof data === 'object' && data !== null) {
      const optimized: Record<string, any> = {};

      for (const [key, value] of Object.entries(data)) {
        if (this.shouldExcludeField(key, config)) {
          continue;
        }

        const optimizedValue = this.recursiveOptimize(value, config, depth + 1);

        if (optimizedValue === undefined && config.removeNullFields) {
          continue;
        }

        if (
          Array.isArray(optimizedValue) &&
          config.removeEmptyArrays &&
          optimizedValue.length === 0
        ) {
          continue;
        }

        if (
          typeof optimizedValue === 'object' &&
          optimizedValue !== null &&
          Object.keys(optimizedValue).length === 0 &&
          config.removeEmptyObjects
        ) {
          continue;
        }

        optimized[key] = optimizedValue;
      }

      return Object.keys(optimized).length > 0 ? optimized : undefined;
    }

    if (typeof data === 'string') {
      if (config.stripHtmlTags) {
        return data.replace(/<[^>]*>/g, '');
      }
      if (config.truncateStrings && data.length > config.truncateStrings) {
        return data.substring(0, config.truncateStrings) + '...';
      }
    }

    return data;
  }

  private shouldExcludeField(fieldName: string, config: OptimizationConfig): boolean {
    if (config.excludeFields && config.excludeFields.includes(fieldName)) {
      return true;
    }

    if (config.includeFields && !config.includeFields.includes(fieldName)) {
      return true;
    }

    return false;
  }

  private countRemovedFields(original: any, optimized: any): number {
    if (typeof original !== 'object' || typeof optimized !== 'object') {
      return 0;
    }

    let count = 0;

    for (const key of Object.keys(original)) {
      if (!(key in optimized)) {
        count++;
      } else if (typeof original[key] === 'object' && typeof optimized[key] === 'object') {
        count += this.countRemovedFields(original[key], optimized[key]);
      }
    }

    return count;
  }

  getOptimizationRecommendations(data: any): string[] {
    const recommendations: string[] = [];

    const findNullFields = (obj: any, path = ''): string[] => {
      const nullFields: string[] = [];

      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          nullFields.push(...findNullFields(item, `${path}[${index}]`));
        });
      } else if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          const fieldPath = path ? `${path}.${key}` : key;

          if (value === null || value === undefined) {
            nullFields.push(fieldPath);
          } else if (typeof value === 'object') {
            nullFields.push(...findNullFields(value, fieldPath));
          }
        }
      }

      return nullFields;
    };

    const nullFields = findNullFields(data);
    if (nullFields.length > 10) {
      recommendations.push(`Remove ${nullFields.length} null/undefined fields`);
    }

    const dataStr = JSON.stringify(data);
    const dataSize = Buffer.byteLength(dataStr, 'utf8');

    if (dataSize > 1000000) {
      // 1MB
      recommendations.push('Payload exceeds 1MB - consider pagination or field selection');
    }

    if (dataStr.includes('</')) {
      recommendations.push('HTML tags detected - consider stripping them');
    }

    return recommendations;
  }
}

export const payloadOptimizer = new PayloadOptimizer();
