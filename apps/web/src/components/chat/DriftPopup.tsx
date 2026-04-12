'use client';

import { GitBranch, X } from 'lucide-react';
import { useCallback } from 'react';
import { extractNodes } from '@/lib/api/trees';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const CHOICE_LABELS: Record<string, { label: string; description: string }> = {
  keep_old: { label: 'Keep Current', description: 'Ignore the new topic, YAML unchanged' },
  keep_new: { label: 'Switch Topic', description: 'Fold current nodes, start fresh tree' },
  keep_both_separate: {
    label: 'New Project',
    description: 'Create a separate project for the new topic',
  },
  keep_both_together: { label: 'Add to Tree', description: 'Add new topic as linked sub-tree' },
};

export function DriftPopup() {
  const driftDetected = useWorkspaceStore((s) => s.driftDetected);
  const driftInfo = useWorkspaceStore((s) => s.driftInfo);
  const driftChoices = useWorkspaceStore((s) => s.driftChoices);
  const clearDrift = useWorkspaceStore((s) => s.clearDrift);
  const wsConvId = useWorkspaceStore((s) => s.conversationId);
  const activeConvId = useChatStore((s) => s.activeConversationId);
  const conversationId = wsConvId ?? activeConvId;

  const handleChoice = useCallback(
    async (choice: string) => {
      if (!conversationId || !driftInfo) return;

      clearDrift();

      if (choice === 'keep_old') {
        // Nothing to do — YAML stays the same
        return;
      }

      // For other choices, re-call extract with drift_decision
      try {
        const result = await extractNodes(conversationId, undefined, {
          choice,
          relation: driftInfo.relation,
          new_topic: driftInfo.new_topic,
        });

        if (result.status === 'completed' && result.snapshot) {
          // TODO(commit5): tree will be derived via replay
        }
      } catch {
        // Drift choice application failed — non-critical
      }
    },
    [conversationId, driftInfo, clearDrift]
  );

  if (!driftDetected || !driftInfo) return null;

  return (
    <div className="absolute inset-x-4 top-4 z-50 rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-[var(--accent-commit)]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Topic drift detected
          </span>
        </div>
        <button
          type="button"
          onClick={clearDrift}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 text-xs text-[var(--text-secondary)]">
        <span className="font-medium">{driftInfo.old_topic?.replace(/_/g, ' ')}</span>
        {driftInfo.relation && (
          <span className="mx-1 text-[var(--text-tertiary)]">{driftInfo.relation}</span>
        )}
        <span className="font-medium">{driftInfo.new_topic?.replace(/_/g, ' ')}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {driftChoices.map((choice) => {
          const meta = CHOICE_LABELS[choice];
          if (!meta) return null;
          return (
            <button
              key={choice}
              type="button"
              onClick={() => handleChoice(choice)}
              className="rounded border border-[var(--stroke-default)] px-3 py-2 text-left hover:bg-[var(--hover-bg)]"
            >
              <div className="text-xs font-medium text-[var(--text-primary)]">{meta.label}</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">{meta.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
