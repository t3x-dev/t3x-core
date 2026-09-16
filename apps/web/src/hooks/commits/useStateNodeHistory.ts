import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type StateNodeHistoryEntry,
  stateNodeHistoryEntry,
} from '@/domain/project/stateNodeHistory';
import { useCommitByHash } from '@/hooks/commits/useCommitByHash';
import type { ApiCommit } from '@/types/api';

const PAGE_SIZE = 20;
interface HistoryContext {
  cursor: ApiCommit | null;
  entries: StateNodeHistoryEntry[];
  seen: Set<string>;
  scanned: number;
  busy: boolean;
  cancelled: boolean;
}
interface HistoryState {
  entries: StateNodeHistoryEntry[];
  scanned: number;
  loading: boolean;
  hasMore: boolean;
  error: string | null;
}
const INITIAL: HistoryState = {
  entries: [],
  scanned: 0,
  loading: true,
  hasMore: true,
  error: null,
};

/** Lazy, bounded first-parent traversal. Never compare against a missing parent as if it were empty. */
export function useStateNodeHistory(commit: ApiCommit, path: string) {
  const { loadCommit } = useCommitByHash();
  const context = useRef<HistoryContext | null>(null);
  const [state, setState] = useState<HistoryState>(INITIAL);
  const loadMore = useCallback(async () => {
    const current = context.current;
    if (!current || current.busy || current.cancelled || !current.cursor) return;
    current.busy = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    let error: string | null = null;
    try {
      for (let index = 0; index < PAGE_SIZE && current.cursor; index++) {
        const revision: ApiCommit = current.cursor;
        if (current.seen.has(revision.hash)) throw new Error('History contains a cycle.');
        if (revision.project_id !== commit.project_id)
          throw new Error('History belongs to another project.');
        const parentHash: string | undefined = revision.parents[0];
        if (parentHash && (parentHash === revision.hash || current.seen.has(parentHash))) {
          throw new Error('History contains a cycle.');
        }
        const parent: ApiCommit | null = parentHash
          ? await loadCommit(parentHash, commit.project_id)
          : null;
        if (current.cancelled) return;
        if (parent && (parent.hash !== parentHash || parent.project_id !== commit.project_id)) {
          throw new Error('The parent revision does not match this history.');
        }
        const entry = stateNodeHistoryEntry(revision, parent, path);
        if (entry) current.entries.push(entry);
        current.seen.add(revision.hash);
        current.scanned++;
        current.cursor = parent;
        setState({
          entries: [...current.entries],
          scanned: current.scanned,
          loading: true,
          hasMore: parent !== null,
          error: null,
        });
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not load node history.';
    } finally {
      current.busy = false;
      if (!current.cancelled)
        setState({
          entries: [...current.entries],
          scanned: current.scanned,
          loading: false,
          hasMore: current.cursor !== null,
          error,
        });
    }
  }, [commit.project_id, loadCommit, path]);

  useEffect(() => {
    const current: HistoryContext = {
      cursor: commit,
      entries: [],
      seen: new Set(),
      scanned: 0,
      busy: false,
      cancelled: false,
    };
    context.current = current;
    setState(INITIAL);
    void loadMore();
    return () => {
      current.cancelled = true;
    };
  }, [commit, loadMore]);

  return { ...state, loadMore };
}
