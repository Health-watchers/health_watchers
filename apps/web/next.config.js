const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const path = require('path');
const { withSentryConfig } = require('@sentry/nextjs');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  // Set ANALYZE=true to open the bundle treemap in the browser (or write it
  // to disk in CI when no display is available).
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false, // never auto-open in CI
});

/*
 * Bundle optimization strategy
 * ----------------------------
 * 1. Analyze: run `ANALYZE=true pnpm --filter web build` to emit the
 *    @next/bundle-analyzer treemap (`.next/analyze/*.html`). Use it to spot
 *    the largest dependencies before reaching for alternatives.
 * 2. Split: heavy, route-specific libraries (recharts, @sentry, socket.io-client)
 *    are isolated into async chunks via the `cacheGroups` below and are loaded
 *    through dynamic `import()` at the component level (charts, PDF generator,
 *    signature pad) so they never land in the initial bundle.
 * 3. Tree-shake: `optimizePackageImports` rewrites barrel imports for
 *    recharts/@tanstack/lucide-react/clsx/tailwind-merge into deep imports, and
 *    `usedExports`/`sideEffects` let Webpack drop unused modules.
 * 4. CSS: Tailwind's content globs (see tailwind.config) purge unused classes at
 *    build time; verify no stray global CSS is imported from unused modules.
 * 5. Budget: `BUNDLE_SIZE_BUDGET_KB` (default 250 KB gzipped per client chunk)
 *    is enforced by the `BundleSizeBudgetPlugin` below, which fails the build
 *    when any emitted client chunk exceeds it.
 */
const zlib = require('zlib');

const BUNDLE_SIZE_BUDGET_KB = Number(process.env.BUNDLE_SIZE_BUDGET_KB || 250);

class BundleSizeBudgetPlugin {
  constructor({ budgetKb, isServer }) {
    this.budgetKb = budgetKb;
    this.isServer = isServer;
  }

  apply(compiler) {
    // Only enforce the budget for client bundles; server chunks are not shipped.
    if (this.isServer) return;
    compiler.hooks.thisCompilation.tap('BundleSizeBudgetPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'BundleSizeBudgetPlugin', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT },
        (assets) => {
          const violations = [];
          for (const [name, asset] of Object.entries(assets)) {
            if (!name.endsWith('.js')) continue;
            const gzipped = zlib.gzipSync(asset.source()).length / 1024;
            if (gzipped > this.budgetKb) {
              violations.push(`${name}: ${gzipped.toFixed(1)} KB gzipped (budget ${this.budgetKb} KB)`);
            }
          }
          if (violations.length > 0) {
            compilation.errors.push(
              new compiler.webpack.WebpackError(
                `Bundle size budget exceeded:\n  ${violations.join('\n  ')}`,
              ),
            );
          }
        },
      );
    });
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
// Only use the CDN when NEXT_PUBLIC_CDN_URL is explicitly set; otherwise assets are
// served from the app origin. Next.js content-hashes every file under `/_next/static/`
// (e.g. `/_next/static/chunks/main-<hash>.js`), so those URLs are safe to cache forever.
const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || '';
const isProduction = process.env.NODE_ENV === 'production';

const cdnImageSources = cdnUrl ? `${cdnUrl} ` : '';
// CDN origin (if any) must be allowed for scripts, styles and fonts when assets are
// served from it via `assetPrefix`.
const cdnSources = cdnUrl ? `${cdnUrl} ` : '';
const staticAssetCacheControl = isProduction
  ? 'public, max-age=31536000, immutable' // 1 year; filenames are content-hashed
  : 'public, max-age=0, must-revalidate';
// The Content-Security-Policy is generated per-request in `middleware.ts` so that every
// response gets a fresh nonce (see `buildCspHeader`). A static CSP here cannot carry a
// nonce, so it is intentionally omitted. The middleware also reuses the API's CSP
// violation report collector (`csp-report.controller.ts`) via `report-uri`.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=(), payment=()' },
  // CDN caching headers
  {
    key: 'Cache-Control',
    value: isProduction
      ? 'public, max-age=31536000, immutable' // 1 year for immutable assets
      : 'public, max-age=0, must-revalidate',
  },
];

