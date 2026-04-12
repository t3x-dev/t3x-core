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
import { getSemanticDraft, listYOpsLog } from '@/lib/api/trees';
import { useWorkspaceStore } from '@/store/workspaceStore';

const WS_BASE = typeof window !== 'undefined'
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
  : '';

const RECONNECT_DELAY = 5000;

interface RealtimeEvent {
  type: string;
  conversationId: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

export function useRealtimeSync(conversationId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!conversationId || conversationId === 'new') return;

    function connect() {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const ws = new WebSocket(
        `${WS_BASE}/ws?conversation_id=${encodeURIComponent(conversationId!)}`
      );
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const event: RealtimeEvent = JSON.parse(evt.data);
          handleEvent(event, conversationId!);
        } catch {}
      };

      ws.onclose = () => {
        wsRef.current = null;
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
      document.removeEventListener('visibilitychange', onVisibility);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [conversationId]);
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
      // Another source finished extraction — load data and enter streaming mode
      // Skip if WE are currently extracting (our HTTP response will handle it)
      if (wsStore.mode === 'streaming') break;

      Promise.all([
        getSemanticDraft(conversationId),
        listYOpsLog(conversationId),
      ]).then(([draft, yopsEntries]) => {
        if (!draft || draft.trees.length === 0) return;

        // TODO(commit5): tree will be derived via replay — skip setDraft

        // Hydrate yops log
        if (yopsEntries && yopsEntries.length > 0) {
          // TODO(commit5): replace with hydrateConversation(projectId, convId)
          // useDraftStore.getState().hydrateYOpsLog(yopsEntries);
        }

        // Expand panel
        if (!useWorkspaceStore.getState().panelExpanded) {
          useWorkspaceStore.getState().setPanelExpanded(true);
        }

        // Enter streaming mode — YOpsFeed will auto-transition to executed when done
        useWorkspaceStore.getState().setMode('streaming');
      });
      break;
    }

    case 'draft.changed':
    case 'yops.applied': {
      // Draft modified by another source — refetch
      if (wsStore.mode === 'streaming') break; // Don't interrupt active extraction

      // TODO(commit5): tree will be derived via replay — skip getSemanticDraft/setDraft
      break;
    }

    case 'commit.created': {
      // Commit created by another source
      // Future: refresh canvas and update commitStore
      break;
    }

    default:
      break;
  }
}
