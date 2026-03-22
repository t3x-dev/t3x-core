'use client';

import { GitBranch, X } from 'lucide-react';
import { useCallback } from 'react';
import { extractFrames } from '@/lib/api/frames';
import { createTopicApi, updateTopicApi } from '@/lib/api/topics';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

const CHOICES = [
  { key: 'keep_current', label: 'Keep Current', description: 'Ignore new topic, stay on current tree' },
  { key: 'switch_topic', label: 'Switch Topic', description: 'Collapse current tree, start fresh' },
  { key: 'new_project', label: 'New Project', description: 'Create a separate project for this topic' },
  { key: 'add_to_tree', label: 'Add to Tree', description: 'Add as subtree of current topic' },
] as const;

export function DriftPopup() {
  const driftDetected = useExtractionPanelStore((s) => s.driftDetected);
  const driftInfo = useExtractionPanelStore((s) => s.driftInfo);
  const clearDrift = useExtractionPanelStore((s) => s.clearDrift);
  const activeTopicId = useExtractionPanelStore((s) => s.activeTopicId);
  const conversationId = useExtractionPanelStore((s) => s.conversationId);
  const projectId = useExtractionPanelStore((s) => s.projectId);
  const setActiveTopicId = useExtractionPanelStore((s) => s.setActiveTopicId);
  const addTopic = useExtractionPanelStore((s) => s.addTopic);
  const applyDelta = useExtractionPanelStore((s) => s.applyDelta);
  const setExtracting = useExtractionPanelStore((s) => s.setExtracting);

  const handleChoice = useCallback(
    async (choice: string) => {
      if (!conversationId || !driftInfo) return;
      clearDrift();

      if (choice === 'keep_current') return;

      if (choice === 'switch_topic') {
        if (activeTopicId) {
          await updateTopicApi(activeTopicId, { status: 'collapsed' }).catch(() => {});
        }
        if (projectId) {
          try {
            const newTopic = await createTopicApi(conversationId, projectId, driftInfo.new_topic);
            addTopic(newTopic);
            setActiveTopicId(newTopic.id);
            setExtracting(true);
            const result = await extractFrames(conversationId, undefined, newTopic.id);
            if (result.delta) applyDelta(result.delta, 'llm_extraction');
          } catch {
            // Topic switch failed
          } finally {
            setExtracting(false);
          }
        }
        return;
      }

      if (choice === 'add_to_tree') {
        try {
          setExtracting(true);
          const result = await extractFrames(
            conversationId,
            undefined,
            activeTopicId ?? undefined,
            true
          );
          if (result.delta) applyDelta(result.delta, 'llm_extraction');
        } catch {
          // Add to tree failed
        } finally {
          setExtracting(false);
        }
        return;
      }

      // new_project: TODO - for now treat as keep_current
    },
    [
      conversationId,
      projectId,
      driftInfo,
      activeTopicId,
      clearDrift,
      addTopic,
      setActiveTopicId,
      applyDelta,
      setExtracting,
    ]
  );

  if (!driftDetected || !driftInfo) return null;

  return (
    <div className="absolute inset-x-4 top-4 z-50 rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-4 shadow-lg">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-[var(--accent-commit)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">Topic drift detected</span>
        </div>
        <button
          type="button"
          onClick={clearDrift}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        <span className="font-medium">{driftInfo.current_topic.replace(/_/g, ' ')}</span>
        {' → '}
        <span className="font-medium">{driftInfo.new_topic.replace(/_/g, ' ')}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {CHOICES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => handleChoice(c.key)}
            className="rounded-md border border-[var(--stroke-default)] px-3 py-2 text-left transition-colors hover:bg-[var(--hover-bg)]"
          >
            <div className="text-xs font-medium text-[var(--text-primary)]">{c.label}</div>
            <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{c.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
