import type { TreeNode } from '@t3x-dev/core';
import { useEffect, useRef, useState } from 'react';
import { getApiCommit, listTopics } from '@/lib/api';
import { treesToNodes } from '@/lib/treeCompat';
import { hydrateConversation } from '@/queries/loadConversation';
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
 * Handles store initialization, hydration, inheritance, and topic loading
 * on conversation mount/change.
 *
 * Hydration path (Commit 5): calls hydrateConversation(projectId, convId) which
 * loads turns + ops log and replays derived state into workspaceStore.
 *
 * Returns parentConversationId (needed for the inheritance banner).
 */
export function useChatInit({
  conversationId,
  resolvedConversationId,
  resolvedProjectId,
  setResolvedProjectId,
  inheritFromCommitHash,
  onInheritComplete,
}: UseChatInitParams): { parentConversationId: string | null } {
  // Track whether inheritance hydration has been done (prevents re-hydration loop)
  const inheritedRef = useRef(false);
  // Parent conversation link (for child conversations created via "Create Unit")
  const [parentConversationId, setParentConversationId] = useState<string | null>(null);

  // Sync active conversation + session into stores; load existing draft
  useEffect(() => {
    const convId = resolvedConversationId ?? conversationId;
    useChatStore.getState().setActiveConversation(convId, resolvedProjectId || null);
    // Skip reset if we just hydrated from parent (prevents wipe on re-render)
    if (!inheritedRef.current) {
      useWorkspaceStore.getState().reset();
    }
    useWorkspaceStore.getState().setConversation(convId === 'new' ? null : convId);
    if (resolvedProjectId) {
      useSessionStore.getState().setLastSession(resolvedProjectId, convId);
    }

    useCommitStore.getState().setProjectId(resolvedProjectId || null);

    // Initialize commit state (load branch head) — skip when inheriting
    // because inheritance sets lastCommitHash to the parent commit hash
    if (resolvedProjectId && !inheritFromCommitHash) {
      useCommitStore.getState().initCommitState(resolvedProjectId);
    }

    // If no project ID yet, try to get it from the conversation
    if (!resolvedProjectId && convId && convId !== 'new') {
      import('@/lib/api').then(({ getConversation }) => {
        getConversation(convId)
          .then((conv) => {
            if (conv?.project_id) {
              setResolvedProjectId(conv.project_id);
              useCommitStore.getState().setProjectId(conv.project_id);
              if (!inheritFromCommitHash) {
                useCommitStore.getState().initCommitState(conv.project_id);
              }
              useChatStore.getState().setActiveConversation(convId, conv.project_id);
            }
          })
          .catch(() => {});
      });
    }

    // Helper: hydrate extraction panel from parent commit (inheritance flow)
    const hydrateFromParent = (hash: string) => {
      getApiCommit(hash)
        .then((parentCommit) => {
          // Extract parent conversation ID for "View parent" link
          const sources = (parentCommit as { sources?: Array<{ type?: string; id?: string }> })
            .sources;
          const parentConvSource = sources?.find((s) => s.type === 'conversation');
          if (parentConvSource?.id) {
            setParentConversationId(parentConvSource.id);
          }
          const trees = (parentCommit.content?.trees as TreeNode[]) ?? [];
          if (trees.length > 0) {
            // Set parent as lastCommitHash so commit B gets correct parent_hashes
            // and so BeforePanel's useParentCommit query fetches the frozen tree.
            useCommitStore.setState({ lastCommitHash: hash });
            // Mark all inherited trees as confirmed
            const confirmed: Record<string, boolean> = {};
            const nodes = treesToNodes(trees);
            for (const f of nodes) {
              confirmed[f.id] = true;
            }
            useCommitStore.setState({ confirmedNodeIds: confirmed });
            if (!useWorkspaceStore.getState().panelExpanded) {
              useWorkspaceStore.getState().setPanelExpanded(true);
            }
          }
          // Mark as hydrated so reset() is skipped on re-render
          inheritedRef.current = true;
          // Clear the flag to prevent re-hydration on remount
          onInheritComplete?.();
        })
        .catch(() => {
          // Parent fetch failed — fall back to empty panel
        });
    };

    // Load turns + ops log for this conversation via hydrateConversation (replay-based)
    if (convId && convId !== 'new' && resolvedProjectId) {
      hydrateConversation(resolvedProjectId, convId)
        .then(async () => {
          if (!useWorkspaceStore.getState().panelExpanded) {
            useWorkspaceStore.getState().setPanelExpanded(true);
          }

          // Also load topics (display only — not wired to store yet)
          const topicsList = await listTopics(convId).catch(() => []);
          if (topicsList && topicsList.length > 0) {
            // TODO(topics-state): route through workspaceStore once topics schema is added
          }
        })
        .catch(() => {
          // Hydration failed — fall back: try parent if inheriting
          if (inheritFromCommitHash) {
            hydrateFromParent(inheritFromCommitHash);
          }
        });
    } else if (inheritFromCommitHash) {
      // New conversation with inheritance — hydrate from parent commit
      useCommitStore.getState().setProjectId(resolvedProjectId || null);
      hydrateFromParent(inheritFromCommitHash);
    }
  }, [
    conversationId,
    resolvedConversationId,
    resolvedProjectId,
    inheritFromCommitHash,
    // Note: onInheritComplete intentionally excluded — including it causes a
    // reset → hydrate → onInheritComplete → reset wipe cycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  return { parentConversationId };
}
