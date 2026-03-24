'use client';

/**
 * MergeYAMLTreeView — Focused Diff layout.
 *
 * Renders conflict frames as compact diff cards (source → target per slot),
 * grouped by semantic tree structure derived from relations.
 * No side-by-side panes — each card shows differences inline.
 */

import type { FrameMergeResult, Relation } from '@t3x-dev/core';
import { useMemo, useState } from 'react';
import type { FrameResolution } from './FrameConflictCard';
import { MergeFrameRow } from './MergeFrameRow';
import { MergeToolbarRow } from './MergeToolbarRow';

// ── Props ────────────────────────────────────────────────────────────────────

export interface MergeYAMLTreeViewProps {
  mergeResult: FrameMergeResult;
  resolutions: Map<string, FrameResolution>;
  keepSource: Set<string>;
  keepTarget: Set<string>;
  onResolveConflict: (frameId: string, resolution: FrameResolution) => void;
  onToggleKeepSource: (frameId: string) => void;
  onToggleKeepTarget: (frameId: string) => void;
  sourceBranch: string;
  targetBranch: string;
  sourceHash: string;
  targetHash: string;
}

// ── Tree builder: group conflicts by relation chains ─────────────────────────

interface TreeGroup {
  id: string;
  /** Chain of frame IDs in this tree */
  frameIds: string[];
  /** Relations connecting frames in this tree */
  relations: Array<{ from: string; to: string; type: string }>;
}

function buildTreeGroups(mergeResult: FrameMergeResult): TreeGroup[] {
  const conflictIds = new Set(mergeResult.conflicts.map((c) => c.frameId));
  const allRelations = [
    ...mergeResult.relationsInBoth,
    ...mergeResult.relationsOnlyInSource,
    ...mergeResult.relationsOnlyInTarget,
  ];

  // Build adjacency for conflict frames only
  const adj = new Map<string, Array<{ to: string; type: string }>>();
  const inDegree = new Map<string, number>();

  for (const id of conflictIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  const treeRelations: Array<{ from: string; to: string; type: string }> = [];
  for (const rel of allRelations) {
    if (conflictIds.has(rel.from) && conflictIds.has(rel.to)) {
      adj.get(rel.from)?.push({ to: rel.to, type: rel.type });
      inDegree.set(rel.to, (inDegree.get(rel.to) ?? 0) + 1);
      treeRelations.push({ from: rel.from, to: rel.to, type: rel.type });
    }
  }

  // Find roots (in-degree 0) and BFS to build chains
  const visited = new Set<string>();
  const groups: TreeGroup[] = [];

  const roots = [...conflictIds].filter((id) => (inDegree.get(id) ?? 0) === 0);

  for (const root of roots) {
    if (visited.has(root)) continue;
    const chain: string[] = [];
    const rels: Array<{ from: string; to: string; type: string }> = [];
    const queue = [root];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      chain.push(current);

      for (const edge of adj.get(current) ?? []) {
        if (!visited.has(edge.to)) {
          rels.push({ from: current, to: edge.to, type: edge.type });
          queue.push(edge.to);
        }
      }
    }

    groups.push({ id: root, frameIds: chain, relations: rels });
  }

  // Any remaining unvisited conflicts (isolated, no relations)
  for (const id of conflictIds) {
    if (!visited.has(id)) {
      groups.push({ id, frameIds: [id], relations: [] });
    }
  }

  return groups;
}

// ── Relation connector between cards ─────────────────────────────────────────

function RelationConnector({ type }: { type: string }) {
  return (
    <div className="flex items-center gap-1.5 py-[2px] pl-5 font-mono text-[10px] text-[var(--rel-color,#d2a8ff)] opacity-50 hover:opacity-80">
      <span
        className="w-5 border-b border-dashed opacity-40"
        style={{ borderColor: 'var(--rel-color, #d2a8ff)' }}
      />
      <span>{type} &darr;</span>
    </div>
  );
}

// ── Tree group header ────────────────────────────────────────────────────────

