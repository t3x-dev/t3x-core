import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { API_KEY } from '@/infrastructure/core';
import { getSessionKey } from '@/infrastructure/session';
import { fetchProjectWorkspaces } from '@/queries/workspaces';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { API_BASE, resolveWebSocketBase } from '@/utils/apiBase';

const REALTIME_RECONNECT_DELAY = 5000;
const MAX_SEEN_EVENT_IDS = 200;
const WORKSPACE_INVALIDATION_EVENTS = new Set([
  'commit.created',
  'draft.changed',
  'extraction.done',
]);

export interface UseProjectWorkspacesResult {
  workspaces: WorkspaceCandidate[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useProjectWorkspaces(
  projectId: string | null | undefined,
  enabled = true
): UseProjectWorkspacesResult {
  const key = JSON.stringify([projectId, enabled]);
  const available = Boolean(projectId && enabled);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    workspaces: WorkspaceCandidate[];
    loading: boolean;
    error: string | null;
  }>();
  const activeKey = useRef(key);
  activeKey.current = key;
  const mounted = useRef(false);
  const request = useRef(0);

  const load = useCallback(
    async (showLoading: boolean) => {
      if (!projectId || !enabled || !mounted.current || activeKey.current !== key) return;
      const token = ++request.current;
      const isCurrent = () =>
        mounted.current && activeKey.current === key && token === request.current;
      setSnapshot((current) => ({
        key,
        workspaces: current?.key === key ? current.workspaces : [],
        loading: showLoading || (current?.key === key ? current.loading : true),
        error: null,
      }));
      try {
        const workspaces = await fetchProjectWorkspaces(projectId);
        if (isCurrent()) setSnapshot({ key, workspaces, loading: false, error: null });
      } catch (err) {
        if (isCurrent())
          setSnapshot((current) => ({
            key,
            workspaces: current?.key === key ? current.workspaces : [],
            loading: false,
            error: formatUserFacingError(err, 'Failed to load workspaces.'),
          }));
      }
    },
    [enabled, key, projectId]
  );

  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    mounted.current = true;
    if (available) void refresh();
    else setSnapshot(undefined);
    return () => {
      mounted.current = false;
      ++request.current;
    };
  }, [available, refresh]);

  useEffect(() => {
    if (!projectId || !enabled) return;
    const updated = (event: Event) => {
      if ((event as CustomEvent<{ projectId: string }>).detail?.projectId === projectId)
        void load(false);
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== 't3x-schema-candidate-updated' || !event.newValue) return;
      try {
        updated(
          new CustomEvent('t3x-schema-candidate-updated', { detail: JSON.parse(event.newValue) })
        );
      } catch {
        /* Ignore malformed notifications. */
      }
    };
    window.addEventListener('t3x-schema-candidate-updated', updated);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('t3x-schema-candidate-updated', updated);
      window.removeEventListener('storage', storage);
    };
  }, [projectId, enabled, load]);

  useEffect(() => {
    if (!projectId || !enabled || typeof WebSocket === 'undefined') return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const seenEventIds = new Set<string>();

    const connect = () => {
      if (disposed) return;
      const params = new URLSearchParams({ project_id: projectId });
      const token = API_KEY || getSessionKey();
      if (token) params.set('token', token);
      const wsBase = resolveWebSocketBase(
        API_BASE,
        typeof window === 'undefined' ? undefined : window.location
      );
      const nextSocket = new WebSocket(`${wsBase}/ws?${params.toString()}`);
      socket = nextSocket;

      nextSocket.onmessage = (message) => {
        try {
          const event = JSON.parse(String(message.data)) as {
            type?: string;
            projectId?: string;
            payload?: Record<string, unknown>;
          };
          if (event.projectId && event.projectId !== projectId) return;
          if (!event.type || !WORKSPACE_INVALIDATION_EVENTS.has(event.type)) return;
          const eventId =
            typeof event.payload?.event_id === 'string' ? event.payload.event_id : undefined;
          if (eventId) {
            if (seenEventIds.has(eventId)) return;
            seenEventIds.add(eventId);
            if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
              const oldest = seenEventIds.values().next().value;
              if (oldest) seenEventIds.delete(oldest);
            }
          }
          void load(false);
        } catch {
          // Ignore malformed realtime messages; the next valid event can still refresh state.
        }
      };
      nextSocket.onclose = () => {
        if (socket === nextSocket) socket = null;
        if (!disposed) reconnectTimer = setTimeout(connect, REALTIME_RECONNECT_DELAY);
      };
      nextSocket.onerror = () => {};
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.close();
      }
    };
  }, [enabled, load, projectId]);

  const current = available && snapshot?.key === key ? snapshot : undefined;
  return {
    workspaces: current?.workspaces ?? [],
    loading: available && (current?.loading ?? true),
    error: current?.error ?? null,
    refresh,
  };
}
