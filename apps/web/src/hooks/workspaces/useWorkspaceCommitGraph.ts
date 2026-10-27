'use client';

import { useEffect, useState } from 'react';
import { listBranches } from '@/infrastructure/branches';
import { fetchCommits } from '@/infrastructure/commits';
import type { Branch } from '@/infrastructure/types';
import type { ApiCommit } from '@/types/api';

export const WORKSPACE_GRAPH_LIMIT = 100;
interface GraphState {
  scope: string;
  commits: ApiCommit[];
  branches: Branch[];
  loading: boolean;
  error?: string;
}

export function useWorkspaceCommitGraph(projectId: string, branch?: string, refreshKey?: string) {
  const scope = JSON.stringify([projectId, branch]);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<GraphState>({
    scope,
    commits: [],
    branches: [],
    loading: true,
  });
  useEffect(() => {
    let active = true;
    setState((previous) => ({
      scope,
      commits: previous.scope === scope ? previous.commits : [],
      branches: previous.scope === scope ? previous.branches : [],
      loading: true,
    }));
    void Promise.all([
      fetchCommits(projectId, branch, WORKSPACE_GRAPH_LIMIT),
      listBranches(projectId),
    ]).then(
      ([commits, inventory]) => {
        if (!active) return;
        if (
          commits.some((commit) => commit.project_id !== projectId) ||
          inventory.branches.some((item) => item.project_id && item.project_id !== projectId)
        ) {
          setState({
            scope,
            commits: [],
            branches: [],
            loading: false,
            error: 'Commit history does not match this project.',
          });
          return;
        }
        setState({ scope, commits, branches: inventory.branches, loading: false });
      },
      (failure: unknown) => {
        if (active)
          setState({
            scope,
            commits: [],
            branches: [],
            loading: false,
            error: failure instanceof Error ? failure.message : 'Could not load commit history.',
          });
      }
    );
    return () => {
      active = false;
    };
  }, [projectId, branch, scope, refreshKey, version]);
  const visible: GraphState =
    state.scope === scope ? state : { scope, commits: [], branches: [], loading: true };
  return { ...visible, refresh: () => setVersion((value) => value + 1) };
}
