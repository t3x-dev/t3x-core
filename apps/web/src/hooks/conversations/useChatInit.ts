import { useEffect, useRef, useState } from 'react';
import { useCommitActions } from '@/hooks/commits/useCommitActions';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { fetchConversationMeta, fetchConversationTopics } from '@/queries/chatInitFetch';
import { fetchParentCommitData } from '@/queries/hydrateFromParent';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useSessionStore } from '@/store/sessionStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface UseChatInitParams {
  conversationId: string;
  resolvedConversationId: string | undefined;
  resolvedProjectId: string;
  setResolvedProjectId: (id: string) => void;
  inheritFromCommitHash?: string;
  onInheritComplete?: () => void;
}

/**
 * Orchestrates the side effects needed when a chat page mounts or the
 * active conversation changes: syncs activeConversation + session stores,
 * resolves the project id from the conversation meta when missing, and
 * triggers the right hydration path (regular ops-log replay, or
 * inheritance from a parent commit).
 *
 * Individual concerns live in queries/:
 *  - `loadConversation.hydrateConversation` — turns + ops log replay
 *  - `hydrateFromParent`                    — parent-commit inheritance
 *  - `chatInitFetch.fetchConversationMeta`  — convId → projectId lookup
 *  - `chatInitFetch.fetchConversationTopics` — topics list (display only)
 *
 * Returns `parentConversationId` so the UI can render the "View parent"
 * banner on inherited conversations.
 */
export function useChatInit({
  conversationId,
  resolvedConversationId,
  resolvedProjectId,
  setResolvedProjectId,
  inheritFromCommitHash,
  onInheritComplete,
}: UseChatInitParams): { parentConversationId: string | null } {
  // Prevents a hydrate → reset wipe loop on re-render after inheritance.
  const inheritedRef = useRef(false);
  const [parentConversationId, setParentConversationId] = useState<string | null>(null);
  const { init: initCommitState } = useCommitActions();

  useEffect(() => {
    const convId = resolvedConversationId ?? conversationId;

    // ── 1. Sync store state for the current conversation ──
    useChatStore.getState().setActiveConversation(convId, resolvedProjectId || null);
    if (!inheritedRef.current) {
      useWorkspaceStore.getState().reset();
    }
    useWorkspaceStore.getState().setConversation(convId === 'new' ? null : convId);
    if (resolvedProjectId) {
      useSessionStore.getState().setLastSession(resolvedProjectId, convId);
    }
    useCommitStore.getState().setProjectId(resolvedProjectId || null);
    // Inheritance sets its own lastCommitHash, so don't overwrite it with the branch head.
    if (resolvedProjectId && !inheritFromCommitHash) {
      void initCommitState(resolvedProjectId);
    }

    // ── 2. Backfill the project id from the conversation when it's missing ──
    if (!resolvedProjectId && convId && convId !== 'new') {
      void fetchConversationMeta(convId).then((conv) => {
        if (!conv?.project_id) return;
        setResolvedProjectId(conv.project_id);
        useCommitStore.getState().setProjectId(conv.project_id);
        if (!inheritFromCommitHash) {
          void initCommitState(conv.project_id);
        }
        useChatStore.getState().setActiveConversation(convId, conv.project_id);
      });
    }

    // ── 3. Hydrate state (regular replay, or parent inheritance as fallback) ──
    // Pure queries return data; the hook performs the store writes.
    const runInheritance = async (hash: string) => {
      const data = await fetchParentCommitData(hash);
      if (data.parentConversationId) setParentConversationId(data.parentConversationId);
      if (data.fetched && data.hasTrees && data.lastCommitHash) {
        useCommitStore.setState({
          lastCommitHash: data.lastCommitHash,
          confirmedNodeIds: data.confirmedNodeIds,
        });
        if (!useWorkspaceStore.getState().panelExpanded) {
          useWorkspaceStore.getState().setPanelExpanded(true);
        }
      }
      if (data.fetched) {
        inheritedRef.current = true;
        onInheritComplete?.();
      }
    };

    if (convId && convId !== 'new' && resolvedProjectId) {
      hydrateConversationToStore(resolvedProjectId, convId)
        .then(async () => {
          const s = useWorkspaceStore.getState();
          if (!s.panelExpanded) s.setPanelExpanded(true);
          // Topics are display-only until a workspaceStore slot exists.
          // TODO(topics-state): route through workspaceStore once the schema lands.
          await fetchConversationTopics(convId);
        })
        .catch(() => {
          if (inheritFromCommitHash) void runInheritance(inheritFromCommitHash);
        });
    } else if (inheritFromCommitHash) {
      useCommitStore.getState().setProjectId(resolvedProjectId || null);
      void runInheritance(inheritFromCommitHash);
    }
  }, [
    conversationId,
    resolvedConversationId,
    resolvedProjectId,
    inheritFromCommitHash,
    // onInheritComplete intentionally excluded — including it causes a
    // reset → hydrate → onInheritComplete → reset wipe cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  return { parentConversationId };
}
