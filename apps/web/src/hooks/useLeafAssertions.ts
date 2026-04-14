'use client';

/**
 * useLeafAssertions — owns assertion selection, pin lookup for the
 * current leaf, and the "re-tune" flow (creates a retune session
 * and refreshes pins).
 *
 * Extracted from useLeafPageData (PR22).
 */

import { useCallback, useEffect, useState } from 'react';
import { usePinsStore } from '@/store/pinsStore';
import type { Leaf } from '@/types/api';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { useRetuneSession } from './useRetuneSession';

export interface UseLeafAssertionsReturn {
  selectedAssertionIds: Set<string>;
  retuning: boolean;
  leafPinned: boolean;
  toggleAssertion: (id: string) => void;
  handleRetune: () => Promise<string | undefined>;
}

export function useLeafAssertions(
  projectId: string,
  leafId: string,
  leaf: Leaf | null
): UseLeafAssertionsReturn {
  const [selectedAssertionIds, setSelectedAssertionIds] = useState<Set<string>>(new Set());
  const [retuning, setRetuning] = useState(false);

  const isPinned = usePinsStore((s) => s.isPinned);
  const getPinByRef = usePinsStore((s) => s.getPinByRef);
  const invalidatePins = usePinsStore((s) => s.invalidatePins);
  const { fetch: fetchPins } = usePinsCrud();
  const { createSession: createRetuneSession } = useRetuneSession();

  const leafPinned = isPinned('leaf', leafId);
  const existingPin = getPinByRef('leaf', leafId);

  // Ensure pins are loaded for this project.
  useEffect(() => {
    if (projectId) fetchPins(projectId);
  }, [projectId, fetchPins]);

  // Default selection: failed assertions from runner_assertions
  // (fallback to leaf.assertions for local-validation results).
  useEffect(() => {
    const source = leaf?.runner_assertions ?? leaf?.assertions;
    if (source) {
      const failedIds = source.filter((a) => !a.passed).map((a) => a.id);
      setSelectedAssertionIds(new Set(failedIds));
    }
  }, [leaf?.runner_assertions, leaf?.assertions]);

  const toggleAssertion = useCallback((id: string) => {
    setSelectedAssertionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleRetune = useCallback(async (): Promise<string | undefined> => {
    if (!leaf?.commit_hash || selectedAssertionIds.size === 0) return undefined;
    setRetuning(true);
    try {
      const { conversationId } = await createRetuneSession({
        projectId,
        leafId,
        commitHash: leaf.commit_hash,
        selectedAssertionIds: Array.from(selectedAssertionIds),
        existingPinId: existingPin?.id,
      });
      invalidatePins();
      await fetchPins(projectId);
      return conversationId;
    } catch (_err) {
      return undefined;
    } finally {
      setRetuning(false);
    }
  }, [
    projectId,
    leafId,
    leaf?.commit_hash,
    selectedAssertionIds,
    existingPin,
    fetchPins,
    invalidatePins,
    createRetuneSession,
  ]);

  return {
    selectedAssertionIds,
    retuning,
    leafPinned,
    toggleAssertion,
    handleRetune,
  };
}
