const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const path = require('path');
const { withSentryConfig } = require('@sentry/nextjs');

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || '';
const isProduction = process.env.NODE_ENV === 'production';

const cdnImageSources = cdnUrl ? `${cdnUrl} ` : '';
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' ${cdnUrl}; style-src 'self' 'unsafe-inline' ${cdnUrl}; img-src 'self' data: https: ${cdnImageSources}; font-src 'self' data: ${cdnUrl}; connect-src 'self' ${apiUrl} https://horizon-testnet.stellar.org https://horizon.stellar.org; frame-ancestors 'none';`,
  },
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
    optimizePackageImports: ['recharts', '@tanstack/react-query', 'lucide-react'],
  },
  // CDN Configuration
  basePath: '',
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
  // Enable compression
  compress: true,
  // Powering down optimizations in production
  swcMinify: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
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
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        runtimeChunk: 'single',
        splitChunks: {
          chunks: 'all',
          maxInitialRequests: 25,
          maxAsyncRequests: 25,
          minSize: 20000,
          maxSize: 244000,
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
              chunks: 'all',
              priority: 20,
              enforce: true,
            },
            sentry: {
              test: /[\\/]node_modules[\\/]@sentry/,
              name: 'sentry',
              chunks: 'all',
              priority: 20,
              enforce: true,
            },
            socketio: {
              test: /[\\/]node_modules[\\/]socket.io-client/,
              name: 'socketio',
              chunks: 'all',
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
              test: /[\\/]src[\\/](components|ui)[\\/]/,
              name: 'ui',
              chunks: 'async',
              priority: 5,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    return config;
  },
};

process.env.NEXT_DISABLE_LOCKFILE_PATCHING = '1';

module.exports = withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
