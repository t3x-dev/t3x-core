/**
 * useRealtimeSync — WebSocket hook for real-time state sync.
 *
 * Opens a WebSocket connection when viewing a conversation.
 * Receives events when backend state changes from OTHER sources
 * (CLI, MCP, another tab) and triggers appropriate state transitions.
 *
 * Design principle:
 *   - UI-initiated actions → use HTTP response directly (no WS needed)
 *   - External actions → WS notification → refetch → same state machine
 *   - The state machine is: idle → yops → triage → review → committing → idle
 *   - WS events NEVER skip steps in the state machine
 */

'use client';

import { useEffect, useRef } from 'react';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { API_BASE, resolveWebSocketBase } from '@/utils/apiBase';

const RECONNECT_DELAY = 5000;

interface RealtimeEvent {
  type: string;
  conversationId: string;
  projectId?: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

export function useRealtimeSync(conversationId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const activeProjectId = useChatStore((s) => s.activeProjectId);

  useEffect(() => {
    if (!conversationId || conversationId === 'new') return;
    let disposed = false;
    const wsBase = resolveWebSocketBase(
      API_BASE,
      typeof window !== 'undefined' ? window.location : undefined
    );

    function clearReconnectTimer() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function connect() {
      if (disposed) return;
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      const params = new URLSearchParams({ conversation_id: conversationId! });
      if (activeProjectId) params.set('project_id', activeProjectId);
      const ws = new WebSocket(`${wsBase}/ws?${params.toString()}`);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const event: RealtimeEvent = JSON.parse(evt.data);
          const eventId =
            event.payload && typeof event.payload.event_id === 'string'
              ? event.payload.event_id
              : null;
          if (eventId) {
            const seen = seenEventIdsRef.current;
            if (seen.has(eventId)) return;
            seen.add(eventId);
            if (seen.size > 200) {
              const oldest = seen.values().next().value;
              if (oldest) seen.delete(oldest);
            }
          }
          handleEvent(event, conversationId!);
        } catch {}
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (disposed) return;
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {};
    }

    connect();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [conversationId, activeProjectId]);
}

/**
 * Handle incoming WebSocket events.
 *
 * KEY RULE: Only act if the UI is NOT already handling this action.
 * If the user clicked Extract in THIS tab, the HTTP response handles
 * the state transition. WS events are for OTHER sources only.
 */
function handleEvent(event: RealtimeEvent, conversationId: string) {
  const wsStore = useWorkspaceStore.getState();

  switch (event.type) {
    case 'extraction.started': {
      // Another source started extraction — show extracting state
      // But only if WE didn't start it (check mode flag)
      if (wsStore.mode !== 'streaming') {
        useWorkspaceStore.getState().setMode('streaming');
      }
      break;
    }

    case 'extraction.done': {
      // Another source finished extraction — hydrate store and enter streaming mode.
      // Skip if WE are currently extracting (our HTTP response will handle it).
      if (wsStore.mode === 'streaming') break;

      const projectId = useChatStore.getState().activeProjectId;
      if (!projectId) break;

      hydrateConversationToStore(projectId, conversationId)
        .then(() => {
          // Enter streaming mode — YOpsFeed will auto-transition to executed when done.
          // Don't auto-expand the panel: panel state is user-controlled (click to open).
          useWorkspaceStore.getState().setMode('streaming');
        })
        .catch(() => {
          // Hydration failed — non-critical for realtime path
        });
      break;
    }

    case 'draft.changed':
    case 'yops.applied': {
      // Draft modified by another source — re-hydrate via replay.
      if (wsStore.mode === 'streaming') break; // Don't interrupt active extraction

      const projectId = useChatStore.getState().activeProjectId;
      if (!projectId) break;

      hydrateConversationToStore(projectId, conversationId).catch(() => {
        // Hydration failed — non-critical for realtime path
      });
      break;
    }

    case 'commit.created': {
      if (wsStore.mode === 'streaming') break;

      const activeProjectId = useChatStore.getState().activeProjectId;
      const eventProjectId = typeof event.projectId === 'string' ? event.projectId : undefined;
      if (activeProjectId && eventProjectId && activeProjectId !== eventProjectId) break;

      const projectId = activeProjectId ?? eventProjectId;
      if (!projectId) break;

      hydrateConversationToStore(projectId, conversationId).catch(() => {
        // Hydration failed — non-critical for realtime path
      });
      break;
    }

    default:
      break;
  }
}
