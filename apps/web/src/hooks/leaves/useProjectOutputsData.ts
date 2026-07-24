'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useProjectLeaves } from '@/hooks/leaves/useProjectLeaves';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import type { ApiCommit, Leaf } from '@/types/api';
import type { WorkspaceCandidate } from '@/types/workspaces';

export interface UseProjectOutputsDataResult {
  commits: ApiCommit[];
  error: string | null;
  leaves: Leaf[];
  loading: boolean;
  refresh: () => Promise<void>;
  workspaces: WorkspaceCandidate[];
}

interface CommitCreatedDetail {
  projectId?: string;
}

const COMMIT_PAGE_SIZE = 1000;

/** Loads the persisted Leaves, source Workspaces, and Commit metadata for Outputs. */
export function useProjectOutputsData(projectId: string): UseProjectOutputsDataResult {
  const projectLeaves = useProjectLeaves(projectId);
  const projectWorkspaces = useProjectWorkspaces(projectId);
  const { loadCommits } = useCommitsList();
  const commitRequestId = useRef(0);
  const [commits, setCommits] = useState<ApiCommit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(Boolean(projectId));
  const [commitsError, setCommitsError] = useState<string | null>(null);

  const refreshCommits = useCallback(async () => {
    const requestId = ++commitRequestId.current;
    if (!projectId) {
      setCommits([]);
      setCommitsError(null);
      setCommitsLoading(false);
      return;
    }

    setCommitsLoading(true);
    setCommitsError(null);
    try {
      const nextCommits: ApiCommit[] = [];
      let offset = 0;

      for (;;) {
        const page = await loadCommits(projectId, undefined, COMMIT_PAGE_SIZE, offset);
        nextCommits.push(...page);
        if (page.length < COMMIT_PAGE_SIZE) break;
        offset += page.length;
      }

      if (requestId !== commitRequestId.current) return;
      setCommits(nextCommits);
    } catch (error) {
      if (requestId !== commitRequestId.current) return;
      setCommitsError(formatUserFacingError(error, 'Failed to load output commits.'));
    } finally {
      if (requestId === commitRequestId.current) setCommitsLoading(false);
    }
  }, [loadCommits, projectId]);

  useEffect(() => {
    void refreshCommits();
    return () => {
      commitRequestId.current += 1;
    };
  }, [refreshCommits]);

  useEffect(() => {
    const handleCommitCreated = (event: Event) => {
      const detail = (event as CustomEvent<CommitCreatedDetail>).detail;
      if (detail?.projectId && detail.projectId !== projectId) return;
      void refreshCommits();
      void projectWorkspaces.refresh();
    };

    window.addEventListener('t3x:commit-created', handleCommitCreated);
    return () => window.removeEventListener('t3x:commit-created', handleCommitCreated);
  }, [projectId, projectWorkspaces.refresh, refreshCommits]);

  const refresh = useCallback(async () => {
    await Promise.all([projectLeaves.refresh(), projectWorkspaces.refresh(), refreshCommits()]);
  }, [projectLeaves.refresh, projectWorkspaces.refresh, refreshCommits]);

  return {
    commits,
    error: projectLeaves.error ?? projectWorkspaces.error ?? commitsError,
    leaves: projectLeaves.leaves,
    loading: projectLeaves.loading || projectWorkspaces.loading || commitsLoading,
    refresh,
    workspaces: projectWorkspaces.workspaces,
  };
}
