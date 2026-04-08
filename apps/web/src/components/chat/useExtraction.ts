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
  const handleExtract = useCallback(
    async (sourcePinIds?: string[]) => {
      // Use resolved ID, or fallback to store's active conversation
      const extractConvId =
        resolvedConversationId ?? useChatStore.getState().activeConversationId ?? undefined;
      if (!extractConvId || isExtracting) return;

      startExtraction();

      // Store which pin IDs were used for this extraction (for commit source_refs)
      useWorkspaceStore.setState({ lastExtractionPinIds: sourcePinIds ?? [] });

      // Expand panel if collapsed
      if (!useWorkspaceStore.getState().panelExpanded) {
        useWorkspaceStore.getState().setPanelExpanded(true);
      }

      try {
        const result = await extractNodes(extractConvId, undefined, undefined, {
          ...(activeTopicId && { topicId: activeTopicId }),
          ...(sourcePinIds?.length && { sourcePinIds }),
        });

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

          // Save slot_quotes from base trees BEFORE execute (execute strips metadata)
          type AnyTree = {
            key: string;
            slots: Record<string, unknown>;
            slot_quotes?: Record<string, string>;
            source?: string;
            children?: AnyTree[];
          };
          const savedMeta = new Map<
            string,
            { slot_quotes?: Record<string, string>; source?: string }
          >();
          const collectMeta = (node: AnyTree, prefix: string) => {
            const path = prefix ? `${prefix}/${node.key}` : node.key;
            if (node.slot_quotes || node.source) {
              savedMeta.set(path, { slot_quotes: node.slot_quotes, source: node.source });
            }
            for (const child of node.children ?? []) collectMeta(child, path);
          };
          for (const tree of useDraftStore.getState().draft.trees as AnyTree[]) {
            collectMeta(tree, '');
          }

          // Auto-execute to populate result + After panel
          useWorkspaceStore.getState().execute();

          // Re-apply metadata: use snapshot if available, else restore saved metadata
          if (result.snapshot) {
            setDraft(result.snapshot);
            useWorkspaceStore
              .getState()
              .snapshotBase(result.snapshot, useWorkspaceStore.getState().baseCommitHash);
          } else if (savedMeta.size > 0) {
            // Incremental extraction: restore slot_quotes from pre-execute trees
            const currentDraft = useDraftStore.getState().draft;
            const restoreMeta = (node: AnyTree, prefix: string) => {
              const path = prefix ? `${prefix}/${node.key}` : node.key;
              const meta = savedMeta.get(path);
              if (meta) {
                if (meta.slot_quotes && !node.slot_quotes) node.slot_quotes = meta.slot_quotes;
                if (meta.source && !node.source) node.source = meta.source;
              }
              for (const child of node.children ?? []) restoreMeta(child, path);
            };
            for (const tree of currentDraft.trees as AnyTree[]) restoreMeta(tree, '');
            setDraft({ ...currentDraft });
          }
          // Validate slot_quotes coverage (inline, safe against missing children)
          {
            type AnyNode = {
              key: string;
              slots: Record<string, unknown>;
              slot_quotes?: Record<string, string>;
              children?: AnyNode[];
            };
            const snapshotTrees = result.snapshot?.trees ?? [];
            const resultTrees = useWorkspaceStore.getState().result?.trees ?? [];
            const draftTrees = useDraftStore.getState().draft.trees ?? [];
            // Use the first non-empty trees source
            const treesToValidate = (
              snapshotTrees.length > 0
                ? snapshotTrees
                : resultTrees.length > 0
                  ? resultTrees
                  : draftTrees
            ) as AnyNode[];
            if (treesToValidate.length > 0) {
              const missing: string[] = [];
              let total = 0;
              let quoted = 0;
              const walk = (node: AnyNode, prefix: string) => {
                const path = prefix ? `${prefix}.${node.key}` : node.key;
                const quotes = node.slot_quotes ?? {};
                for (const k of Object.keys(node.slots)) {
                  total++;
                  if (k in quotes) quoted++;
                  else missing.push(`${path}.${k}`);
                }
                for (const child of node.children ?? []) walk(child, path);
              };
              for (const tree of treesToValidate) walk(tree, '');
              useWorkspaceStore.setState({
                quoteValidation: {
                  total,
                  quoted,
                  missing,
                  coverage: total === 0 ? 1 : quoted / total,
                },
              });
            }
          }
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
    },
    [
      resolvedConversationId,
      isExtracting,
      activeTopicId,
      startExtraction,
      setDraft,
      setDriftDetected,
      setAdvisoryQuestions,
      setGateIssues,
    ]
  );

  return { handleExtract, isExtracting, draft, activeTopicId };
}
