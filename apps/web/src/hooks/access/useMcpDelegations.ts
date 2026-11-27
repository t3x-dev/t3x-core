'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ConsentDecision, DelegationUpdate } from '@/domain/mcpDelegation';
import {
  decideDelegationConsent,
  readConnectionChoices,
  readConnectionSelectionStatus,
  readDelegationConsent,
  readRepositoryDelegations,
  revokeRepositoryDelegation,
  saveConnectionSelection,
  updateRepositoryDelegation,
} from '@/infrastructure/mcpDelegations';
import { getSessionUserId, subscribeSessionUser } from '@/infrastructure/session';

function selectionChannel(id: string) {
  try {
    return new BroadcastChannel('t3x-mcp-selection-' + id);
  } catch {
    return null;
  }
}

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
        const result = await decideDelegationConsent(query, input);
        const params = new URLSearchParams(query);
        const id = params.get('preselection') || params.get('useSelection');
        if (input.decision === 'approve' && id) {
          const channel = selectionChannel(id);
          try {
            channel?.postMessage('refresh');
          } catch {
            // Returning to the selection page also checks the receipt.
          } finally {
            channel?.close();
          }
        }
        return result;
      } finally {
        submitting.current = false;
      }
    },
  };
}

export function useConnectionChoices() {
  return { ...useDelegationRead('', readConnectionChoices), save: saveConnectionSelection };
}

export function useConnectionSelectionStatus(id: string, expiresAt: string) {
  const state = useDelegationRead(id, readConnectionSelectionStatus);
  const { reload } = state;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const delay = Date.parse(expiresAt) - Date.now();
    const timer = delay > 0 ? setTimeout(reload, Math.min(delay, 2_147_483_647)) : undefined;
    const channel = selectionChannel(id);
    if (channel) channel.onmessage = reload;
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', reload);
    window.addEventListener('pageshow', reload);
    return () => {
      clearTimeout(timer);
      channel?.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', reload);
      window.removeEventListener('pageshow', reload);
    };
  }, [id, reload, expiresAt]);
  return state;
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
