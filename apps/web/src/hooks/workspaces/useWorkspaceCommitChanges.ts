'use client';

import type { WorkspaceCommitChanges } from '@t3x-dev/api-client';
import { useEffect, useState } from 'react';
import { getCommitChanges } from '@/infrastructure/commits';

export function useWorkspaceCommitChanges(projectId: string, hash: string) {
  const scope = JSON.stringify([projectId, hash]);
  const [cursor, setCursor] = useState<{ scope: string; before: number }>();
  const page = cursor?.scope === scope ? cursor.before : undefined;
  const [state, setState] = useState<{
    scope: string;
    data?: WorkspaceCommitChanges;
    error?: string;
    loading: boolean;
  }>({ scope, loading: true });
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setState((previous) => ({
      scope,
      data: previous.scope === scope ? previous.data : undefined,
      loading: true,
    }));
    void getCommitChanges(projectId, hash, page, abort.signal)
      .then((data) => {
        if (!active) return;
        if (data.projectId !== projectId || data.commitDigest !== hash)
          throw new Error('Commit changes do not match the selected project and Commit.');
        setState((previous) => ({
          scope,
          loading: false,
          data:
            page !== undefined && previous.scope === scope && previous.data
              ? { ...data, actions: [...previous.data.actions, ...data.actions] }
              : data,
        }));
      })
      .catch((error: unknown) => {
        if (active)
          setState((previous) => ({
            ...previous,
            scope,
            loading: false,
            error: error instanceof Error ? error.message : 'Could not load committed changes.',
          }));
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [projectId, hash, page, scope]);
  return {
    ...(state.scope === scope ? state : { scope, loading: true }),
    loadMore: () => {
      if (!state.loading && state.data?.nextBeforeSequence)
        setCursor({ scope, before: state.data.nextBeforeSequence });
    },
  };
}
