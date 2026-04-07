import { useCallback } from 'react';
import { toast } from 'sonner';
import { listTopics, updateTopicApi } from '@/lib/api/topics';
import { extractNodes } from '@/lib/api/trees';
import { useChatStore } from '@/store/chatStore';
import { useDraftStore } from '@/store/draftStore';
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
  const isExtracting = useDraftStore((s) => s.isExtracting);
  const draft = useDraftStore((s) => s.draft);
  const activeTopicId = useDraftStore((s) => s.activeTopicId);
  const startExtraction = useDraftStore((s) => s.startExtraction);
  const setDraft = useDraftStore((s) => s.setDraft);
  const setDriftDetected = useWorkspaceStore((s) => s.setDriftDetected);
  const setAdvisoryQuestions = useWorkspaceStore((s) => s.setAdvisoryQuestions);
  const setGateIssues = useWorkspaceStore((s) => s.setGateIssues);

  // User-initiated extraction callback
  const handleExtract = useCallback(async () => {
    // Use resolved ID, or fallback to store's active conversation
    const extractConvId =
      resolvedConversationId ?? useChatStore.getState().activeConversationId ?? undefined;
    if (!extractConvId || isExtracting) return;

    startExtraction();

    // Expand panel if collapsed
    if (!useWorkspaceStore.getState().panelExpanded) {
      useWorkspaceStore.getState().setPanelExpanded(true);
    }

    try {
      const result = await extractNodes(
        extractConvId,
        undefined,
        undefined,
        activeTopicId ? { topicId: activeTopicId } : undefined
      );

      if (result.status === 'skipped') {
        useWorkspaceStore.getState().setMode('idle');
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
        useWorkspaceStore.getState().setMode('idle');
        return;
      }

      // status === 'completed'
      if (result.snapshot) {
        setDraft(result.snapshot);
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
        // Feed delta ops into workspace script editor
        const { opsToYaml } = await import('@/lib/scriptParser');
        const yamlText = opsToYaml(deltaOps as import('@t3x-dev/core').YOp[]);
        useWorkspaceStore.getState().setScriptText(yamlText);
        // Auto-execute to populate result + After panel
        useWorkspaceStore.getState().execute();
        useDraftStore.setState({ isExtracting: false });
      } else {
        // No delta ops — go directly to executed mode
        useWorkspaceStore.getState().setMode('executed');
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

    } catch (_err) {
      useWorkspaceStore.getState().setMode('idle');
      useDraftStore.setState({ isExtracting: false });
    }
  }, [
    resolvedConversationId,
    isExtracting,
    activeTopicId,
    startExtraction,
    setDraft,
    setDriftDetected,
    setAdvisoryQuestions,
    setGateIssues,
  ]);

  return { handleExtract, isExtracting, draft, activeTopicId };
}
