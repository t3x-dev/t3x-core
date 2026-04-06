import { useCallback } from 'react';
import { toast } from 'sonner';
import { listTopics, updateTopicApi } from '@/lib/api/topics';
import { extractNodes } from '@/lib/api/trees';
import { getIntentSummary } from '@/lib/intentSummary';
import { useChatStore } from '@/store/chatStore';
import { useDraftStore } from '@/store/draftStore';
import { useHoverStore } from '@/store/hoverStore';
import { usePhaseStore } from '@/store/phaseStore';

interface UseExtractionParams {
  resolvedConversationId: string | undefined;
  messages: Array<{ role: string; content: string; id: string }>;
}

/**
 * Encapsulates the extraction handler callback and its related store selectors.
 *
 * Returns:
 * - handleExtract: the user-initiated extraction callback
 * - isExtracting: whether extraction is in progress
 */
export function useExtraction({ resolvedConversationId, messages }: UseExtractionParams) {
  const isExtracting = useDraftStore((s) => s.isExtracting);
  const focusIntentEnabled = useHoverStore((s) => s.focusIntentEnabled);
  const setLlmHighlightedNodeIds = useHoverStore((s) => s.setLlmHighlightedNodeIds);
  const draft = useDraftStore((s) => s.draft);
  const activeTopicId = useDraftStore((s) => s.activeTopicId);
  const startExtraction = useDraftStore((s) => s.startExtraction);
  const setNodeSourceTags = useDraftStore((s) => s.setNodeSourceTags);
  const setDraft = useDraftStore((s) => s.setDraft);
  const setDriftDetected = usePhaseStore((s) => s.setDriftDetected);
  const setAdvisoryQuestions = usePhaseStore((s) => s.setAdvisoryQuestions);
  const setGateIssues = usePhaseStore((s) => s.setGateIssues);

  // User-initiated extraction callback (called by ExtractionPanel's Extract button)
  const handleExtract = useCallback(async () => {
    // Use resolved ID, or fallback to store's active conversation
    const extractConvId =
      resolvedConversationId ?? useChatStore.getState().activeConversationId ?? undefined;
    if (!extractConvId || isExtracting) return;

    startExtraction();

    // Expand panel if collapsed
    if (usePhaseStore.getState().panelMode === 'collapsed') {
      usePhaseStore.getState().setPanelMode('default');
    }

    try {
      const result = await extractNodes(
        extractConvId,
        undefined,
        undefined,
        activeTopicId ? { topicId: activeTopicId } : undefined
      );

      if (result.status === 'skipped') {
        usePhaseStore.getState().setPhase('idle');
        useDraftStore.setState({ isExtracting: false });
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
        useDraftStore.setState({ isExtracting: false });
        usePhaseStore.getState().setPhase('idle');
        return;
      }

      // status === 'completed'
      if (result.snapshot) {
        setDraft(result.snapshot);
      }

      // delta is YOp[]
      const rawDelta = result.delta;
      const deltaOps: unknown[] | undefined = Array.isArray(rawDelta) ? rawDelta : undefined;

      if (deltaOps && deltaOps.length > 0) {
        // Has delta ops — show YOps feed animation first
        useDraftStore.setState({ feedYops: deltaOps, isExtracting: false });
        // Now that ops are loaded, switch phase to yops for feed animation
        usePhaseStore.getState().setPhase('yops');

        // Derive source tags
        const { deriveSourceTags } = await import('@/lib/sourceTag');
        const tags = deriveSourceTags(
          deltaOps as import('@t3x-dev/core').YOp[],
          messages.map((m) => ({ role: m.role }))
        );
        setNodeSourceTags(tags);

        // Auto-accept USER-sourced nodes via triageStore
        const { useTriageStore } = await import('@/store/triageStore');
        for (const [key, tag] of Object.entries(tags)) {
          if (tag === 'user' || tag === 'both') {
            useTriageStore.getState().acceptItem(key);
          }
        }
      } else {
        // No delta ops — skip YOps feed, go straight to triage
        usePhaseStore.getState().setPhase('triage');
        useDraftStore.setState({ isExtracting: false });
      }

      if (result.advisory_questions) {
        setAdvisoryQuestions(result.advisory_questions);
      }

      if (result.gate_result) {
        const gate = result.gate_result as {
          semantic?: {
            issues?: Array<{
              tree_id?: string;
              severity: 'error' | 'warning' | 'info';
              description: string;
            }>;
          };
        };
        if (gate.semantic?.issues) {
          const issuesByNode: Record<
            string,
            { severity: 'error' | 'warning' | 'info'; description: string }[]
          > = {};
          for (const issue of gate.semantic.issues) {
            if (issue.tree_id) {
              if (!issuesByNode[issue.tree_id]) issuesByNode[issue.tree_id] = [];
              issuesByNode[issue.tree_id].push({
                severity: issue.severity,
                description: issue.description,
              });
            }
          }
          setGateIssues(issuesByNode);
        }
      }

      // Reload topics after extraction (new topic may have been auto-created)
      listTopics(extractConvId)
        .then((topicsList) => {
          const ds = useDraftStore.getState();
          ds.setTopics(topicsList);
          // Auto-sync topic name with root tree type
          if (result.snapshot && result.snapshot.trees.length > 0 && topicsList.length > 0) {
            const rootType = result.snapshot.trees[0].key;
            const currentTopic = topicsList.find((t) => t.id === ds.activeTopicId);
            if (currentTopic && currentTopic.name !== rootType) {
              updateTopicApi(currentTopic.id, { name: rootType }).catch(() => {});
              ds.setTopics(
                topicsList.map((t) => (t.id === currentTopic.id ? { ...t, name: rootType } : t))
              );
            }
          }
        })
        .catch(() => {});

      if (focusIntentEnabled && result.snapshot && result.snapshot.trees.length > 0) {
        const controller = new AbortController();
        getIntentSummary(result.snapshot.trees, controller.signal)
          .then((intentResult) => {
            const ids: Record<string, boolean> = {};
            for (const id of intentResult.coreNodeIds) ids[id] = true;
            setLlmHighlightedNodeIds(ids);
          })
          .catch(() => {});
      }
    } catch (_err) {
      usePhaseStore.getState().setPhase('idle');
      useDraftStore.setState({ isExtracting: false });
    }
  }, [
    resolvedConversationId,
    isExtracting,
    activeTopicId,
    messages,
    startExtraction,
    setNodeSourceTags,
    setDraft,
    setDriftDetected,
    setAdvisoryQuestions,
    setGateIssues,
    focusIntentEnabled,
    setLlmHighlightedNodeIds,
  ]);

  return { handleExtract, isExtracting, draft, activeTopicId };
}
