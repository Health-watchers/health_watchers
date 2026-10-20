'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface UseVirtualRowsOptions {
  count: number;
  /** Height of row `index` in px. Must be cheap — it is called once per row per render. */
  getHeight: (index: number) => number;
  overscan?: number;
}

export interface VirtualRow {
  index: number;
  top: number;
  height: number;
}

/**
 * Minimal windowing for long lists: only rows intersecting the scroll viewport
 * (plus `overscan`) are returned. Supports variable (but known) row heights.
 */
export function useVirtualRows({ count, getHeight, overscan = 8 }: UseVirtualRowsOptions) {
  // Callback ref (via state) so the listener attaches whenever the scroll container mounts
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  useEffect(() => {
    if (!el) return;

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrollTop(el.scrollTop));
    };
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));

    setViewport(el.clientHeight);
    el.addEventListener('scroll', onScroll, { passive: true });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [el]);

  // offsets[i] = top of row i; offsets[count] = total height
  const offsets = useMemo(() => {
    const out = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) out[i + 1] = out[i] + getHeight(i);
    return out;
  }, [count, getHeight]);

  const findIndex = useCallback(
    (y: number) => {
      let lo = 0;
      let hi = count;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (offsets[mid + 1] <= y) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    },
    [offsets, count]
  );

  const start = Math.max(0, findIndex(scrollTop) - overscan);
  const end = Math.min(count, findIndex(scrollTop + viewport) + 1 + overscan);

  const rows: VirtualRow[] = [];
  for (let i = start; i < end; i++) {
    rows.push({ index: i, top: offsets[i], height: offsets[i + 1] - offsets[i] });
  }

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!el || index < 0 || index >= count) return;
      const top = offsets[index];
      const bottom = offsets[index + 1];
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    },
    [offsets, count, el]
  );

  return {
    /** Attach to the scrolling element. */
    scrollRef: setEl as (node: HTMLElement | null) => void,
    scrollElement: el,
    rows,
    totalHeight: offsets[count],
    /** True once the viewport is within `threshold` px of the bottom — used to load more. */
    nearEnd: (threshold = 400) => scrollTop + viewport >= offsets[count] - threshold,
    scrollToIndex,
  };
}
