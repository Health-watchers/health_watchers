import { Request, Response, NextFunction } from 'express';
import { payloadOptimizer } from '../utils/payload-optimizer';

export interface ResponseOptimizationOptions {
  enableMetrics?: boolean;
  removeNullFields?: boolean;
  removeEmptyArrays?: boolean;
  enableCompression?: boolean;
  maxPayloadSize?: number;
  enableLogging?: boolean;
}

const defaultOptions: ResponseOptimizationOptions = {
  enableMetrics: true,
  removeNullFields: true,
  removeEmptyArrays: true,
  enableCompression: true,
  maxPayloadSize: 5000000, // 5MB
  enableLogging: false,
};

export const optimizeResponsePayload = (
  options: ResponseOptimizationOptions = {}
) => {
  const mergedOptions = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (data: any) {
      try {
        const { data: optimized, metrics } = payloadOptimizer.optimizePayload(data, {
          removeNullFields: mergedOptions.removeNullFields,
          removeEmptyArrays: mergedOptions.removeEmptyArrays,
        });

        if (mergedOptions.enableMetrics && metrics) {
          res.setHeader('X-Response-Metrics', JSON.stringify(metrics));
          res.setHeader('X-Payload-Original-Size', metrics.originalSize);
          res.setHeader('X-Payload-Optimized-Size', metrics.optimizedSize);
          res.setHeader('X-Payload-Compression-Ratio', `${metrics.compressionRatio.toFixed(2)}%`);
        }

        if (mergedOptions.enableLogging && metrics.compressionRatio > 10) {
          console.log(`[Response Optimization] ${req.path}: ${metrics.compressionRatio.toFixed(2)}% reduction`);
        }

        if (mergedOptions.maxPayloadSize && metrics.optimizedSize > mergedOptions.maxPayloadSize) {
          res.warning(`Payload size (${metrics.optimizedSize} bytes) exceeds recommended maximum`);
        }

        return originalJson(optimized);
      } catch (error) {
        console.error('Error optimizing response payload:', error);
        return originalJson(data);
      }
    };

    next();
  };
};

export const attachOptimizationMetrics = (req: Request, res: Response, next: NextFunction) => {
  res.getOptimizationMetrics = () => {
    return {
      originalSize: res.getHeader('X-Payload-Original-Size'),
      optimizedSize: res.getHeader('X-Payload-Optimized-Size'),
      compressionRatio: res.getHeader('X-Payload-Compression-Ratio'),
    };
  };

  next();
};

export const validatePayloadSize = (maxSize: number = 10000000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.get('content-length') || '0', 10);

    if (contentLength > maxSize) {
      return res.status(413).json({
        error: 'Payload Too Large',
        message: `Request payload exceeds maximum size of ${maxSize} bytes`,
        receivedSize: contentLength,
      });
    }

    next();
  };
};

export const addResponseOptimizationHeaders = (req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => {
    const size = res.getHeader('content-length');

    if (size) {
      res.setHeader('X-Response-Size', size);
    }

    if (req.lazyLoadQuery?.lazyLoad) {
      res.setHeader('X-Lazy-Load-Enabled', 'true');
    }

    if (req.lazyLoadQuery?.fields) {
      res.setHeader('X-Fields-Selected', Array.isArray(req.lazyLoadQuery.fields)
        ? req.lazyLoadQuery.fields.join(',')
        : req.lazyLoadQuery.fields
      );
    }
  });

  next();
};
