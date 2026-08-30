/**
 * Code Splitting and Route-based Optimization Configuration
 * Issue #1079 — Optimise frontend code splitting for faster initial loads.
 *
 * - createDynamicComponent: thin wrapper around next/dynamic for lazy loading
 * - prefetchComponent / prefetchComponents: idle-time resource hints
 * - useRoutePreload: React hook for declarative prefetching
 * - usePrefetchOnHover: prefetch a route when the user hovers a link
 * - reportBundleMetrics: lightweight analytics helper
 * - PREFETCH_ROUTES / CRITICAL_CHUNKS / DEFERRED_CHUNKS: routing constants
 */

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import { webConfig } from './config';

// ── Dynamic import helpers ────────────────────────────────────────────────────

export interface DynamicImportOptions {
  ssr?: boolean;
  loading?: ComponentType;
}

/**
 * Create a dynamically imported component with an optional loading state.
 * Wraps next/dynamic for consistent configuration across the app.
 */
export const createDynamicComponent = <P extends Record<string, unknown>>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options: DynamicImportOptions = {}
) => {
  return dynamic(importFn, {
    ssr: options.ssr ?? true,
    loading: options.loading,
  });
};

// ── Prefetch utilities ────────────────────────────────────────────────────────

/** Track which hrefs have already been prefetched to avoid duplicate hints. */
const _prefetched = new Set<string>();

/**
 * Inject a `<link rel="prefetch">` for a single resource during idle time.
 * Deduplicates so each href is only injected once per session.
 */
export const prefetchComponent = (href: string): void => {
  if (typeof window === 'undefined') return;
  if (_prefetched.has(href)) return;

  const inject = () => {
    if (_prefetched.has(href)) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    link.as = 'script';
    document.head.appendChild(link);
    _prefetched.add(href);
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(inject, { timeout: 2000 });
  } else {
    // Fallback for browsers that don't support requestIdleCallback (e.g. Safari < 16)
    setTimeout(inject, 200);
  }
};

/**
 * Prefetch multiple resources at idle time.
 */
export const prefetchComponents = (routes: string[]): void => {
  routes.forEach(prefetchComponent);
};

// ── React hooks ───────────────────────────────────────────────────────────────

/**
 * useRoutePreload — React hook that prefetches a list of route chunk URLs when
 * the consuming component mounts.  Designed for pages that are highly likely to
 * be visited next (e.g. dashboard → encounters).
 *
 * @example
 * ```tsx
 * // Inside your Dashboard component
 * useRoutePreload(['/encounters', '/patients']);
 * ```
 */
export const useRoutePreload = (routes: string[]): void => {
  useEffect(() => {
    prefetchComponents(routes);
    // Routes array is intentionally not in the dep array — prefetching is a
    // one-shot effect on mount.  Consumers should pass a stable array (useMemo
    // or module-level constant) if the list is dynamic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

/**
 * usePrefetchOnHover — Returns an object of event handlers that trigger
 * prefetching when the user hovers over an element.
 *
 * @param href - The route or chunk URL to prefetch.
 *
 * @example
 * ```tsx
 * const prefetchHandlers = usePrefetchOnHover('/encounters');
 * return <Link href="/encounters" {...prefetchHandlers}>Encounters</Link>;
 * ```
 */
export const usePrefetchOnHover = (href: string) => {
  const prefetchedRef = useRef(false);

  const onMouseEnter = () => {
    if (!prefetchedRef.current) {
      prefetchComponent(href);
      prefetchedRef.current = true;
    }
  };

  const onFocus = () => {
    if (!prefetchedRef.current) {
      prefetchComponent(href);
      prefetchedRef.current = true;
    }
  };

  return { onMouseEnter, onFocus };
};

// ── Bundle analytics ──────────────────────────────────────────────────────────

export interface BundleMetrics {
  routeName: string;
  chunkSize: number;
  loadTime: number;
  timestamp: Date;
}

/**
 * Log bundle metrics in development; forward to your analytics service in
 * production.
 */
export const reportBundleMetrics = (metrics: BundleMetrics): void => {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('[Bundle Metrics]', {
      route: metrics.routeName,
      sizeKB: (metrics.chunkSize / 1024).toFixed(2),
      loadTimeMS: metrics.loadTime,
    });
  }
  // TODO: forward to analytics endpoint in production
};

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Route chunks to prefetch at application startup during idle time.
 * These are the most commonly visited routes after the initial page load.
 */
export const PREFETCH_ROUTES = [
  '/_next/static/chunks/pages/dashboard',
  '/_next/static/chunks/pages/encounters',
  '/_next/static/chunks/pages/patients',
  '/_next/static/chunks/pages/payments',
  '/_next/static/chunks/pages/appointments',
];

/**
 * Critical chunks that must be in the initial JS bundle.
 * Keep this list minimal — every entry increases first-load bundle size.
 */
export const CRITICAL_CHUNKS = ['react', 'react-dom', 'next-intl'];

/**
 * Chunks that should be deferred until idle time.
 * Large dependencies that are not needed on the first render.
 */
export const DEFERRED_CHUNKS = ['recharts', 'socket.io-client', '@sentry/nextjs'];
