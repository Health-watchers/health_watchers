const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const path = require('path');
const { withSentryConfig } = require('@sentry/nextjs');

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ${apiUrl} https://horizon-testnet.stellar.org https://horizon.stellar.org; frame-ancestors 'none';`,
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=(), payment=()' },
];

const nextConfig = {
  transpilePackages: ['@health-watchers/types'],
  experimental: {
    missingSuspenseWithCSRBailout: false,
    optimizePackageImports: ['recharts', '@tanstack/react-query', 'lucide-react'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
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
