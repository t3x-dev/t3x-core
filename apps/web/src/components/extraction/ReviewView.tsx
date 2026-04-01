'use client';

/**
 * ReviewView — Phase 3 rebuild
 *
 * Pure composition — zero business logic.
 * Iterates trees → YamlNodeHeader + YamlSlotLine[].
 * Bottom: PendingChangesBar.
 */

import { NewSlotRow } from '@/components/chat/NewSlotRow';
import { PendingChangesBar } from '@/components/chat/PendingChangesBar';
import { YamlNodeHeader } from '@/components/chat/YamlNodeHeader';
import type { SlotChange } from '@/components/chat/YamlSlotLine';
import { YamlSlotLine } from '@/components/chat/YamlSlotLine';
import { useCommandStore } from '@/store/commandStore';
import { useCommitStore } from '@/store/commitStore';
import { useDraftStore } from '@/store/draftStore';
import { useEditingStore } from '@/store/editingStore';
import { useExtractionUIStore } from '@/store/extractionUIStore';

// ── Committed section ──

function CommittedSection() {
  const committedNodeSnapshot = useCommitStore((s) => s.committedNodeSnapshot);
  const keys = Object.keys(committedNodeSnapshot);
  if (keys.length === 0) return null;

  return (
    <>
      <div
        className="flex items-center justify-between"
        style={{
          padding: '7px 14px',
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: 'var(--text-tertiary)',
          background: 'rgba(255,255,255,0.015)',
          borderBottom: '1px solid var(--stroke-default)',
          marginTop: 4,
        }}
      >
        <span>Committed</span>
        <span style={{ fontWeight: 400 }}>{keys.length} nodes</span>
      </div>
      <div style={{ padding: '2px 0', opacity: 0.4 }}>
        {keys.map((key) => {
          const node = committedNodeSnapshot[key];
          const slotCount = node ? Object.keys(node.slots).length : 0;
          return (
            <div
              key={key}
              className="flex items-center gap-1.5"
              style={{ padding: '5px 10px 5px 14px', minHeight: 28 }}
            >
              <div
                style={{ width: 4, alignSelf: 'stretch', background: '#4ade80', opacity: 0.25 }}
              />
              <span style={{ fontSize: 10, color: '#4ade80', opacity: 0.4 }}>&#10003;</span>
              <span
                className="flex-1"
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {key}:
              </span>
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 6px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {slotCount}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Main ──

export function ReviewView() {
  const draft = useDraftStore((s) => s.draft);
  const manualEditedNodeIds = useDraftStore((s) => s.manualEditedNodeIds);
  const adding = useEditingStore((s) => s.adding);
  const pendingOps = useCommandStore((s) => s.pendingOps);
  const setPhase = useExtractionUIStore((s) => s.setPhase);

  // Build change map from pendingOps
  const changeMap = new Map<string, SlotChange>();
  for (const op of pendingOps) {
    if ('set' in op) {
      const path = op.set.path;
      // If already in changeMap as non-edit, it's an add
      if (!changeMap.has(path)) {
        // Check if this was an existing slot by looking at the undo stack
        changeMap.set(path, { type: 'edited', oldValue: '' });
      }
    } else if ('unset' in op) {
      changeMap.set(op.unset.path, { type: 'deleted' });
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="flex items-center justify-between"
          style={{
            padding: '7px 14px',
            fontSize: 9,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: 'var(--text-tertiary)',
            background: 'rgba(255,255,255,0.015)',
            borderBottom: '1px solid var(--stroke-default)',
          }}
        >
          <span>Changes to commit</span>
        </div>

        <div style={{ padding: '2px 0' }}>
          {draft.trees.map((tree, treeIdx) => (
            <div key={tree.key}>
              <YamlNodeHeader nodeId={tree.key} slotCount={Object.keys(tree.slots).length} />
              {Object.entries(tree.slots).map(([slotKey, slotValue]) => {
                const path = `${tree.key}/${slotKey}`;
                const change = changeMap.get(path);
                const isManual = manualEditedNodeIds.has(tree.key);

                return (
                  <YamlSlotLine
                    key={slotKey}
                    nodeId={tree.key}
                    slotKey={slotKey}
                    value={typeof slotValue === 'string' ? slotValue : JSON.stringify(slotValue)}
                    change={change ?? (isManual ? { type: 'added' } : undefined)}
                  />
                );
              })}
              {adding?.nodeId === tree.key && <NewSlotRow nodeId={tree.key} />}
              {treeIdx < draft.trees.length - 1 && <div style={{ height: 6 }} />}
            </div>
          ))}
        </div>

        <CommittedSection />
      </div>

      {/* Bottom bar */}
      <PendingChangesBar onBack={() => setPhase('triage')} />
    </div>
  );
}
