'use client';

/**
 * useLeafCore — owns the base leaf record, load lifecycle, and a ref
 * that handlers read to avoid the closure-staleness problem.
 *
 * Extracted from useLeafPageData (PR22). Facade composes this hook to
 * drive the rest of the leaf page (generate / validate / constraints
 * / assertions / export all receive `leaf` + `setLeaf` from here).
 */

import { useEffect, useRef, useState } from 'react';
import { getLeaf } from '@/infrastructure';
import type { Leaf } from '@/types/api';

export interface UseLeafCoreReturn {
  leaf: Leaf | null;
  setLeaf: (leaf: Leaf | null) => void;
  leafRef: React.MutableRefObject<Leaf | null>;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: Error | null;
  setError: (error: Error | null) => void;
}

export function useLeafCore(leafId: string): UseLeafCoreReturn {
  const [leaf, setLeaf] = useState<Leaf | null>(null);
  const leafRef = useRef<Leaf | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep leafRef in sync with leaf state.
  useEffect(() => {
    leafRef.current = leaf;
  }, [leaf]);

  // Load leaf on mount (and when leafId changes).
  useEffect(() => {
    if (!leafId) return;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getLeaf(leafId);
        setLeaf(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load leaf'));
      } finally {
        setLoading(false);
      }
    })();
  }, [leafId]);

  return { leaf, setLeaf, leafRef, loading, setLoading, error, setError };
}
