/**
 * Enhanced compression middleware with configurable levels, monitoring, and benchmarking.
 * Provides compression ratio tracking and performance metrics for Prometheus.
 */
import { Request, Response, NextFunction } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require('compression') as ((...args: any[]) => any) & {
  filter: (...args: any[]) => boolean;
};

export interface CompressionConfig {
  /** Compression level (0-9). Default: 6 */
  level: number;
  /** Minimum response size in bytes to compress. Default: 1024 */
  threshold: number;
  /** Enable compression ratio monitoring */
  enableMonitoring: boolean;
  /** Content types to skip compression */
  skipContentTypes: string[];
}

const DEFAULT_CONFIG: CompressionConfig = {
  level: parseInt(process.env.COMPRESSION_LEVEL ?? '6', 10),
  threshold: parseInt(process.env.COMPRESSION_THRESHOLD ?? '1024', 10),
  enableMonitoring: process.env.COMPRESSION_MONITORING !== 'false',
  skipContentTypes: [
    'image/',
    'application/pdf',
    'application/zip',
    'application/gzip',
    'video/',
    'audio/',
  ],
};

/**
 * Tracks compression metrics for monitoring.
 */
export class CompressionMetrics {
  private static instance: CompressionMetrics;
  private totalRequests = 0;
  private compressedRequests = 0;
  private totalOriginalSize = 0;
  private totalCompressedSize = 0;
  private compressionTimes: number[] = [];

  static getInstance(): CompressionMetrics {
    if (!CompressionMetrics.instance) {
      CompressionMetrics.instance = new CompressionMetrics();
    }
    return CompressionMetrics.instance;
  }

  recordCompression(originalSize: number, compressedSize: number, durationMs: number): void {
    this.totalRequests++;
    this.compressedRequests++;
    this.totalOriginalSize += originalSize;
    this.totalCompressedSize += compressedSize;
    this.compressionTimes.push(durationMs);

    // Keep only last 1000 measurements for memory efficiency
    if (this.compressionTimes.length > 1000) {
      this.compressionTimes = this.compressionTimes.slice(-1000);
    }
  }

  recordSkip(): void {
    this.totalRequests++;
  }

  getStats() {
    const ratio =
      this.totalCompressedSize > 0
        ? ((1 - this.totalCompressedSize / this.totalOriginalSize) * 100).toFixed(2)
        : '0.00';
    const avgCompressionTime =
      this.compressionTimes.length > 0
        ? (this.compressionTimes.reduce((a, b) => a + b, 0) / this.compressionTimes.length).toFixed(
            2
          )
        : '0.00';

    return {
      totalRequests: this.totalRequests,
      compressedRequests: this.compressedRequests,
      compressionRate:
        this.totalRequests > 0
          ? ((this.compressedRequests / this.totalRequests) * 100).toFixed(2) + '%'
          : '0%',
      totalOriginalSize: this.formatBytes(this.totalOriginalSize),
      totalCompressedSize: this.formatBytes(this.totalCompressedSize),
      averageCompressionRatio: ratio + '%',
      averageCompressionTimeMs: avgCompressionTime,
    };
  }

  reset(): void {
    this.totalRequests = 0;
    this.compressedRequests = 0;
    this.totalOriginalSize = 0;
    this.totalCompressedSize = 0;
    this.compressionTimes = [];
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Creates enhanced compression middleware with monitoring.
 */
export function createCompressionMiddleware(config: Partial<CompressionConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const metrics = CompressionMetrics.getInstance();

  const middleware = compression({
    level: finalConfig.level,
    threshold: finalConfig.threshold,
    filter: (req: Request, res: Response) => {
      const contentType = res.getHeader('Content-Type') as string | undefined;

      // Skip if content type should be skipped
      if (contentType) {
        for (const skipType of finalConfig.skipContentTypes) {
          if (contentType.toLowerCase().startsWith(skipType.toLowerCase())) {
            metrics.recordSkip();
            return false;
          }
        }
      }

      // Use default compression filter
      return compression.filter(req, res);
    },
  });

  // Wrap with monitoring if enabled
  if (finalConfig.enableMonitoring) {
    return (req: Request, res: Response, next: NextFunction) => {
      const originalWrite = res.write;
      const originalEnd = res.end;
      let originalSize = 0;
      let compressedSize = 0;
      const startTime = Date.now();

      // Track response size
      res.write = function (chunk: any, ...args: any[]) {
        if (chunk) {
          originalSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        }
        return originalWrite.apply(res, [chunk, ...args]);
      } as any;

      res.end = function (chunk: any, ...args: any[]) {
        if (chunk) {
          compressedSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        }

        const duration = Date.now() - startTime;
        const contentEncoding = res.getHeader('Content-Encoding') as string | undefined;

        if (contentEncoding && ['gzip', 'br', 'deflate'].includes(contentEncoding)) {
          metrics.recordCompression(originalSize, compressedSize, duration);
        } else {
          metrics.recordSkip();
        }

        return originalEnd.apply(res, [chunk, ...args]);
      } as any;

      middleware(req, res, next);
    };
  }

  return middleware;
}

/**
 * Middleware to expose compression metrics endpoint.
 */
export function compressionMetricsEndpoint(req: Request, res: Response): void {
  const metrics = CompressionMetrics.getInstance();
  res.json({
    status: 'ok',
    metrics: metrics.getStats(),
  });
}

/**
 * Get compression benchmark results for different payload sizes.
 */
export async function benchmarkCompression(): Promise<
  Array<{
    payloadSize: string;
    originalBytes: number;
    compressedBytes: number;
    ratio: string;
    timeMs: number;
  }>
> {
  const gzip = await import('zlib').then((z) => z.promises.gzip);
  const sizes = [1024, 10240, 102400, 1048576]; // 1KB, 10KB, 100KB, 1MB
  const results = [];

  for (const size of sizes) {
    // Generate random data of specified size
    const payload = Buffer.alloc(size, JSON.stringify({ data: 'x'.repeat(size / 2) }));
    const start = Date.now();
    const compressed = await gzip(payload, { level: 6 });
    const duration = Date.now() - start;

    results.push({
      payloadSize: formatBytes(size),
      originalBytes: size,
      compressedBytes: compressed.length,
      ratio: ((1 - compressed.length / size) * 100).toFixed(2) + '%',
      timeMs: duration,
    });
  }

  return results;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
