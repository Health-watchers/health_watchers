'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import type { LinkProps } from 'next/link';

interface OptimizedLinkProps extends React.PropsWithChildren<LinkProps> {
  prefetch?: 'auto' | 'intent' | 'never';
  className?: string;
  onMouseEnter?: React.MouseEventHandler<HTMLAnchorElement>;
  onTouchStart?: React.TouchEventHandler<HTMLAnchorElement>;
}

/**
 * Enhanced Link component with intelligent prefetching
 * Prefetches linked chunks when user hovers or touches the link
 */
export const OptimizedLink = ({
  href,
  prefetch = 'intent',
  className,
  children,
  onMouseEnter,
  onTouchStart,
  ...props
}: OptimizedLinkProps) => {
  const [isPrefetched, setIsPrefetched] = useState(false);

  const handlePrefetch = useCallback(() => {
    if (isPrefetched || prefetch === 'never') return;

    if (typeof href === 'string' && href.startsWith('/')) {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      link.as = 'document';
      document.head.appendChild(link);
      setIsPrefetched(true);
    }
  }, [href, isPrefetched, prefetch]);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (prefetch === 'intent') {
        handlePrefetch();
      }
      onMouseEnter?.(e);
    },
    [prefetch, handlePrefetch, onMouseEnter],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLAnchorElement>) => {
      if (prefetch === 'intent') {
        handlePrefetch();
      }
      onTouchStart?.(e);
    },
    [prefetch, handlePrefetch, onTouchStart],
  );

  return (
    <Link
      href={href}
      className={className}
      prefetch={prefetch === 'auto'}
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleTouchStart}
      {...props}
    >
      {children}
    </Link>
  );
};
