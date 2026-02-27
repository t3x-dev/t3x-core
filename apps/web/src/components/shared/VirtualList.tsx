'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface VirtualListProps<T> {
  /** All items to render */
  items: T[];
  /** Estimated height of each item in px (used as initial estimate, actual heights measured) */
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
  /** Enable keyboard navigation (ArrowUp/Down, Enter to activate) */
  enableKeyboard?: boolean;
  /** Called when Enter is pressed on the active item */
  onActivate?: (item: T, index: number) => void;
}

/**
 * VirtualList — Lightweight virtual scrolling with variable-height support.
 *
 * Renders only visible items + overscan buffer. Uses ResizeObserver to measure
 * actual heights and CSS transforms for positioning.
 */
export function VirtualList<T>({
  items,
  estimatedItemHeight,
  renderItem,
  overscan = 5,
  className,
  getKey,
  emptyState,
  enableKeyboard = false,
  onActivate,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const [activeIndex, setActiveIndex] = useState(-1);

  // Height cache for variable-height items
  const heightCacheRef = useRef<Map<string, number>>(new Map());
  const observerRef = useRef<ResizeObserver | null>(null);
  // Track observed elements so we can unobserve when they leave the viewport
  const observedElementsRef = useRef<Set<Element>>(new Set());

  // Get height for an item (cached or estimated)
  const getItemHeight = useCallback(
    (index: number) => {
      const key = getKey(items[index], index);
      return heightCacheRef.current.get(key) ?? estimatedItemHeight;
    },
    [items, getKey, estimatedItemHeight]
  );

  // Calculate total height
  const getTotalHeight = useCallback(() => {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      total += getItemHeight(i);
    }
    return total;
  }, [items.length, getItemHeight]);

  // Calculate offset for a given index
  const getOffsetForIndex = useCallback(
    (index: number) => {
      let offset = 0;
      for (let i = 0; i < index; i++) {
        offset += getItemHeight(i);
      }
      return offset;
    },
    [getItemHeight]
  );

  const updateVisibleRange = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const viewportHeight = el.clientHeight;

    // Find start index using accumulated heights
    let accumulated = 0;
    let startIdx = 0;
    for (let i = 0; i < items.length; i++) {
      const h = getItemHeight(i);
      if (accumulated + h > scrollTop) {
        startIdx = i;
        break;
      }
      accumulated += h;
    }

    // Find end index
    let endAccumulated = accumulated;
    let endIdx = startIdx;
    for (let i = startIdx; i < items.length; i++) {
      endIdx = i + 1;
      endAccumulated += getItemHeight(i);
      if (endAccumulated > scrollTop + viewportHeight) break;
    }

    const start = Math.max(0, startIdx - overscan);
    const end = Math.min(items.length, endIdx + overscan);

    setVisibleRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [items.length, getItemHeight, overscan]);

  // Set up ResizeObserver for variable heights
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset.virtualKey;
        if (key) {
          const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
          const prev = heightCacheRef.current.get(key);
          if (prev !== height) {
            heightCacheRef.current.set(key, height);
            changed = true;
          }
        }
      }
      if (changed) {
        requestAnimationFrame(updateVisibleRange);
      }
    });
    observerRef.current = observer;
    return () => observer.disconnect();
  }, [updateVisibleRange]);

  // Unobserve elements that are no longer in the visible range
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const currentElements = new Set(Array.from(container.querySelectorAll('[data-virtual-key]')));
    for (const el of observedElementsRef.current) {
      if (!currentElements.has(el)) {
        observerRef.current?.unobserve(el);
        observedElementsRef.current.delete(el);
      }
    }
  }, [visibleRange.start, visibleRange.end]);

  // Evict stale height cache entries when items change
  useEffect(() => {
    const validKeys = new Set(items.map((item, i) => getKey(item, i)));
    for (const key of heightCacheRef.current.keys()) {
      if (!validKeys.has(key)) {
        heightCacheRef.current.delete(key);
      }
    }
  }, [items, getKey]);

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

  // Keyboard navigation — scoped to container via onKeyDown
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enableKeyboard) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = Math.min(items.length - 1, prev + 1);
          const el = containerRef.current;
          if (el) {
            const offset = getOffsetForIndex(next);
            const height = getItemHeight(next);
            if (offset + height > el.scrollTop + el.clientHeight) {
              el.scrollTop = offset + height - el.clientHeight;
            } else if (offset < el.scrollTop) {
              el.scrollTop = offset;
            }
          }
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = Math.max(0, prev - 1);
          const el = containerRef.current;
          if (el) {
            const offset = getOffsetForIndex(next);
            if (offset < el.scrollTop) {
              el.scrollTop = offset;
            }
          }
          return next;
        });
      } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < items.length) {
        e.preventDefault();
        onActivate?.(items[activeIndex], activeIndex);
      }
    },
    [enableKeyboard, items, activeIndex, onActivate, getOffsetForIndex, getItemHeight]
  );

  if (items.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  const totalHeight = getTotalHeight();
  const offsetY = getOffsetForIndex(visibleRange.start);
  const visibleItems = items.slice(visibleRange.start, visibleRange.end);

  return (
    <div
      ref={containerRef}
      className={cn('overflow-y-auto', className)}
      role={enableKeyboard ? 'listbox' : undefined}
      tabIndex={enableKeyboard ? 0 : undefined}
      onKeyDown={enableKeyboard ? handleKeyDown : undefined}
    >
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
            const key = getKey(item, actualIndex);
            const isActive = enableKeyboard && actualIndex === activeIndex;
            return (
              <div
                key={key}
                data-virtual-key={key}
                ref={(el) => {
                  if (el && observerRef.current) {
                    observerRef.current.observe(el);
                    observedElementsRef.current.add(el);
                  }
                }}
                role={enableKeyboard ? 'option' : undefined}
                aria-selected={isActive || undefined}
                className={
                  isActive ? 'ring-2 ring-[var(--accent-commit)] ring-inset rounded' : undefined
                }
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
