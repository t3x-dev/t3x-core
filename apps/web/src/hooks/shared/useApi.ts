/**
 * React hooks for Core API data fetching
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Branch,
  Commit,
  CommitDetail,
  Conversation,
  Project,
  ProjectDetail,
  Turn,
  TurnDetail,
} from '@/infrastructure';
import * as api from '@/infrastructure';

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
  // All callers use primitive resource/pagination dependencies. Own the result
  // by that identity, not merely by whether this component is still mounted.
  const key = JSON.stringify(deps);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>();
  const mountedRef = useRef(false);
  const activeKeyRef = useRef(key);
  activeKeyRef.current = key;
  const requestRef = useRef(0);
  const fetcherRef = useRef(fetcherFactory(...deps));
  fetcherRef.current = fetcherFactory(...deps);

  const doFetch = useCallback(async () => {
    if (!mountedRef.current || activeKeyRef.current !== key) return;
    const request = ++requestRef.current;
    const isCurrent = () =>
      mountedRef.current && activeKeyRef.current === key && requestRef.current === request;
    setSnapshot((current) => ({
      key,
      data: current?.key === key ? current.data : null,
      loading: true,
      error: null,
    }));
    try {
      const data = await fetcherRef.current();
      if (isCurrent()) setSnapshot({ key, data, loading: false, error: null });
    } catch (err) {
      if (isCurrent())
        setSnapshot((current) => ({
          key,
          data: current?.key === key ? current.data : null,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
    }
  }, [key]);

  useEffect(() => {
    mountedRef.current = true;
    void doFetch();
    return () => {
      mountedRef.current = false;
      ++requestRef.current;
    };
  }, [doFetch]);

  const current = snapshot?.key === key ? snapshot : undefined;
  return {
    data: current?.data ?? null,
    loading: current?.loading ?? true,
    error: current?.error ?? null,
    refetch: doFetch,
  };
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
};
