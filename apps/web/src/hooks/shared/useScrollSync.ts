/**
 * useScrollSync - Bidirectional scroll sync between NodeList and PreviewPanel
 *
 * Links node IDs (via data-node-id attributes) in the source container
 * to corresponding spans in the preview container. Uses DOM-based paragraph-level
 * mapping: both panes render elements with data-node-id, and the hook
 * finds the topmost visible node in the source and scrolls the target to match.
 *
 * Part of Workbench V2 (RFC §13 Issue F).
 */

import { type RefObject, useCallback, useEffect, useRef } from 'react';

interface UseScrollSyncOptions {
  /** Container holding NodeCards (each with data-node-id) */
  sourceRef: RefObject<HTMLElement | null>;
  /** Container holding the preview with data-node-id spans */
  targetRef: RefObject<HTMLElement | null>;
  /** Enable/disable sync */
  enabled: boolean;
}

interface UseScrollSyncReturn {
  /** Scroll target to show a specific node */
  scrollToNode: (nodeId: string) => void;
}

export function useScrollSync({
  sourceRef,
  targetRef,
  enabled,
}: UseScrollSyncOptions): UseScrollSyncReturn {
  const activeNodeRef = useRef<string | null>(null);
  const isScrollingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find topmost visible node in source container
  const getTopmostNodeId = useCallback((): string | null => {
    const container = sourceRef.current;
    if (!container) return null;

    const elements = container.querySelectorAll('[data-node-id]');
    const containerRect = container.getBoundingClientRect();

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      // Element is at least partially visible
      if (rect.top >= containerRect.top - 10 && rect.top <= containerRect.bottom) {
        return el.getAttribute('data-node-id');
      }
    }
    return null;
  }, [sourceRef]);

  // Scroll target to matching node
  const scrollTargetToNode = useCallback(
    (nodeId: string) => {
      const target = targetRef.current;
      if (!target) return;

      const el = target.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`);
      if (el) {
        isScrollingRef.current = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // 800ms better matches actual smooth-scroll duration and prevents
        // source scroll handler from firing while target is still animating
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => {
          scrollTimerRef.current = null;
          isScrollingRef.current = false;
        }, 800);
      }
    },
    [targetRef]
  );

  // Listen to source scroll events
  useEffect(() => {
    if (!enabled) return;

    const source = sourceRef.current;
    if (!source) return;

    const handleScroll = () => {
      if (isScrollingRef.current) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const nodeId = getTopmostNodeId();
        if (nodeId && nodeId !== activeNodeRef.current) {
          activeNodeRef.current = nodeId;
          scrollTargetToNode(nodeId);
        }
      }, 100);
    };

    source.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      source.removeEventListener('scroll', handleScroll);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [enabled, sourceRef, getTopmostNodeId, scrollTargetToNode]);

  const scrollToNode = useCallback(
    (nodeId: string) => {
      activeNodeRef.current = nodeId;
      scrollTargetToNode(nodeId);
    },
    [scrollTargetToNode]
  );

  return {
    scrollToNode,
  };
}
