/**
 * useScrollSync - Bidirectional scroll sync between SentenceList and PreviewPanel
 *
 * Links sentence IDs (via data-sentence-id attributes) in the source container
 * to corresponding spans in the preview container.
 *
 * Part of Workbench V2 (RFC §13 Issue F).
 */

import { type RefObject, useCallback, useEffect, useRef } from 'react';

interface SentenceMapping {
  sentence_id: string;
  start: number;
  end: number;
}

interface UseScrollSyncOptions {
  /** Container holding SentenceCards (each with data-sentence-id) */
  sourceRef: RefObject<HTMLElement | null>;
  /** Container holding the preview with data-sentence-id spans */
  targetRef: RefObject<HTMLElement | null>;
  /** Sentence position mappings from preview (null = disabled) */
  sentenceMap: SentenceMapping[] | null;
  /** Enable/disable sync */
  enabled: boolean;
}

interface UseScrollSyncReturn {
  /** Scroll target to show a specific sentence */
  scrollToSentence: (sentenceId: string) => void;
  /** Currently active sentence ID in the viewport */
  activeSentenceId: string | null;
}

export function useScrollSync({
  sourceRef,
  targetRef,
  sentenceMap,
  enabled,
}: UseScrollSyncOptions): UseScrollSyncReturn {
  const activeSentenceRef = useRef<string | null>(null);
  const isScrollingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find topmost visible sentence in source container
  const getTopmostSentenceId = useCallback((): string | null => {
    const container = sourceRef.current;
    if (!container) return null;

    const elements = container.querySelectorAll('[data-sentence-id]');
    const containerRect = container.getBoundingClientRect();

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      // Element is at least partially visible
      if (rect.top >= containerRect.top - 10 && rect.top <= containerRect.bottom) {
        return el.getAttribute('data-sentence-id');
      }
    }
    return null;
  }, [sourceRef]);

  // Scroll target to matching sentence
  const scrollTargetToSentence = useCallback(
    (sentenceId: string) => {
      const target = targetRef.current;
      if (!target) return;

      const el = target.querySelector(`[data-sentence-id="${sentenceId}"]`);
      if (el) {
        isScrollingRef.current = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 500);
      }
    },
    [targetRef]
  );

  // Listen to source scroll events
  useEffect(() => {
    if (!enabled || !sentenceMap) return;

    const source = sourceRef.current;
    if (!source) return;

    const handleScroll = () => {
      if (isScrollingRef.current) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const sentenceId = getTopmostSentenceId();
        if (sentenceId && sentenceId !== activeSentenceRef.current) {
          activeSentenceRef.current = sentenceId;
          scrollTargetToSentence(sentenceId);
        }
      }, 100);
    };

    source.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      source.removeEventListener('scroll', handleScroll);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, sentenceMap, sourceRef, getTopmostSentenceId, scrollTargetToSentence]);

  const scrollToSentence = useCallback(
    (sentenceId: string) => {
      activeSentenceRef.current = sentenceId;
      scrollTargetToSentence(sentenceId);
    },
    [scrollTargetToSentence]
  );

  return {
    scrollToSentence,
    activeSentenceId: activeSentenceRef.current,
  };
}
