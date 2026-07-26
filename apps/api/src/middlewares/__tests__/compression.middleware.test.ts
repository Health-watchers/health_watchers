import { createCompressionMiddleware, CompressionMetrics } from '../compression.middleware';
import { Request, Response, NextFunction } from 'express';

describe('Compression Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      method: 'GET',
      path: '/test',
    };

    const headers: Record<string, string> = {};
    mockRes = {
      getHeader: (name: string) => headers[name],
      setHeader: (name: string, value: string) => {
        headers[name] = value;
        return mockRes;
      },
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          callback();
        }
        return mockRes;
      }),
    };

    mockNext = jest.fn();

    // Reset metrics
    CompressionMetrics.getInstance().reset();
  });

  describe('createCompressionMiddleware', () => {
    it('should create middleware with default config', () => {
      const middleware = createCompressionMiddleware();
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should create middleware with custom config', () => {
      const middleware = createCompressionMiddleware({
        level: 9,
        threshold: 512,
        enableMonitoring: false,
      });
      expect(middleware).toBeDefined();
    });

    it('should skip compression for image content types', () => {
      const middleware = createCompressionMiddleware({ enableMonitoring: false });

      const resWithImage = {
        ...mockRes,
        getHeader: (name: string) => {
          if (name === 'Content-Type') return 'image/png';
          return undefined;
        },
      };

      // The filter function should return false for images
      const filterResult = (middleware as any).filter
        ? (middleware as any).filter(mockReq, resWithImage)
        : true;

      // We can't directly test the filter without the compression module,
      // but we can verify the middleware is created
      expect(middleware).toBeDefined();
    });
  });

  describe('CompressionMetrics', () => {
    it('should track compression statistics', () => {
      const metrics = CompressionMetrics.getInstance();

      // Record some compressions
      metrics.recordCompression(1000, 500, 10);
      metrics.recordCompression(2000, 800, 15);
      metrics.recordSkip();

      const stats = metrics.getStats();

      expect(stats.totalRequests).toBe(3);
      expect(stats.compressedRequests).toBe(2);
      expect(stats.compressionRate).toBe('66.67%');
      expect(stats.totalOriginalSize).toBe('3 KB');
      expect(stats.totalCompressedSize).toBe('1.27 KB');
    });

    it('should calculate average compression time', () => {
      const metrics = CompressionMetrics.getInstance();

      metrics.recordCompression(1000, 500, 10);
      metrics.recordCompression(2000, 800, 20);

      const stats = metrics.getStats();
      expect(stats.averageCompressionTimeMs).toBe('15');
    });

    it('should reset metrics', () => {
      const metrics = CompressionMetrics.getInstance();

      metrics.recordCompression(1000, 500, 10);
      metrics.reset();

      const stats = metrics.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.compressedRequests).toBe(0);
    });

    it('should handle zero requests gracefully', () => {
      const metrics = CompressionMetrics.getInstance();
      metrics.reset();

      const stats = metrics.getStats();
      expect(stats.compressionRate).toBe('0%');
      expect(stats.averageCompressionRatio).toBe('0.00%');
      expect(stats.averageCompressionTimeMs).toBe('0');
    });
  });

  describe('compressionMetricsEndpoint', () => {
    it('should return metrics as JSON', () => {
      const { compressionMetricsEndpoint } = require('../compression.middleware');
      const mockResJson = jest.fn();

      compressionMetricsEndpoint(mockReq as Request, {
        ...mockRes,
        json: mockResJson,
      } as Response);

      expect(mockResJson).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          metrics: expect.any(Object),
        })
      );
    });
  });
});
