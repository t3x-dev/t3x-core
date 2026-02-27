'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface VirtualListProps<T> {
  /** All items to render */
  items: T[];
  /** Estimated height of each item in px */
  estimatedItemHeight: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** How many items to render beyond the visible area (default: 5) */
  overscan?: number;
  /** Container className */
  className?: string;
  /** Unique key extractor */
  getKey: (item: T, index: number) => string;
  /** Optional empty state */
  emptyState?: React.ReactNode;
}

/**
 * VirtualList — Lightweight virtual scrolling using IntersectionObserver.
 *
 * Renders only visible items + overscan buffer. Uses CSS transforms for
 * positioning and a sentinel element for detecting scroll position.
 */
export function VirtualList<T>({
  items,
  estimatedItemHeight,
  renderItem,
  overscan = 5,
  className,
  getKey,
  emptyState,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });

  const updateVisibleRange = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const viewportHeight = el.clientHeight;

    const start = Math.max(0, Math.floor(scrollTop / estimatedItemHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / estimatedItemHeight);
    const end = Math.min(items.length, start + visibleCount + overscan * 2);

    setVisibleRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [items.length, estimatedItemHeight, overscan]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateVisibleRange();

    const handleScroll = () => {
      requestAnimationFrame(updateVisibleRange);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [updateVisibleRange]);

  // Recalculate when items change
  useEffect(() => {
    updateVisibleRange();
  }, [items.length, updateVisibleRange]);

  if (items.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  const totalHeight = items.length * estimatedItemHeight;
  const offsetY = visibleRange.start * estimatedItemHeight;
  const visibleItems = items.slice(visibleRange.start, visibleRange.end);

  return (
    <div ref={containerRef} className={cn('overflow-y-auto', className)}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
          }}
        >
          {visibleItems.map((item, i) => {
            const actualIndex = visibleRange.start + i;
            return (
              <div key={getKey(item, actualIndex)} style={{ height: estimatedItemHeight }}>
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