const nextConfig = {
  transpilePackages: ['@health-watchers/types'],
  experimental: {
    missingSuspenseWithCSRBailout: false,
    optimizePackageImports: [
      'recharts',
      '@tanstack/react-query',
      'lucide-react',
      'clsx',
      'tailwind-merge',
    ],
  },
  // CDN Configuration
  basePath: '',
  // Serve `/_next/static/` (and other build assets) from the CDN when configured.
  assetPrefix: cdnUrl || undefined,
  // Image optimization for CDN
  images: {
    remotePatterns: cdnUrl
      ? [
          {
            protocol: cdnUrl.split('://')[0],
            hostname: new URL(cdnUrl).hostname,
            pathname: '/**',
          },
        ]
      : [],
    unoptimized: false,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 year for optimized images
  },
  // Enable compression and gzip
  compress: true,
  // Powering down optimizations in production
  swcMinify: true,
  async headers() {
    return [
      // Security headers apply to every route.
      { source: '/:path*', headers: securityHeaders },
      // Content-hashed build assets can be cached immutably for a year. This entry is
      // listed after the catch-all so it overrides the generic Cache-Control value.
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: staticAssetCacheControl }],
      },
    ];
  },
  async redirects() {
    return [
      // Redirect old static asset paths to CDN if configured
      ...(cdnUrl
        ? [
            {
              source: '/fonts/:path*',
              destination: `${cdnUrl}/fonts/:path*`,
              permanent: true,
            },
            {
              source: '/images/:path*',
              destination: `${cdnUrl}/images/:path*`,
              permanent: true,
            },
          ]
        : []),
    ];
  },
  webpack: (config, { isServer }) => {
    config.plugins = config.plugins || [];
    config.plugins.push(new BundleSizeBudgetPlugin({ budgetKb: BUNDLE_SIZE_BUDGET_KB, isServer }));
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        runtimeChunk: 'single',
        splitChunks: {
          chunks: 'all',
          maxInitialRequests: 30,
          maxAsyncRequests: 30,
          minSize: 15000,
          maxSize: 200000,
          cacheGroups: {
            ...config.optimization?.splitChunks?.cacheGroups,
            default: {
              minChunks: 2,
              priority: -20,
              reuseExistingChunk: true,
              name: 'common',
            },
            defaultVendors: {
              test: /[\\/]node_modules[\\/]/,
              priority: -10,
              reuseExistingChunk: true,
              name: 'vendors',
            },
            recharts: {
              test: /[\\/]node_modules[\\/]recharts/,
              name: 'recharts',
              chunks: 'async',
              priority: 20,
              enforce: true,
            },
            sentry: {
              test: /[\\/]node_modules[\\/]@sentry/,
              name: 'sentry',
              chunks: 'async',
              priority: 20,
              enforce: true,
            },
            socketio: {
              test: /[\\/]node_modules[\\/]socket.io-client/,
              name: 'socketio',
              chunks: 'async',
              priority: 20,
              enforce: true,
            },
            react: {
              test: /[\\/]node_modules[\\/](react|react-dom|react-hook-form)[\\/]/,
              name: 'react-vendors',
              chunks: 'all',
              priority: 15,
              reuseExistingChunk: true,
            },
            tanstack: {
              test: /[\\/]node_modules[\\/]@tanstack[\\/]/,
              name: 'tanstack',
              chunks: 'all',
              priority: 15,
              reuseExistingChunk: true,
            },
            ui: {
              test: /[\\/]src[\\/](components)[\\/]/,
              name: 'ui',
              chunks: 'async',
              priority: 5,
              minChunks: 2,
              reuseExistingChunk: true,
            },
            tui: {
              test: /[\\/]src[\\/]components[\\/](forms|tables|charts)[\\/]/,
              name: 'feature-ui',
              chunks: 'async',
              priority: 8,
              minChunks: 2,
              reuseExistingChunk: true,
            },
          },
        },
        usedExports: true,
        sideEffects: false,
      };
    }
    return config;
  },
};

process.env.NEXT_DISABLE_LOCKFILE_PATCHING = '1';

module.exports = withSentryConfig(withBundleAnalyzer(withNextIntl(nextConfig)), {
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
