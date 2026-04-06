import type { TreeNode } from '@t3x-dev/core';
import { useEffect, useRef, useState } from 'react';
import { getCommitAsNodes } from '@/lib/api/commitUnified';
import { listTopics } from '@/lib/api/topics';
import { getSemanticDraft, listYOpsLog } from '@/lib/api/trees';
import { treesToNodes } from '@/lib/treeCompat';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useDraftStore } from '@/store/draftStore';
import { usePhaseStore } from '@/store/phaseStore';
import { useSessionStore } from '@/store/sessionStore';

interface UseChatInitParams {
  conversationId: string;
  resolvedConversationId: string | undefined;
  resolvedProjectId: string;
  setResolvedProjectId: (id: string) => void;
  inheritFromCommitHash?: string;
  onInheritComplete?: () => void;
}

/**
 * Handles store initialization, draft loading, yops history loading,
 * inheritance hydration, and topic loading on conversation mount/change.
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
    // Skip resetDraft if we just hydrated from parent (prevents wipe on re-render)
    if (!inheritedRef.current) {
      useDraftStore.getState().resetDraft();
    }
    useDraftStore.getState().setConversationId(convId === 'new' ? null : convId);
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

    // Helper: hydrate extraction panel from parent commit
    const hydrateFromParent = (hash: string) => {
      getCommitAsNodes(hash)
        .then((parentCommit) => {
          // Extract parent conversation ID for "View parent" link
          const sources = (parentCommit as { sources?: Array<{ type?: string; id?: string }> })
            .sources;
          const parentConvSource = sources?.find((s) => s.type === 'conversation');
          if (parentConvSource?.id) {
            setParentConversationId(parentConvSource.id);
          }
          const trees = (parentCommit.content?.trees as TreeNode[]) ?? [];
          const relations = parentCommit.content?.relations ?? [];
          if (trees.length > 0) {
            useDraftStore.getState().setDraft({ trees, relations });
            // Set parent as lastCommitHash so commit B gets correct parent_hashes
            useCommitStore.setState({ lastCommitHash: hash });
            // Mark all inherited trees as confirmed
            const confirmed: Record<string, boolean> = {};
            const nodes = treesToNodes(trees);
            for (const f of nodes) {
              confirmed[f.id] = true;
            }
            useCommitStore.setState({ confirmedNodeIds: confirmed });
            if (usePhaseStore.getState().panelMode === 'collapsed') {
              usePhaseStore.getState().setPanelMode('default');
            }
          }
          // Mark as hydrated so resetDraft() is skipped on re-render
          inheritedRef.current = true;
          // Clear the flag to prevent re-hydration on remount
          onInheritComplete?.();
        })
        .catch(() => {
          // Parent fetch failed — fall back to empty panel
        });
    };

    // Load existing semantic draft + full yops history + topics for this conversation
    if (convId && convId !== 'new') {
      Promise.all([getSemanticDraft(convId), listYOpsLog(convId), listTopics(convId)])
        .then(([draft, yopsEntries, topicsList]) => {
          if (draft && draft.trees.length > 0) {
            useDraftStore.getState().setDraft(draft);
            if (usePhaseStore.getState().panelMode === 'collapsed') {
              usePhaseStore.getState().setPanelMode('default');
            }
            // If draft exists but nothing committed yet → enter yops phase
            // (follows state machine: idle → yops → triage, no skipping)
            const phase = usePhaseStore.getState().phase;
            const hasCommits = useCommitStore.getState().lastCommitHash;
            if (phase === 'idle' && !hasCommits && yopsEntries && yopsEntries.length > 0) {
              const latestEntry = yopsEntries[yopsEntries.length - 1];
              if (Array.isArray(latestEntry?.yops) && latestEntry.yops.length > 0) {
                useDraftStore.setState({ feedYops: latestEntry.yops });
                usePhaseStore.getState().setPhase('yops');
                // YOpsFeed auto-transitions to triage when animation completes
              }
            }
          } else if (inheritFromCommitHash) {
            // No existing draft — hydrate from parent commit
            hydrateFromParent(inheritFromCommitHash);
          }
          if (yopsEntries && yopsEntries.length > 0) {
            useDraftStore.getState().hydrateYOpsLog(yopsEntries);
          }
          // Note: we intentionally do NOT lock conversation after commit.
          // Users should be able to continue chatting and extract more knowledge.
          if (topicsList && topicsList.length > 0) {
            useDraftStore.getState().setTopics(topicsList);
            // Auto-select the first active topic
            const activeTopic = topicsList.find((t) => t.status === 'active');
            if (activeTopic) {
              useDraftStore.getState().setActiveTopicId(activeTopic.id);
            }
          }
        })
        .catch(() => {
          // Draft/delta/topics load failed — non-critical
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
    // resetDraft → hydrate → onInheritComplete → resetDraft wipe cycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  return { parentConversationId };
}
