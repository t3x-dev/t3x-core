/**
 * useRealtimeSync — WebSocket hook for real-time state sync.
 *
 * Opens a WebSocket connection to the API when viewing a conversation.
 * Receives events when backend state changes (extraction, yops, commits)
 * and triggers appropriate refetches to keep the UI in sync.
 *
 * Works regardless of what triggered the change:
 *   - WebUI Extract button → still works as before (plus WS notification)
 *   - CLI extraction → WS pushes event → frontend refetches
 *   - MCP extraction → WS pushes event → frontend refetches
 *   - Another browser tab → WS pushes event → both tabs update
 */

'use client';

import { useEffect, useRef } from 'react';
import { getSemanticDraft, listYOpsLog } from '@/lib/api/trees';
import { useDraftStore } from '@/store/draftStore';
import { usePhaseStore } from '@/store/phaseStore';

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
      // Clean up existing
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const ws = new WebSocket(
        `${WS_BASE}/ws?conversation_id=${encodeURIComponent(conversationId!)}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        console.debug('[ws] connected to room:', conversationId);
      };

      ws.onmessage = (evt) => {
        try {
          const event: RealtimeEvent = JSON.parse(evt.data);
          handleEvent(event, conversationId!);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        console.debug('[ws] disconnected from room:', conversationId);
        wsRef.current = null;
        // Auto-reconnect
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        // onclose will fire after onerror, triggering reconnect
      };
    }

    connect();

    // Reconnect when tab becomes visible again
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
 * Handle incoming WebSocket events by refetching relevant data.
 *
 * The event tells us WHAT changed, not the actual data.
 * We refetch from the API to get the latest state.
 * This keeps the WebSocket protocol simple (notifications only).
 */
function handleEvent(event: RealtimeEvent, conversationId: string) {
  switch (event.type) {
    case 'extraction.done': {
      // Extraction completed (by any source) — refetch draft
      getSemanticDraft(conversationId).then((draft) => {
        if (draft && draft.trees.length > 0) {
          useDraftStore.getState().setDraft(draft);
          // If panel is idle and we got new data, show it
          const phase = usePhaseStore.getState().phase;
          if (phase === 'idle') {
            usePhaseStore.getState().setPhase('triage');
          }
          // Expand panel if collapsed
          if (usePhaseStore.getState().panelMode === 'collapsed') {
            usePhaseStore.getState().setPanelMode('default');
          }
        }
      });
      // Also refresh yops log
      listYOpsLog(conversationId).then((entries) => {
        if (entries && entries.length > 0) {
          useDraftStore.getState().hydrateYOpsLog(entries);
        }
      });
      break;
    }

    case 'draft.changed':
    case 'yops.applied': {
      // Draft modified (manual edit, another user, etc.) — refetch
      getSemanticDraft(conversationId).then((draft) => {
        if (draft && draft.trees.length > 0) {
          useDraftStore.getState().setDraft(draft);
        }
      });
      break;
    }

    case 'commit.created': {
      // New commit — could refresh canvas or commit store
      // For now, just log it. Canvas refresh will be added when needed.
      console.debug('[ws] commit created in conversation:', conversationId);
      break;
    }

    case 'presence.join':
    case 'presence.leave': {
      // Future: update presence UI
      console.debug('[ws] presence:', event.type, event.payload);
      break;
    }

    case 'connected': {
      // Initial connection confirmation
      console.debug('[ws] joined room:', conversationId, 'presence:', event.payload);
      break;
    }

    default:
      break;
  }
}
