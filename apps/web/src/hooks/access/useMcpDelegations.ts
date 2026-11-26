'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ConsentDecision, DelegationUpdate } from '@/domain/mcpDelegation';
import {
  decideDelegationConsent,
  readConnectionChoices,
  readDelegationConsent,
  readRepositoryDelegations,
  revokeRepositoryDelegation,
  saveConnectionSelection,
  updateRepositoryDelegation,
} from '@/infrastructure/mcpDelegations';
import { getSessionUserId, subscribeSessionUser } from '@/infrastructure/session';

function useDelegationRead<T>(key: string, load: (key: string, signal: AbortSignal) => Promise<T>) {
  const userId = useSyncExternalStore(subscribeSessionUser, getSessionUserId, () => null);
  const identity = JSON.stringify([userId, key]);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: string;
    loginRequired?: boolean;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    load(key, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key: identity, data });
      },
      (cause) => {
        if (!controller.signal.aborted)
          setState({
            key: identity,
            loginRequired: cause?.code === 'UNAUTHENTICATED',
            error: cause instanceof Error ? cause.message : 'T3X could not load access.',
          });
      }
    );
    return () => controller.abort();
  }, [key, identity, load, refreshIndex]);
  const reload = useCallback(() => {
    setState(undefined);
    setRefreshIndex((index) => index + 1);
  }, []);
  return { ...(state?.key === identity ? state : undefined), reload };
}

export function useDelegationConsent(query: string) {
  const state = useDelegationRead(query, readDelegationConsent);
  const reload = state.reload;
  const submitting = useRef(false);
  useEffect(() => {
    const onReturn = (event: PageTransitionEvent) => {
      if (event.persisted && !submitting.current) reload();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !submitting.current) reload();
    };
    window.addEventListener('pageshow', onReturn);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pageshow', onReturn);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);
  return {
    ...state,
    decide: async (input: ConsentDecision) => {
      submitting.current = true;
      try {
        return await decideDelegationConsent(query, input);
      } finally {
        submitting.current = false;
      }
    },
  };
}

export function useConnectionChoices() {
  return { ...useDelegationRead('', readConnectionChoices), save: saveConnectionSelection };
}

export function useRepositoryDelegations(projectId: string, branch: string) {
  const query = new URLSearchParams({ projectId, branch }).toString();
  const state = useDelegationRead(query, readRepositoryDelegations);
  return {
    ...state,
    update: (id: string, input: DelegationUpdate | { repair: true; branch: string }) =>
      updateRepositoryDelegation(projectId, id, input),
    revoke: (id: string) => revokeRepositoryDelegation(projectId, id),
  };
}
