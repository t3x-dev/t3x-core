'use client';

import type { TreeNode } from '@t3x-dev/core';
import type { SourceTag } from '@/lib/sourceTag';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { CommittedNodesList } from './CommittedNodesList';
import { TriageRow } from './TriageRow';

interface TriageViewProps {
  onGoToReview: () => void;
}

export function TriageView({ onGoToReview }: TriageViewProps) {
  const draft = useExtractionPanelStore((s) => s.draft);
  const acceptedNodeIds = useExtractionPanelStore((s) => s.acceptedNodeIds);
  const dismissedNodeIds = useExtractionPanelStore((s) => s.dismissedNodeIds);
  const nodeSourceTags = useExtractionPanelStore((s) => s.nodeSourceTags);
  const committedNodeSnapshot = useExtractionPanelStore((s) => s.committedNodeSnapshot);
  const committedNodeIds = useExtractionPanelStore((s) => s.committedNodeIds);
  const lastCommitHash = useExtractionPanelStore((s) => s.lastCommitHash);
  const acceptNode = useExtractionPanelStore((s) => s.acceptNode);
  const dismissNode = useExtractionPanelStore((s) => s.dismissNode);
  const acceptAll = useExtractionPanelStore((s) => s.acceptAll);
  const confirmSlot = useExtractionPanelStore((s) => s.confirmSlot);
  const unconfirmSlot = useExtractionPanelStore((s) => s.unconfirmSlot);
  const confirmedSlotKeys = useExtractionPanelStore((s) => s.confirmedSlotKeys);

  const newOrChanged: TreeNode[] = [];
  const committedUnchanged: TreeNode[] = [];

  for (const tree of draft.trees) {
    if (committedNodeIds[tree.key] && committedNodeSnapshot[tree.key]) {
      const snap = committedNodeSnapshot[tree.key];
      const sameSlots =
        JSON.stringify(Object.entries(tree.slots).sort()) ===
        JSON.stringify(Object.entries(snap.slots).sort());
      if (sameSlots) {
        committedUnchanged.push(tree);
        continue;
      }
    }
    newOrChanged.push(tree);
  }

  function getStatus(key: string): 'accepted' | 'dismissed' | 'pending' {
    if (acceptedNodeIds.has(key)) return 'accepted';
    if (dismissedNodeIds.has(key)) return 'dismissed';
    return 'pending';
  }

  const acceptedCount = [...acceptedNodeIds].filter((k) =>
    newOrChanged.some((t) => t.key === k)
  ).length;
  const dismissedCount = [...dismissedNodeIds].filter((k) =>
    newOrChanged.some((t) => t.key === k)
  ).length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {committedUnchanged.length > 0 && newOrChanged.length > 0 && (
          <div className="flex items-center justify-between px-3.5 py-[7px] text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] bg-white/[0.015] border-b border-[var(--stroke-default)]">
            <span>New / Changed</span>
            <span className="font-normal">since last commit</span>
          </div>
        )}

        {newOrChanged.map((node) => (
          <TriageRow
            key={node.key}
            node={node}
            sourceTag={(nodeSourceTags[node.key] as SourceTag) ?? 'llm'}
            status={getStatus(node.key)}
            onAccept={() => acceptNode(node.key)}
            onDismiss={() => dismissNode(node.key)}
            slotStates={confirmedSlotKeys[node.key]}
            onToggleSlot={(slotKey) => {
              const isOn = confirmedSlotKeys[node.key]?.[slotKey] !== false;
              if (isOn) {
                unconfirmSlot(node.key, slotKey);
              } else {
                confirmSlot(node.key, slotKey);
              }
            }}
          />
        ))}

        {committedUnchanged.length > 0 && (
          <CommittedNodesList nodes={committedUnchanged} commitHash={lastCommitHash} />
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--stroke-default)] bg-[var(--surface-panel-alt)]">
        <div className="flex-1 text-[10px] text-[var(--text-tertiary)]">
          {acceptedCount} accepted{dismissedCount > 0 ? ` · ${dismissedCount} dismissed` : ''}
          {committedUnchanged.length > 0
            ? ` · ${committedUnchanged.length} committed unchanged`
            : ''}
        </div>
        <button
          type="button"
          onClick={() => acceptAll()}
          className="px-3.5 py-1.5 rounded-md border border-[var(--stroke-default)] text-[10px] font-semibold text-[var(--text-tertiary)] hover:bg-white/[0.04] transition-colors"
        >
          Accept All
        </button>
        <button
          type="button"
          onClick={onGoToReview}
          className="px-3.5 py-1.5 rounded-md bg-[var(--status-success)] text-black text-[10px] font-semibold hover:opacity-90 transition-opacity"
        >
          Review →
        </button>
      </div>
    </div>
  );
}
