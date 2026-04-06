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
  const store = useDraftStore.getState();
  const phaseStore = usePhaseStore.getState();

  switch (event.type) {
    case 'extraction.started': {
      // Another source started extraction — show extracting state
      // But only if WE didn't start it (check isExtracting flag)
      if (!store.isExtracting) {
        useDraftStore.setState({ isExtracting: true, feedYops: [], pipelineSteps: [] });
      }
      break;
    }

    case 'extraction.done': {
      // Another source finished extraction — load data and enter yops phase
      // Skip if WE are currently extracting (our HTTP response will handle it)
      if (store.isExtracting) break;

      Promise.all([
        getSemanticDraft(conversationId),
        listYOpsLog(conversationId),
      ]).then(([draft, yopsEntries]) => {
        if (!draft || draft.trees.length === 0) return;

        // 1. Set draft
        useDraftStore.getState().setDraft(draft);

        // 2. Hydrate yops log
        if (yopsEntries && yopsEntries.length > 0) {
          useDraftStore.getState().hydrateYOpsLog(yopsEntries);

          // 3. Load latest YOps delta into feedYops
          const latestEntry = yopsEntries[yopsEntries.length - 1];
          if (Array.isArray(latestEntry?.yops) && latestEntry.yops.length > 0) {
            useDraftStore.setState({ feedYops: latestEntry.yops, isExtracting: false });
          }
        }

        // 4. Expand panel
        if (usePhaseStore.getState().panelMode === 'collapsed') {
          usePhaseStore.getState().setPanelMode('default');
        }

        // 5. Enter yops phase (NOT triage — don't skip steps)
        //    YOpsFeed will auto-transition to triage when animation completes
        usePhaseStore.getState().setPhase('yops');
      });
      break;
    }

    case 'draft.changed':
    case 'yops.applied': {
      // Draft modified by another source — refetch
      if (store.isExtracting) break; // Don't interrupt active extraction

      getSemanticDraft(conversationId).then((draft) => {
        if (draft && draft.trees.length > 0) {
          useDraftStore.getState().setDraft(draft);
        }
      });
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
