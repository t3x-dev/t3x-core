/**
 * React hooks for Core API data fetching
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Branch,
  Commit,
  CommitDetail,
  Conversation,
  Draft,
  Project,
  ProjectDetail,
  Turn,
  TurnDetail,
} from '@/lib/api';
import * as api from '@/lib/api';

// ============================================================================
// Generic fetch hook with proper dependency handling
// ============================================================================

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Generic hook for API calls with automatic refetch on dependency changes.
 * Uses useRef to track the fetcher function and avoid stale closures.
 */
function useApiCall<T, D extends unknown[]>(
  fetcherFactory: (...deps: D) => () => Promise<T>,
  deps: D
): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  // Store the current fetcher in a ref to always have the latest version
  const fetcherRef = useRef<() => Promise<T>>(null as unknown as () => Promise<T>);
  fetcherRef.current = fetcherFactory(...deps);

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current!();
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Refetch when deps change
  useEffect(() => {
    doFetch();
    // deps are passed explicitly here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { data, loading, error, refetch: doFetch };
}

// ============================================================================
// Health & Status
// ============================================================================

export function useHealth() {
  return useApiCall(() => () => api.checkHealth(), []);
}

export function useStatus() {
  return useApiCall(() => () => api.getStatus(), []);
}

// ============================================================================
// Projects
// ============================================================================

export function useProjects(limit = 50, offset = 0) {
  return useApiCall((l: number, o: number) => () => api.listProjects(l, o), [limit, offset]);
}

export function useProject(projectId: string | undefined) {
  return useApiCall(
    (id: string | undefined) => async () => {
      if (!id) return null;
      return api.getProject(id);
    },
    [projectId]
  );
}

// ============================================================================
// Conversations
// ============================================================================

export function useConversations(projectId: string | undefined, limit = 50, offset = 0) {
  return useApiCall(
    (pid: string | undefined, l: number, o: number) => async () => {
      if (!pid) return { conversations: [], limit: l, offset: o };
      return api.listConversations(pid, l, o);
    },
    [projectId, limit, offset]
  );
}

// ============================================================================
// Turns
// ============================================================================

export function useTurns(
  projectId: string | undefined,
  conversationId: string | undefined,
  limit = 100,
  offset = 0
) {
  return useApiCall(
    (pid: string | undefined, cid: string | undefined, l: number, o: number) => async () => {
      // Both projectId and conversationId are required by the API
      if (!pid || !cid) return { turns: [], limit: l, offset: o };
      return api.listTurns(pid, cid, l, o);
    },
    [projectId, conversationId, limit, offset]
  );
}

export function useTurn(turnHash: string | undefined) {
  return useApiCall(
    (hash: string | undefined) => async () => {
      if (!hash) return null;
      return api.getTurn(hash);
    },
    [turnHash]
  );
}

// ============================================================================
// Branches
// ============================================================================

export function useBranches(projectId: string | undefined) {
  return useApiCall(
    (pid: string | undefined) => async () => {
      if (!pid) return { branches: [], limit: 50, offset: 0 };
      return api.listBranches(pid);
    },
    [projectId]
  );
}

export function useCurrentBranch(projectId: string | undefined) {
  return useApiCall(
    (pid: string | undefined) => async () => {
      if (!pid) return null;
      return api.getCurrentBranch(pid);
    },
    [projectId]
  );
}

// ============================================================================
// Commits V3
// ============================================================================

export function useCommitsV3(projectId: string | undefined, branch?: string, limit = 50, offset = 0) {
  return useApiCall(
    (pid: string | undefined, b: string | undefined, l: number, o: number) => async () => {
      if (!pid) return { commits: [], project_id: '', limit: l, offset: o };
      return api.listCommitsV3(pid, b, l, o);
    },
    [projectId, branch, limit, offset]
  );
}

export function useCommitV3(commitHash: string | undefined) {
  return useApiCall(
    (hash: string | undefined) => async () => {
      if (!hash) return null;
      return api.getCommitV3(hash);
    },
    [commitHash]
  );
}

// ============================================================================
// Drafts
// ============================================================================

export function useDraft(draftId: string | undefined) {
  return useApiCall(
    (id: string | undefined) => async () => {
      if (!id) return null;
      return api.getDraft(id);
    },
    [draftId]
  );
}

// ============================================================================
// Re-export types for convenience
// ============================================================================

export type {
  Project,
  ProjectDetail,
  Conversation,
  Turn,
  TurnDetail,
  Branch,
  Commit,
  CommitDetail,
  Draft,
};
