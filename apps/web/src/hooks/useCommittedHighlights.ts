'use client';

import { useEffect, useMemo, useState } from 'react';
import { type ApiCommit, listCommits } from '@/infrastructure/commits';
import { type CommittedHighlight, buildCommittedHighlights } from '@/domain/commit/committedHighlights';
import { useCommitStore } from '@/store/commitStore';

/**
 * Load committed highlights for a conversation.
 * Automatically refreshes when a new commit is created (via lastCommitHash change).
 */
export function useCommittedHighlights(
  projectId: string | undefined,
  conversationId: string | undefined
): Map<string, CommittedHighlight[]> {
  const [commits, setCommits] = useState<ApiCommit[]>([]);
  const lastCommitHash = useCommitStore((s) => s.lastCommitHash);

  useEffect(() => {
    if (!projectId || !conversationId) return;

    let cancelled = false;

    listCommits(projectId)
      .then((data) => {
        if (!cancelled) setCommits(data);
      })
      .catch(() => {
        // Silently ignore — highlights are non-critical
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, conversationId, lastCommitHash]);

  return useMemo(() => {
    if (!conversationId || commits.length === 0) {
      return new Map<string, CommittedHighlight[]>();
    }
    return buildCommittedHighlights(commits, conversationId);
  }, [commits, conversationId]);
}
