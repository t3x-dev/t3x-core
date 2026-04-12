import { PRESETS } from '@t3x-dev/core';
import { useCallback } from 'react';
import { toast } from 'sonner';
// listTopics, updateTopicApi removed — TODO(commit5): topics state TBD
import { extractNodes } from '@/lib/api/trees';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface UseExtractionParams {
  resolvedConversationId: string | undefined;
}

/**
 * Encapsulates the extraction handler callback and its related store selectors.
 *
 * Returns:
 * - handleExtract: the user-initiated extraction callback
 * - isExtracting: whether extraction is in progress
 */
export function useExtraction({ resolvedConversationId }: UseExtractionParams) {
  const isExtracting = useWorkspaceStore((s) => s.mode === 'streaming');
  const draft = useWorkspaceStore((s) => s.tree);
  // TODO(commit5): wire topics
  const activeTopicId: string | null = null;
  const setDriftDetected = useWorkspaceStore((s) => s.setDriftDetected);

  // User-initiated extraction callback
  const handleExtract = useCallback(
    async (sourcePinIds?: string[]) => {
      // Use resolved ID, or fallback to store's active conversation
      const extractConvId =
        resolvedConversationId ?? useChatStore.getState().activeConversationId ?? undefined;
      if (!extractConvId || isExtracting) return;

      useWorkspaceStore.getState().setMode('streaming');

      // Store which pin IDs were used for this extraction (for commit source_refs)
      useWorkspaceStore.setState({ lastExtractionPinIds: sourcePinIds ?? [] });

      // Set streaming mode (shows overlay), expand panel
      useWorkspaceStore.getState().setMode('streaming');
      if (!useWorkspaceStore.getState().panelExpanded) {
        useWorkspaceStore.getState().setPanelExpanded(true);
      }

      try {
        const preset = useWorkspaceStore.getState().extractionPreset;
        const style = PRESETS[preset];
        // Force full extraction if no commit exists yet (not incremental)
        const hasCommit = !!useCommitStore.getState().lastCommitHash;
        const result = await extractNodes(extractConvId, undefined, undefined, {
          ...(activeTopicId && { topicId: activeTopicId }),
          ...(sourcePinIds?.length && { sourcePinIds }),
          ...(!hasCommit && { forceExtract: true }),
          style,
        });

        if (result.status === 'skipped') {
          useWorkspaceStore.getState().setMode('idle');
          toast.info(
            result.reason || 'Not enough new content to extract. Continue the conversation first.'
          );
          return;
        }

        if (result.status === 'drift_detected') {
          setDriftDetected(
            result.drift ?? { new_topic: 'New topic' },
            result.choices ?? ['keep_current', 'switch_topic']
          );
          useWorkspaceStore.getState().setMode('idle');
          return;
        }

        // status === 'completed'
        if (result.snapshot) {
          // TODO(commit5): tree will be derived via replay
        }

        // delta is YOp[] (may include index/total metadata from API — strip before use)
        const rawDelta = result.delta;
        const deltaOps: unknown[] | undefined = Array.isArray(rawDelta)
          ? rawDelta.map((op: unknown) => {
              if (typeof op === 'object' && op !== null) {
                const { index, total, ...cleanOp } = op as Record<string, unknown>;
                return cleanOp;
              }
              return op;
            })
          : undefined;

        if (deltaOps && deltaOps.length > 0) {
          // TODO(commit5): replace with await runExtraction(...)
          // Feed delta ops into workspace script editor
          // useWorkspaceStore.getState().setScriptText(yamlText);
          // useWorkspaceStore.setState({ persistedOpsCount: deltaOps.length });

          // TODO(commit5): tree will be derived via replay
          // (snapshot/savedMeta/setDraft logic removed — tree is no longer set here)

          useWorkspaceStore.getState().setMode('idle');
        } else {
          // No delta ops
          useWorkspaceStore.getState().setMode('idle');
        }

        // TODO(commit5): topics state TBD
        // Reload topics after extraction (new topic may have been auto-created)
        // listTopics(extractConvId).then((topicsList) => { ... }).catch(() => {});

      } catch (_err) {
        useWorkspaceStore.getState().setMode('idle');
      }
    },
    [
      resolvedConversationId,
      isExtracting,
      activeTopicId,
      setDriftDetected,
    ]
  );

  return { handleExtract, isExtracting, draft, activeTopicId };
}
