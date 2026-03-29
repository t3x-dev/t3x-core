import type { TreeNode } from '@t3x-dev/core';
import { useCallback, useEffect, useRef } from 'react';
import { extractionStream } from '@/lib/api/extractionStream';
import { listTopics, updateTopicApi } from '@/lib/api/topics';
import { getIntentSummary } from '@/lib/intentSummary';
import { useExtractionStore } from '@/store/extractionStore';
import { useExtractionUIStore } from '@/store/extractionUIStore';
import { type TriageItem, type TriageSource, useTriageStore } from '@/store/triageStore';

const YOP_PACE_MS = 350;

interface DriftDecision {
  choice: string;
  relation?: string;
  new_topic?: string;
}

/** Convert extracted trees into TriageItems for the triage phase */
function treesToTriageItems(trees: TreeNode[]): TriageItem[] {
  return trees.map((tree) => {
    const source: TriageSource = tree.confidence && tree.confidence >= 0.8 ? 'both' : 'llm';
    const slots: Record<string, string> = {};
    for (const [key, value] of Object.entries(tree.slots)) {
      slots[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    const preview = Object.entries(slots)
      .slice(0, 2)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return {
      id: tree.key,
      source,
      slots,
      preview: preview.length > 50 ? `${preview.slice(0, 50)}...` : preview,
    };
  });
}

export function useExtractionStream(conversationId: string | undefined, turnsSavedCounter: number) {
  const abortRef = useRef<AbortController | null>(null);
  const yopBufferRef = useRef<Array<Record<string, unknown>>>([]);
  const yopTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Drain YOp buffer at paced interval for animated render.
  // Only pushes to yopsHistory for YOpsFeed display — does NOT apply to tree.
  // The `done` event sets the final snapshot, so individual YOps don't need to mutate state.
  const startYopDrain = useCallback(() => {
    if (yopTimerRef.current) return;
    yopTimerRef.current = setInterval(() => {
      const yop = yopBufferRef.current.shift();
      if (!yop) {
        clearInterval(yopTimerRef.current);
        yopTimerRef.current = undefined;
        return;
      }
      // Push to feedYops for YOpsFeed display (simple append)
      useExtractionStore.setState((s) => ({
        feedYops: [...s.feedYops, yop],
      }));

      if (useExtractionUIStore.getState().panelMode === 'collapsed') {
        useExtractionUIStore.getState().setPanelMode('default');
      }
    }, YOP_PACE_MS);
  }, []);

  const openStream = useCallback(
    async (convId: string, opts?: { driftDecision?: DriftDecision }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      useExtractionStore.getState().setExtracting(true);
      useExtractionUIStore.getState().setPhase('yops');
      useExtractionStore.setState({ feedYops: [] });
      yopBufferRef.current = [];

      try {
        const store = useExtractionStore.getState();
        const stream = extractionStream(
          {
            conversation_id: convId,
            topic_id: store.activeTopicId ?? undefined,
            ...(opts?.driftDecision && { drift_decision: opts.driftDecision }),
          },
          { signal: controller.signal }
        );

        for await (const event of stream) {
          switch (event.type) {
            case 'yop':
              yopBufferRef.current.push(event.data);
              startYopDrain();
              break;

            case 'reorganized':
              await new Promise<void>((resolve) => {
                const check = setInterval(() => {
                  if (yopBufferRef.current.length === 0) {
                    clearInterval(check);
                    resolve();
                  }
                }, 50);
              });
              if (event.data.snapshot) {
                useExtractionStore.getState().setDraft(event.data.snapshot as any);
              }
              break;

            case 'gate':
              if ((event.data as any)?.semantic?.issues) {
                const issuesByNode: Record<string, { severity: string; description: string }[]> =
                  {};
                for (const issue of (event.data as any).semantic.issues) {
                  if (issue.tree_id) {
                    if (!issuesByNode[issue.tree_id]) issuesByNode[issue.tree_id] = [];
                    issuesByNode[issue.tree_id].push({
                      severity: issue.severity,
                      description: issue.description,
                    });
                  }
                }
                useExtractionUIStore.getState().setGateIssues(issuesByNode as any);
              }
              break;

            case 'advisory':
              if ((event.data as any).questions?.length) {
                useExtractionUIStore.getState().setAdvisoryQuestions((event.data as any).questions);
              }
              break;

            case 'drift':
              useExtractionUIStore
                .getState()
                .setDriftDetected(event.data as any, (event.data as any).choices ?? []);
              break;

            case 'done': {
              // Wait for YOp buffer to fully drain so animations finish before phase change
              await new Promise<void>((resolve) => {
                const check = setInterval(() => {
                  if (yopBufferRef.current.length === 0) {
                    clearInterval(check);
                    resolve();
                  }
                }, 50);
              });

              const snapshot = event.data.snapshot as any;

              if (snapshot?.trees?.length > 0) {
                useExtractionStore.getState().setDraft(snapshot);
                const triageItems = treesToTriageItems(snapshot.trees);
                useTriageStore.getState().loadItems(triageItems);
                useExtractionUIStore.getState().setPhase('triage');
              } else {
                // No trees extracted — go back to idle
                useExtractionUIStore.getState().setPhase('idle');
              }

              listTopics(convId)
                .then((topicsList) => {
                  const s = useExtractionStore.getState();
                  s.setTopics(topicsList);
                  if (snapshot?.trees?.length > 0 && topicsList.length > 0) {
                    const rootType = snapshot.trees[0].key;
                    const currentTopic = topicsList.find((t: any) => t.id === s.activeTopicId);
                    if (currentTopic && currentTopic.name !== rootType) {
                      updateTopicApi(currentTopic.id, { name: rootType }).catch(() => {});
                      s.setTopics(
                        topicsList.map((t: any) =>
                          t.id === currentTopic.id ? { ...t, name: rootType } : t
                        )
                      );
                    }
                  }
                })
                .catch(() => {});

              if (useExtractionUIStore.getState().focusIntentEnabled && snapshot) {
                if (snapshot.trees?.length > 0) {
                  getIntentSummary(snapshot.trees, new AbortController().signal)
                    .then((r) =>
                      useExtractionUIStore.getState().setLlmHighlightedNodeIds(r.coreNodeIds)
                    )
                    .catch(() => {});
                }
              }
              break;
            }

            case 'skipped':
              useExtractionUIStore.getState().setPhase('idle');
              break;

            case 'error':
              useExtractionUIStore.getState().setPhase('idle');
              break;
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          useExtractionUIStore.getState().setPhase('idle');
        }
      } finally {
        useExtractionStore.getState().setExtracting(false);
      }
    },
    [startYopDrain]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearInterval(yopTimerRef.current);
    };
  }, []);

  const triggerExtract = useCallback(
    (opts?: { driftDecision?: DriftDecision }) => {
      if (!conversationId) return;
      openStream(conversationId, opts);
    },
    [conversationId, openStream]
  );

  // Register triggerExtract into store so ExtractionPanel + DriftPopup can access it
  useEffect(() => {
    useExtractionStore.getState().setTriggerExtract(triggerExtract);
    return () => useExtractionStore.getState().setTriggerExtract(null);
  }, [triggerExtract]);

  return { triggerExtract };
}
