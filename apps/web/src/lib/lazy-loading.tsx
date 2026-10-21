import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';

export interface LazyComponentConfig {
  fallback?: ReactNode;
  ssr?: boolean;
}

/**
 * Create a lazily-loaded component with optional fallback UI
 * Useful for code splitting heavy features
 */
export function lazyComponent<T extends Record<string, any>>(
  importFn: () => Promise<T>,
  componentName: string,
  config?: LazyComponentConfig
) {
  const LazyComponent = lazy(() =>
    importFn().then((module) => ({
      default: module[componentName],
    }))
  );

  return {
    Component: LazyComponent,
    Suspense: (props: any) => (
      <Suspense fallback={config?.fallback}>
        <LazyComponent {...props} />
      </Suspense>
    ),
  };
}

/**
 * Dynamically import a component with fallback and error handling
 */
export async function dynamicImport<T>(importFn: () => Promise<T>) {
  try {
    return await importFn();
  } catch (error) {
    console.error('Failed to dynamically import component:', error);
    throw error;
  }
}

/**
 * Preload a component before rendering to avoid loading delays
 */
export function preloadComponent(importFn: () => Promise<any>) {
  importFn().catch((err) => {
    console.warn('Failed to preload component:', err);
  });
}

/**
 * Create an intersection observer to lazy load components when visible
 */
export function useIntersectionLazyLoad(
  elementRef: React.RefObject<HTMLElement>,
  callback: () => void,
  options?: IntersectionObserverInit
) {
  if (typeof window === 'undefined') return;

  if (!elementRef.current) return;

  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      callback();
      observer.unobserve(elementRef.current!);
    }
  }, options);

  observer.observe(elementRef.current);

  return () => observer.disconnect();
}
