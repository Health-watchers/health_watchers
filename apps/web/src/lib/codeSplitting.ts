/**
 * Code Splitting and Route-based Optimization Configuration
 * Enables dynamic imports and prefetching strategies for improved performance
 */

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import { webConfig } from './config';

export interface DynamicImportOptions {
  ssr?: boolean;
  loading?: ComponentType;
}

/**
 * Create a dynamically imported component with loading state
 * Useful for route-specific components that don't need to be in the initial bundle
 */
export const createDynamicComponent = <P extends Record<string, unknown>>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options: DynamicImportOptions = {},
) => {
  return dynamic(importFn, {
    ssr: options.ssr ?? true,
    loading: options.loading,
  });
};

/**
 * Prefetch resources at idle time for better perceived performance
 * Useful for components that will likely be navigated to
 */
export const prefetchComponent = (href: string): void => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    requestIdleCallback(() => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.as = 'script';
      document.head.appendChild(link);
    });
  }
};

/**
 * Prefetch multiple components when the user is idle
 */
export const prefetchComponents = (routes: string[]): void => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    requestIdleCallback(() => {
      routes.forEach((route) => {
        prefetchComponent(route);
      });
    });
  }
};

/**
 * Monitor and report bundle analytics for continuous optimization
 * Can be sent to your analytics service for tracking
 */
export interface BundleMetrics {
  routeName: string;
  chunkSize: number;
  loadTime: number;
  timestamp: Date;
}

export const reportBundleMetrics = (metrics: BundleMetrics): void => {
  // This can be integrated with your analytics service
  if (webConfig.isDev()) {
    console.log('[Bundle Metrics]', {
      route: metrics.routeName,
      sizeKB: (metrics.chunkSize / 1024).toFixed(2),
      loadTimeMS: metrics.loadTime,
    });
  }
};

/**
 * Hook to prefetch related routes on component mount
 * Usage: useRoutePreload(['/encounters', '/payments'])
 */
export const useRoutePreload = (routes: string[]): void => {
  if (typeof window !== 'undefined') {
    // Prefetch routes when component mounts
    routes.forEach((route) => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = route;
      document.head.appendChild(link);
    });
  }
};

/**
 * Configure which routes should be prefetched on application startup
 */
export const PREFETCH_ROUTES = [
  '/_next/static/chunks/pages/dashboard',
  '/_next/static/chunks/pages/encounters',
  '/_next/static/chunks/pages/patients',
  '/_next/static/chunks/pages/payments',
];

/**
 * Critical chunks that should be loaded immediately
 */
export const CRITICAL_CHUNKS = ['react', 'react-dom', 'next-intl'];

/**
 * Chunks that can be deferred until idle
 */
export const DEFERRED_CHUNKS = ['recharts', 'socket.io-client'];
