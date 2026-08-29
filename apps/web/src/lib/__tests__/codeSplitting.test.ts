/**
 * Tests for code splitting utilities — Issue #1079
 */

import { renderHook } from '@testing-library/react';

// ── Next.js dynamic mock ──────────────────────────────────────────────────────
jest.mock('next/dynamic', () => {
  return jest.fn().mockImplementation((importFn: any, opts: any) => {
    const Component = () => null;
    Component.displayName = 'DynamicComponent';
    return Component;
  });
});

// ── Browser API mocks ──────────────────────────────────────────────────────────
const mockRequestIdleCallback = jest.fn((cb: () => void, _opts?: any) => {
  cb();
  return 0;
});

Object.defineProperty(window, 'requestIdleCallback', {
  writable: true,
  value: mockRequestIdleCallback,
});

// Provide a real document.head.appendChild spy
const appendChildSpy = jest.spyOn(document.head, 'appendChild').mockImplementation((node) => node);

import {
  createDynamicComponent,
  prefetchComponent,
  prefetchComponents,
  useRoutePreload,
  usePrefetchOnHover,
  reportBundleMetrics,
  PREFETCH_ROUTES,
  CRITICAL_CHUNKS,
  DEFERRED_CHUNKS,
} from '../codeSplitting';

beforeEach(() => {
  appendChildSpy.mockClear();
  mockRequestIdleCallback.mockClear();
  // Reset the internal prefetch cache between tests by clearing the module cache
  jest.resetModules();
});

describe('createDynamicComponent()', () => {
  it('returns a React component', () => {
    const Comp = createDynamicComponent(() => Promise.resolve({ default: () => null }));
    expect(Comp).toBeDefined();
    expect(typeof Comp).toBe('function');
  });

  it('passes options to next/dynamic', () => {
    const dynamic = require('next/dynamic');
    const importFn = () => Promise.resolve({ default: () => null });
    createDynamicComponent(importFn, { ssr: false });
    expect(dynamic).toHaveBeenCalledWith(importFn, expect.objectContaining({ ssr: false }));
  });
});

describe('prefetchComponent()', () => {
  it('calls requestIdleCallback with a function', () => {
    prefetchComponent('/test-route');
    expect(mockRequestIdleCallback).toHaveBeenCalled();
  });

  it('appends a prefetch link to document.head', () => {
    prefetchComponent('/another-route');
    expect(appendChildSpy).toHaveBeenCalledWith(
      expect.objectContaining({ rel: 'prefetch', href: '/another-route' }),
    );
  });
});

describe('prefetchComponents()', () => {
  it('calls prefetchComponent for each route', () => {
    appendChildSpy.mockClear();
    prefetchComponents(['/a', '/b', '/c']);
    expect(appendChildSpy).toHaveBeenCalledTimes(3);
  });
});

describe('useRoutePreload()', () => {
  it('does not throw when called with an array of routes', () => {
    expect(() => {
      renderHook(() => useRoutePreload(['/dashboard', '/encounters']));
    }).not.toThrow();
  });
});

describe('usePrefetchOnHover()', () => {
  it('returns onMouseEnter and onFocus handlers', () => {
    const { result } = renderHook(() => usePrefetchOnHover('/appointments'));
    expect(typeof result.current.onMouseEnter).toBe('function');
    expect(typeof result.current.onFocus).toBe('function');
  });

  it('prefetches on mouse enter', () => {
    appendChildSpy.mockClear();
    const { result } = renderHook(() => usePrefetchOnHover('/unique-hover-test'));
    result.current.onMouseEnter();
    expect(appendChildSpy).toHaveBeenCalledWith(
      expect.objectContaining({ rel: 'prefetch', href: '/unique-hover-test' }),
    );
  });

  it('does not prefetch twice on repeated hover', () => {
    appendChildSpy.mockClear();
    const { result } = renderHook(() => usePrefetchOnHover('/hover-once'));
    result.current.onMouseEnter();
    result.current.onMouseEnter();
    result.current.onFocus();
    // Only one link should be injected despite multiple events
    const calls = appendChildSpy.mock.calls.filter(
      ([node]: [any]) => (node as HTMLLinkElement).href?.includes('/hover-once'),
    );
    expect(calls.length).toBe(1);
  });
});

describe('reportBundleMetrics()', () => {
  it('logs metrics in development without throwing', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const original = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });

    expect(() =>
      reportBundleMetrics({
        routeName: '/dashboard',
        chunkSize: 102400,
        loadTime: 350,
        timestamp: new Date(),
      }),
    ).not.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Bundle Metrics]',
      expect.objectContaining({ route: '/dashboard' }),
    );

    Object.defineProperty(process.env, 'NODE_ENV', { value: original, writable: true });
    consoleSpy.mockRestore();
  });
});

describe('Constants', () => {
  it('PREFETCH_ROUTES contains expected dashboard route', () => {
    expect(PREFETCH_ROUTES.some((r) => r.includes('dashboard'))).toBe(true);
  });

  it('CRITICAL_CHUNKS includes react', () => {
    expect(CRITICAL_CHUNKS).toContain('react');
  });

  it('DEFERRED_CHUNKS includes recharts', () => {
    expect(DEFERRED_CHUNKS).toContain('recharts');
  });
});
