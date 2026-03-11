/**
 * useIncrementalDiff - Real-time incremental diff hook
 *
 * Computes diff between draft sentences and parent commit sentences
 * with debouncing and caching for real-time performance.
 *
 * Uses the core incrementalDiffCommits algorithm from @t3x-dev/core (via diffUtils)
 * which caches unchanged sentence pairs and only re-diffs modified sentences.
 *
 * Performance:
 * - <50 sentences: <10ms (synchronous, no debounce needed)
 * - 50-200 sentences: <50ms
 * - >200 sentences: incremental <50ms (only re-diffs changes)
 * - Debouncing prevents rapid re-computation during typing
 */

import { useEffect, useRef, useState } from 'react';
import type { CommitDiff, DiffableSentence, DiffCache } from '@/lib/diffUtils';
import { incrementalDiffCommits } from '@/lib/diffUtils';

const DEFAULT_DEBOUNCE_MS = 300;

export interface UseIncrementalDiffResult {
  /** Current diff result, null if not yet computed or no valid inputs */
  diff: CommitDiff | null;
  /** Whether a diff computation is pending (debounced) */
  isComputing: boolean;
}

/**
 * Simple string hash for change detection.
 * Not cryptographically secure, just fast for cache invalidation.
 */
function hashSentences(sentences: DiffableSentence[]): string {
  let hash = 0;
  const str = JSON.stringify(sentences);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return String(hash);
}

/**
 * Hook that computes diff between draft sentences and parent commit,
 * with debouncing and caching for real-time performance.
 *
 * @param draftSentences - Current draft sentences (target side of diff)
 * @param parentSentences - Parent commit sentences (source side of diff)
 * @param debounceMs - Debounce delay in ms (default: 300)
 * @returns Object with diff result and computing state
 */
export function useIncrementalDiff(
  draftSentences: DiffableSentence[],
  parentSentences: DiffableSentence[],
  debounceMs = DEFAULT_DEBOUNCE_MS
): UseIncrementalDiffResult {
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [isComputing, setIsComputing] = useState(false);

  // Cache ref persists across renders for incremental diff reuse
  const cacheRef = useRef<DiffCache | null>(null);
  // Track previous input hash to detect changes
  const prevHashRef = useRef<string>('');
  // Debounce timer ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // No valid inputs — clear state
    if (draftSentences.length === 0 || parentSentences.length === 0) {
      cacheRef.current = null;
      prevHashRef.current = '';
      setDiff(null);
      setIsComputing(false);
      return;
    }

    // Check if inputs actually changed
    const currentHash = hashSentences(draftSentences) + ':' + hashSentences(parentSentences);
    if (currentHash === prevHashRef.current) {
      // No change — return cached result
      return;
    }

    // Mark as computing
    setIsComputing(true);

    // Clear previous timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Debounce the computation
    timerRef.current = setTimeout(() => {
      const [result, newCache] = incrementalDiffCommits(
        parentSentences,
        draftSentences,
        cacheRef.current
      );
      cacheRef.current = newCache;
      prevHashRef.current = currentHash;
      setDiff(result);
      setIsComputing(false);
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [draftSentences, parentSentences, debounceMs]);

  // Reset cache when parent sentences change identity (new parent commit)
  const parentIdRef = useRef<string>('');
  useEffect(() => {
    const parentId = parentSentences.map((s) => s.id).join(',');
    if (parentId !== parentIdRef.current) {
      cacheRef.current = null;
      parentIdRef.current = parentId;
    }
  }, [parentSentences]);

  return { diff, isComputing };
}
