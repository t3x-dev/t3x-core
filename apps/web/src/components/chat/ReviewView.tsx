'use client';

/**
 * ReviewView — Review phase of the extraction panel
 *
 * Composes YamlNodeHeader + YamlSlotLine + NewSlotRow + PendingChangesBar
 * to render the current draft trees with change indicators.
 *
 * Change map is computed by comparing commandStore.pendingOps against
 * commitStore.committedNodeSnapshot.
 */

import type { TreeNode, YOp } from '@t3x-dev/core';
import { useMemo } from 'react';
import { NewSlotRow } from './NewSlotRow';
import { PendingChangesBar } from './PendingChangesBar';
import { YamlNodeHeader } from './YamlNodeHeader';
import type { SlotChange } from './YamlSlotLine';
import { YamlSlotLine } from './YamlSlotLine';
import { useCommandStore } from '@/store/commandStore';
import { useCommitStore } from '@/store/commitStore';
import { useDraftStore } from '@/store/draftStore';
import { useEditingStore } from '@/store/editingStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

// ── Helpers ──

type ChangeMap = Record<string, Record<string, SlotChange>>;

/** Check if a pending op drops a given node */
function isNodeDeleted(pendingOps: YOp[], nodeKey: string): boolean {
  return pendingOps.some((op) => {
    if (!('drop' in op)) return false;
    const path = op.drop.path;
    // drop targets the node key directly (no slash)
    return path === nodeKey;
  });
}

/**
 * Build a map of nodeKey → slotKey → SlotChange by comparing pending ops
 * against the committed snapshot.
 */
function buildChangeMap(
  trees: TreeNode[],
  committedSnapshot: Record<string, TreeNode>,
  pendingOps: YOp[]
): ChangeMap {
  const map: ChangeMap = {};

  for (const op of pendingOps) {
    if ('set' in op) {
      const slashIdx = op.set.path.indexOf('/');
      if (slashIdx === -1) continue;
      const nodeKey = op.set.path.slice(0, slashIdx);
      const slotKey = op.set.path.slice(slashIdx + 1);

      if (!map[nodeKey]) map[nodeKey] = {};

      const snap = committedSnapshot[nodeKey];
      if (snap && slotKey in snap.slots) {
        // Slot existed before — it's an edit
        const oldVal = snap.slots[slotKey];
        map[nodeKey][slotKey] = {
          type: 'edited',
          oldValue: String(oldVal ?? ''),
        };
      } else {
        // Slot didn't exist — it's an add
        map[nodeKey][slotKey] = { type: 'added' };
      }
    } else if ('unset' in op) {
      const slashIdx = op.unset.path.indexOf('/');
      if (slashIdx === -1) continue;
      const nodeKey = op.unset.path.slice(0, slashIdx);
      const slotKey = op.unset.path.slice(slashIdx + 1);

      if (!map[nodeKey]) map[nodeKey] = {};
      map[nodeKey][slotKey] = { type: 'deleted' };
    } else if ('define' in op) {
      // New node defined — no slots yet, just mark the node key
      const nk = op.define.path.split('/')[0] ?? op.define.path;
      if (!map[nk]) map[nk] = {};
    } else if ('populate' in op) {
      // Slots populated on a node — mark each slot as added
      const slashIdx = op.populate.path.indexOf('/');
      const nk = slashIdx === -1 ? op.populate.path : op.populate.path.slice(0, slashIdx);
      if (!map[nk]) map[nk] = {};
      for (const sk of Object.keys(op.populate.values)) {
        map[nk][sk] = { type: 'added' };
      }
    }
    // drop ops are handled separately via isNodeDeleted
  }

  return map;
}

// ── Component ──

export function ReviewView() {
  const trees = useDraftStore((s) => s.draft.trees);
  const pendingOps = useCommandStore((s) => s.pendingOps);
  const committedSnapshot = useCommitStore((s) => s.committedNodeSnapshot);
  const addingNodeId = useEditingStore((s) => s.adding?.nodeId ?? null);
  const hoveredNodeId = useWorkspaceStore((s) => s.selectedNodePath);

  const changeMap = useMemo(
    () => buildChangeMap(trees, committedSnapshot, pendingOps),
    [trees, committedSnapshot, pendingOps]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        style={{
          padding: '10px 14px 6px',
          fontSize: 9,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-tertiary)',
        }}
      >
        Changes to commit
      </div>

      {/* Scrollable YAML tree area */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 0 8px' }}>
        {trees.map((tree) => {
          const nodeKey = tree.key;
          const deleted = isNodeDeleted(pendingOps, nodeKey);
          const slots = tree.slots ?? {};
          const slotEntries = Object.entries(slots);
          const nodeChanges = changeMap[nodeKey];
          const isHovered = hoveredNodeId === nodeKey;

          return (
            <div
              key={nodeKey}
              className="transition-colors"
              style={{
                background: isHovered ? 'rgba(250, 204, 21, 0.04)' : 'transparent',
                borderRadius: 4,
              }}
            >
              <YamlNodeHeader
                nodeId={nodeKey}
                slotCount={slotEntries.length}
                isDeleted={deleted}
              />

              {!deleted &&
                slotEntries.map(([slotKey, value]) => (
                  <YamlSlotLine
                    key={`${nodeKey}/${slotKey}`}
                    nodeId={nodeKey}
                    slotKey={slotKey}
                    value={String(value ?? '')}
                    change={nodeChanges?.[slotKey]}
                  />
                ))}

              {!deleted && addingNodeId === nodeKey && <NewSlotRow nodeId={nodeKey} />}

              {/* Spacer between nodes */}
              <div style={{ height: 6 }} />
            </div>
          );
        })}

        {trees.length === 0 && (
          <div
            className="text-center"
            style={{
              padding: '24px 14px',
              fontSize: 11,
              color: 'var(--text-tertiary)',
            }}
          >
            No trees extracted yet.
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <PendingChangesBar />
    </div>
  );
}
