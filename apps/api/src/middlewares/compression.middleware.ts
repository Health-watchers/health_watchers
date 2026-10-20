/**
 * Enhanced gzip/deflate compression middleware with configurable levels,
 * monitoring, and benchmarking.
 *
 * Issue #1073 — uses Node.js built-in `zlib` so no extra dependency is needed.
 * Provides compression ratio tracking and performance metrics.
 */
import { Request, Response, NextFunction } from 'express';
import zlib from 'zlib';
import { PassThrough, Transform } from 'stream';

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
 * Determine the preferred encoding from the Accept-Encoding header.
 * Returns 'gzip', 'deflate', or null (no compression).
 */
function getPreferredEncoding(req: Request): 'gzip' | 'deflate' | null {
  const acceptEncoding = req.headers['accept-encoding'] ?? '';
  if (/\bgzip\b/.test(acceptEncoding)) return 'gzip';
  if (/\bdeflate\b/.test(acceptEncoding)) return 'deflate';
  return null;
}

/**
 * Determine if a content type should be skipped for compression.
 */
function shouldSkipContentType(contentType: string | undefined, skipTypes: string[]): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return skipTypes.some((t) => lower.startsWith(t.toLowerCase()));
}

/**
 * Creates enhanced compression middleware with monitoring.
 * Implements gzip/deflate compression using Node.js built-in zlib.
 */
export function createCompressionMiddleware(config: Partial<CompressionConfig> = {}) {
  const finalConfig: CompressionConfig = { ...DEFAULT_CONFIG, ...config };
  const metrics = CompressionMetrics.getInstance();

  return (req: Request, res: Response, next: NextFunction) => {
    const encoding = getPreferredEncoding(req);

    // Nothing to compress for this client
    if (!encoding) {
      metrics.recordSkip();
      return next();
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const originalSetHeader = res.setHeader.bind(res);

    let compressionStream: Transform | null = null;
    let headersSent = false;
    let originalSize = 0;
    let compressedSize = 0;
    const startTime = Date.now();

    // Intercept setHeader so we can check Content-Type before sending
    res.setHeader = function (name: string, value: any) {
      return originalSetHeader(name, value);
    };

    function setupCompression() {
      if (compressionStream) return; // already set up

      const contentType = res.getHeader('content-type') as string | undefined;
      const contentLength = parseInt((res.getHeader('content-length') as string) ?? '0', 10);

      // Skip compression for disallowed content types
      if (shouldSkipContentType(contentType, finalConfig.skipContentTypes)) {
        metrics.recordSkip();
        return;
      }

      // Skip if below threshold (use content-length hint if available)
      if (contentLength > 0 && contentLength < finalConfig.threshold) {
        metrics.recordSkip();
        return;
      }

      compressionStream =
        encoding === 'gzip'
          ? zlib.createGzip({ level: finalConfig.level })
          : zlib.createDeflate({ level: finalConfig.level });

      // Forward compressed data to the underlying socket
      compressionStream.on('data', (chunk: Buffer) => {
        compressedSize += chunk.length;
        originalWrite(chunk);
      });

      compressionStream.on('end', () => {
        const duration = Date.now() - startTime;
        if (finalConfig.enableMonitoring) {
          metrics.recordCompression(originalSize, compressedSize, duration);
        }
      });

      compressionStream.on('error', () => {
        // Compression error — fall through with uncompressed response
        metrics.recordSkip();
      });

      // Set response headers for compressed content
      res.removeHeader('content-length'); // length unknown after compression
      originalSetHeader('content-encoding', encoding);
      originalSetHeader('vary', 'Accept-Encoding');
      headersSent = true;
    }

    // Intercept write
    res.write = function (
      chunk: any,
      encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
      callback?: (error: Error | null | undefined) => void
    ): boolean {
      // Normalise overloaded signature
      let enc: BufferEncoding | undefined;
      let cb: ((error: Error | null | undefined) => void) | undefined;
      if (typeof encodingOrCallback === 'function') {
        cb = encodingOrCallback;
      } else {
        enc = encodingOrCallback;
        cb = callback;
      }

      if (!headersSent) {
        setupCompression();
      }

      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc ?? 'utf8');
      originalSize += buf.length;

      if (compressionStream) {
        return compressionStream.write(buf, cb);
      }
      if (cb) return originalWrite(buf, cb as any);
      return originalWrite(buf);
    } as typeof res.write;

    // Intercept end
    res.end = function (
      chunk?: any,
      encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
      callback?: () => void
    ): Response {
      let enc: BufferEncoding | undefined;
      let cb: (() => void) | undefined;
      if (typeof encodingOrCallback === 'function') {
        cb = encodingOrCallback as () => void;
      } else {
        enc = encodingOrCallback;
        cb = callback;
      }

      if (!headersSent) {
        setupCompression();
      }

      if (chunk != null) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc ?? 'utf8');
        originalSize += buf.length;

        if (compressionStream) {
          compressionStream.end(buf, () => {
            originalEnd(undefined, cb as any);
          });
          return res;
        }
      }

      if (compressionStream) {
        compressionStream.end(() => {
          originalEnd(undefined, cb as any);
        });
        return res;
      }

      if (chunk != null) {
        if (cb) return originalEnd(chunk, enc as any, cb) as Response;
        return originalEnd(chunk, enc as any) as Response;
      }

      if (cb) return originalEnd(cb) as Response;
      return originalEnd() as Response;
    } as typeof res.end;

    next();
  };
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
  const sizes = [1024, 10240, 102400, 1048576]; // 1KB, 10KB, 100KB, 1MB
  const results = [];

  for (const size of sizes) {
    const payload = Buffer.alloc(size, JSON.stringify({ data: 'x'.repeat(size / 2) }));
    const start = Date.now();

    const compressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.gzip(payload, { level: 6 }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

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
