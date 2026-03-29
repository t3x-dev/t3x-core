import { useCallback, useEffect, useRef } from 'react';
import { extractionStream } from '@/lib/api/extractionStream';
import { useExtractionStore } from '@/store/extractionStore';
import { useExtractionUIStore } from '@/store/extractionUIStore';
import { listTopics, updateTopicApi } from '@/lib/api/topics';
import { getIntentSummary } from '@/lib/intentSummary';
import type { TreeChangeBatch } from '@t3x-dev/core';

const YOP_PACE_MS = 100;

interface DriftDecision {
  choice: string;
  relation?: string;
  new_topic?: string;
}

export function useExtractionStream(
  conversationId: string | undefined,
  turnsSavedCounter: number
) {
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevTurnsRef = useRef(0);
  const yopBufferRef = useRef<Array<Record<string, unknown>>>([]);
  const yopTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const mode = useExtractionStore((s) => s.extractionMode);

  // Drain YOp buffer at paced interval for animated render
  const startYopDrain = useCallback(() => {
    if (yopTimerRef.current) return;
    yopTimerRef.current = setInterval(() => {
      const yop = yopBufferRef.current.shift();
      if (!yop) {
        clearInterval(yopTimerRef.current);
        yopTimerRef.current = undefined;
        return;
      }
      const batch: TreeChangeBatch = { changes: [yop as any] };
      useExtractionStore.getState().applyTreeChanges(batch, 'pipeline');

      if (useExtractionUIStore.getState().panelMode === 'collapsed') {
        useExtractionUIStore.getState().setPanelMode('default');
      }
    }, YOP_PACE_MS);
  }, []);

  const openStream = useCallback(async (
    convId: string,
    opts?: { driftDecision?: DriftDecision }
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    useExtractionStore.getState().setExtracting(true);
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
              const issuesByNode: Record<string, { severity: string; description: string }[]> = {};
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
            useExtractionUIStore.getState().setDriftDetected(
              event.data as any,
              (event.data as any).choices ?? []
            );
            break;

          case 'done': {
            if (event.data.snapshot) {
              useExtractionStore.getState().setDraft(event.data.snapshot as any);
            }

            listTopics(convId).then((topicsList) => {
              const s = useExtractionStore.getState();
              s.setTopics(topicsList);
              const snap = event.data.snapshot as any;
              if (snap?.trees?.length > 0 && topicsList.length > 0) {
                const rootType = snap.trees[0].key;
                const currentTopic = topicsList.find((t: any) => t.id === s.activeTopicId);
                if (currentTopic && currentTopic.name !== rootType) {
                  updateTopicApi(currentTopic.id, { name: rootType }).catch(() => {});
                  s.setTopics(topicsList.map((t: any) =>
                    t.id === currentTopic.id ? { ...t, name: rootType } : t
                  ));
                }
              }
            }).catch(() => {});

            if (useExtractionUIStore.getState().focusIntentEnabled && event.data.snapshot) {
              const snap = event.data.snapshot as any;
              if (snap.trees?.length > 0) {
                getIntentSummary(snap.trees, new AbortController().signal)
                  .then((r) => useExtractionUIStore.getState().setLlmHighlightedNodeIds(r.coreNodeIds))
                  .catch(() => {});
              }
            }
            break;
          }

          case 'skipped':
          case 'error':
            break;
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        // Extraction failed — non-critical
      }
    } finally {
      useExtractionStore.getState().setExtracting(false);
    }
  }, [startYopDrain]);

  // Live mode: auto-trigger on new turns
  useEffect(() => {
    if (mode !== 'live' || !conversationId) return;
    if (turnsSavedCounter === 0 || turnsSavedCounter === prevTurnsRef.current) return;
    prevTurnsRef.current = turnsSavedCounter;
    openStream(conversationId);
  }, [mode, turnsSavedCounter, conversationId, openStream]);

  // Standard mode: debounced auto-trigger
  useEffect(() => {
    if (mode !== 'standard' || !conversationId) return;
    if (turnsSavedCounter === 0 || turnsSavedCounter === prevTurnsRef.current) return;
    prevTurnsRef.current = turnsSavedCounter;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      openStream(conversationId);
    }, 30_000);

    return () => clearTimeout(debounceRef.current);
  }, [mode, turnsSavedCounter, conversationId, openStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearTimeout(debounceRef.current);
      clearInterval(yopTimerRef.current);
    };
  }, []);

  const triggerExtract = useCallback((opts?: { driftDecision?: DriftDecision }) => {
    if (!conversationId) return;
    clearTimeout(debounceRef.current);
    openStream(conversationId, opts);
  }, [conversationId, openStream]);

  // Register triggerExtract into store so ExtractionPanel + DriftPopup can access it
  useEffect(() => {
    useExtractionStore.getState().setTriggerExtract(triggerExtract);
    return () => useExtractionStore.getState().setTriggerExtract(null);
  }, [triggerExtract]);

  return { triggerExtract };
}
