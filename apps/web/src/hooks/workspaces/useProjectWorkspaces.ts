import { useCallback, useEffect, useState } from 'react';
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
  const [workspaces, setWorkspaces] = useState<WorkspaceCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (showLoading: boolean) => {
      if (!projectId || !enabled) {
        setWorkspaces([]);
        setError(null);
        setLoading(false);
        return;
      }

      if (showLoading) setLoading(true);
      try {
        const data = await fetchProjectWorkspaces(projectId);
        setWorkspaces(data);
        setError(null);
      } catch (err) {
        setError(formatUserFacingError(err, 'Failed to load workspaces.'));
      } finally {
        setLoading(false);
      }
    },
    [enabled, projectId]
  );

  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  return { workspaces, loading, error, refresh };
}
