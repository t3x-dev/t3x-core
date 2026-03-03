'use client';

/**
 * useDraftDiff - Hook for real-time incremental diff between draft and parent commit.
 *
 * Fetches parent commit once, then recomputes diff locally with debounce
 * whenever draft sentences change.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { getCommitV4 } from '@/lib/api';
import type { CommitDiff, DiffableSentence } from '@/lib/diffUtils';
import { diffCommits } from '@/lib/diffUtils';

interface UseDraftDiffOptions {
  parentCommitHash: string | null | undefined;
  draftSentences: DiffableSentence[];
  debounceMs?: number;
}

interface UseDraftDiffResult {
  diff: CommitDiff | null;
  loading: boolean;
  error: string | null;
}

export function useDraftDiff({
  parentCommitHash,
  draftSentences,
  debounceMs = 300,
}: UseDraftDiffOptions): UseDraftDiffResult {
  const [parentSentences, setParentSentences] = useState<DiffableSentence[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedHashRef = useRef<string | null>(null);
  const [debouncedSentences, setDebouncedSentences] = useState(draftSentences);

  // Debounce draft sentences changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSentences(draftSentences);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [draftSentences, debounceMs]);

  // Fetch parent commit once when hash changes
  useEffect(() => {
    if (!parentCommitHash) {
      setParentSentences(null);
      fetchedHashRef.current = null;
      return;
    }

    if (fetchedHashRef.current === parentCommitHash) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getCommitV4(parentCommitHash)
      .then((commit) => {
        if (cancelled) return;
        const sentences =
          (commit.content?.sentences as Array<{ id: string; text: string }> | undefined)?.map(
            (s) => ({ id: s.id, text: s.text })
          ) ?? [];
        setParentSentences(sentences);
        fetchedHashRef.current = parentCommitHash;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load parent commit');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [parentCommitHash]);

  // Compute diff locally
  const diff = useMemo<CommitDiff | null>(() => {
    if (!parentSentences || debouncedSentences.length === 0) return null;
    return diffCommits(parentSentences, debouncedSentences);
  }, [parentSentences, debouncedSentences]);

  return { diff, loading, error };
}
