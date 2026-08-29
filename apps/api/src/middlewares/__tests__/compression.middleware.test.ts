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

    const headers: Record<string, string | number | string[]> = {};
    mockRes = {
      getHeader: (name: string) => headers[name.toLowerCase()],
      setHeader: jest.fn((name: string, value: any) => {
        headers[name.toLowerCase()] = value;
        return mockRes as Response;
      }),
      removeHeader: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      end: jest.fn().mockReturnValue(mockRes),
      on: jest.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          callback();
        }
        return mockRes as Response;
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

    it('should call next when client does not accept encoding', () => {
      const middleware = createCompressionMiddleware({ enableMonitoring: true });

      // No Accept-Encoding header → skip compression, call next
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should set up compression for gzip clients', () => {
      const middleware = createCompressionMiddleware({ enableMonitoring: false });

      mockReq.headers = { 'accept-encoding': 'gzip, deflate' };

      middleware(mockReq as Request, mockRes as Response, mockNext);

      // next should still be called
      expect(mockNext).toHaveBeenCalled();
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
    });

    it('should calculate average compression time', () => {
      const metrics = CompressionMetrics.getInstance();

      metrics.recordCompression(1000, 500, 10);
      metrics.recordCompression(2000, 800, 20);

      const stats = metrics.getStats();
      expect(stats.averageCompressionTimeMs).toBe('15.00');
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
      expect(stats.averageCompressionTimeMs).toBe('0.00');
    });

    it('should record skips', () => {
      const metrics = CompressionMetrics.getInstance();
      metrics.reset();

      metrics.recordSkip();
      metrics.recordSkip();

      const stats = metrics.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.compressedRequests).toBe(0);
      expect(stats.compressionRate).toBe('0.00%');
    });
  });

  describe('compressionMetricsEndpoint', () => {
    it('should return metrics as JSON', () => {
      const { compressionMetricsEndpoint } = require('../compression.middleware');
      const mockResJson = jest.fn();

      compressionMetricsEndpoint(
        mockReq as Request,
        {
          ...mockRes,
          json: mockResJson,
        } as Response
      );

      expect(mockResJson).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
          metrics: expect.any(Object),
        })
      );
    });
  });
});
