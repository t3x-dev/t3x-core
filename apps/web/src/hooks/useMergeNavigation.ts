/**
 * useMergeNavigation — Tracks the active nav item via IntersectionObserver
 * and provides scrollToItem for sidebar click navigation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MergeNavItem } from '@/components/merge/buildMergeNavItems';

interface UseMergeNavigationOptions {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  items: MergeNavItem[];
  prefersReducedMotion: boolean;
}

interface UseMergeNavigationReturn {
  activeItemId: string | null;
  scrollToItem: (id: string) => void;
}

export function useMergeNavigation({
  scrollContainerRef,
  items,
  prefersReducedMotion,
}: UseMergeNavigationOptions): UseMergeNavigationReturn {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set up IntersectionObserver on [data-merge-nav] elements
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || items.length === 0) return;

    const itemIds = new Set(items.map((item) => item.id));

    // Track which items are currently visible and their intersection ratios
    const visibleEntries = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScroll.current) return;

        for (const entry of entries) {
          const navId = (entry.target as HTMLElement).dataset.mergeNav;
          if (!navId || !itemIds.has(navId)) continue;

          if (entry.isIntersecting) {
            visibleEntries.set(navId, entry.intersectionRatio);
          } else {
            visibleEntries.delete(navId);
          }
        }

        // Pick the most visible item
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visibleEntries) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }

        if (bestId) {
          setActiveItemId(bestId);
        }
      },
      {
        root: container,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    // Observe all elements with data-merge-nav
    const elements = container.querySelectorAll('[data-merge-nav]');
    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [scrollContainerRef, items]);

  const scrollToItem = useCallback(
    (id: string) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const el = container.querySelector(`[data-merge-nav="${id}"]`);
      if (!el) return;

      // Pause observer during programmatic scroll
      isProgrammaticScroll.current = true;
      setActiveItemId(id);

      el.scrollIntoView({
        behavior: prefersReducedMotion ? 'instant' : 'smooth',
        block: 'center',
      });

      // Resume observer after scroll settles
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 500);
    },
    [scrollContainerRef, prefersReducedMotion]
  );

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
  }, []);

  return { activeItemId, scrollToItem };
}