function TreeGroupHeader({
  mergeResult,
  group,
}: {
  mergeResult: FrameMergeResult;
  group: TreeGroup;
}) {
  // Build display: frame types joined by →
  const conflictMap = new Map(mergeResult.conflicts.map((c) => [c.frameId, c]));
  const typeChain = group.frameIds
    .map((id) => {
      const conflict = conflictMap.get(id);
      return conflict?.sourceFrame?.type ?? conflict?.targetFrame?.type ?? id;
    })
    .join(' \u2192 ');

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 mb-2 text-[11px] font-semibold opacity-50 border-l-2 border-[var(--rel-color,#d2a8ff)]">
      <span className="text-[13px]">{'\uD83C\uDF33'}</span>
      <span className="text-[var(--rel-color,#d2a8ff)]">{typeChain}</span>
    </div>
  );
}

// ── Auto-kept collapse ───────────────────────────────────────────────────────

function AutoKeptSection({ mergeResult }: { mergeResult: FrameMergeResult }) {
  const [expanded, setExpanded] = useState(false);
  const count = mergeResult.autoKept.length;

  if (count === 0) return null;

  const names = mergeResult.autoKept.map((f) => f.type).join(', ');

  return (
    <div className="mt-3">
      <div
        className="flex items-center gap-1.5 px-4 py-2 text-[10px] text-[var(--text-tertiary)] cursor-pointer border border-[var(--stroke-divider)] rounded-lg hover:bg-[var(--hover-bg)]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`transition-transform inline-block ${expanded ? 'rotate-90' : ''}`}>
          &rsaquo;
        </span>
        <span>
          {count} auto-kept frame{count > 1 ? 's' : ''}
        </span>
        <span className="opacity-40">({names})</span>
      </div>
      {expanded && (
        <div className="mt-2 space-y-2">
          {mergeResult.autoKept.map((frame) => (
            <MergeFrameRow
              key={frame.id}
              type="autoKept"
              frameId={frame.id}
              sourceFrame={frame}
              targetFrame={frame}
              anchorId={`merge-frame-${frame.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function MergeYAMLTreeView({
  mergeResult,
  resolutions,
  keepSource,
  keepTarget,
  onResolveConflict,
  onToggleKeepSource,
  onToggleKeepTarget,
  sourceBranch,
  targetBranch,
  sourceHash,
  targetHash,
}: MergeYAMLTreeViewProps) {
  const treeGroups = useMemo(() => buildTreeGroups(mergeResult), [mergeResult]);
  const conflictMap = useMemo(
    () => new Map(mergeResult.conflicts.map((c) => [c.frameId, c])),
    [mergeResult]
  );

  // New relations for target-only frames
  const targetOnlyRelations = useMemo(() => {
    const map = new Map<string, Relation[]>();
    for (const rel of mergeResult.relationsOnlyInTarget) {
      const targetOnlyIds = new Set(mergeResult.onlyInTarget.map((f) => f.id));
      if (targetOnlyIds.has(rel.from) || targetOnlyIds.has(rel.to)) {
        const key = targetOnlyIds.has(rel.from) ? rel.from : rel.to;
        const existing = map.get(key) ?? [];
        existing.push(rel);
        map.set(key, existing);
      }
    }
    return map;
  }, [mergeResult]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Branch info bar */}
      <div className="flex items-center gap-3 px-6 py-2 text-[10px] font-mono text-[var(--text-tertiary)] border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] shrink-0">
        <span>
          <span
            className="inline-block w-[6px] h-[6px] rounded-full mr-1"
            style={{ background: 'var(--merge-source-accent)' }}
          />
          source: {sourceBranch} @ {sourceHash.slice(0, 7)}
        </span>
        <span className="opacity-30">vs</span>
        <span>
          <span
            className="inline-block w-[6px] h-[6px] rounded-full mr-1"
            style={{ background: 'var(--merge-target-accent)' }}
          />
          target: {targetBranch} @ {targetHash.slice(0, 7)}
        </span>
      </div>

      {/* Scrollable card area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* ── Conflict tree groups ── */}
        {treeGroups.map((group) => (
          <div key={group.id} className="mb-5">
            {/* Tree header (only if multiple frames in tree) */}
            {group.frameIds.length > 1 && (
              <TreeGroupHeader mergeResult={mergeResult} group={group} />
            )}

            {/* Render each conflict in the tree */}
            {group.frameIds.map((frameId, idx) => {
              const conflict = conflictMap.get(frameId);
              if (!conflict) return null;
              const resolution = resolutions.get(frameId) ?? null;

              // Find relation connecting this frame to the next
              const nextId = group.frameIds[idx + 1];
              const connectingRel = nextId
                ? group.relations.find(
                    (r) =>
                      (r.from === frameId && r.to === nextId) ||
                      (r.from === nextId && r.to === frameId)
                  )
                : null;

              return (
                <div key={frameId}>
                  <MergeFrameRow
                    type="conflict"
                    frameId={frameId}
                    sourceFrame={conflict.sourceFrame}
                    targetFrame={conflict.targetFrame}
                    slotConflicts={conflict.slotConflicts}
                    resolution={resolution}
                    anchorId={`merge-frame-${frameId}`}
                  />
                  <MergeToolbarRow
                    resolution={resolution}
                    onResolve={(res) => onResolveConflict(frameId, res)}
                    hasSlotConflicts={conflict.slotConflicts.length > 0}
                  />
                  {connectingRel && <RelationConnector type={connectingRel.type} />}
                </div>
              );
            })}
          </div>
        ))}

        {/* ── Source only ── */}
        {mergeResult.onlyInSource.length > 0 && (
          <div className="space-y-2 mb-5">
            {mergeResult.onlyInSource.map((frame) => (
              <MergeFrameRow
                key={frame.id}
                type="onlyInSource"
                frameId={frame.id}
                sourceFrame={frame}
                isKept={keepSource.has(frame.id)}
                onToggleKeep={() => onToggleKeepSource(frame.id)}
                anchorId={`merge-frame-${frame.id}`}
              />
            ))}
          </div>
        )}

        {/* ── Target only ── */}
        {mergeResult.onlyInTarget.length > 0 && (
          <div className="space-y-2 mb-5">
            {mergeResult.onlyInTarget.map((frame) => {
              const rels = targetOnlyRelations.get(frame.id);
              return (
                <div key={frame.id}>
                  <MergeFrameRow
                    type="onlyInTarget"
                    frameId={frame.id}
                    targetFrame={frame}
                    isKept={keepTarget.has(frame.id)}
                    onToggleKeep={() => onToggleKeepTarget(frame.id)}
                    anchorId={`merge-frame-${frame.id}`}
                  />
                  {rels?.map((rel) => (
                    <div
                      key={`${rel.from}-${rel.to}`}
                      className="flex items-center gap-1.5 pl-5 py-1 font-mono text-[10px] text-[var(--rel-color,#d2a8ff)] opacity-40"
                    >
                      <span>{rel.type}</span>
                      <span>&rarr;</span>
                      <span>{rel.from === frame.id ? rel.to : rel.from}</span>
                      <span className="text-[8px] text-[var(--added-accent,#3fb950)] ml-1 uppercase font-semibold">
                        new
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Auto-kept ── */}
        <AutoKeptSection mergeResult={mergeResult} />
      </div>
    </div>
  );
}
