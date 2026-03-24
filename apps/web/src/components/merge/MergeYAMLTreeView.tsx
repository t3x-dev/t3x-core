'use client';

/**
 * MergeYAMLTreeView — main container that assembles all frame rows + toolbars
 * into a single scrollable side-by-side YAML tree view.
 *
 * Uses a SINGLE scroll container (not two synced panes). The layout is:
 *   Column headers (Source | Target)
 *   Scrollable area:
 *     Conflicts → MergeFrameRow + MergeToolbarRow + optional relation annotation
 *     OnlyInSource → MergeFrameRow with keep/discard
 *     OnlyInTarget → MergeFrameRow with keep/discard + optional relation annotation
 *     Auto-kept → collapsible section
 */

import type { FrameMergeResult, Relation } from '@t3x-dev/core';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
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
  activeFrameId: string | null;
  onSelectFrame: (id: string) => void;
}

// ── Relation annotation row (spans both panes) ──────────────────────────────

function RelationRow({ relation, status }: { relation: Relation; status: 'added' | 'kept' }) {
  const arrow = '\u2192'; // →
  const colorClass =
    status === 'added'
      ? 'text-[var(--merge-target-accent)]'
      : 'text-[var(--text-tertiary)] opacity-40';

  const content = (
    <div
      className={cn(
        'flex items-center gap-1.5 font-mono text-[10px] min-h-[18px] py-0.5',
        colorClass
      )}
      style={{ paddingLeft: 'calc(36px + 4px + 10px)', paddingRight: '10px' }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: 'var(--yaml-ref)' }}
      />
      <span>{relation.from}</span>
      <span className="opacity-40">{arrow}</span>
      <span>{relation.to}</span>
      <span className="opacity-30 text-[9px]">{relation.type}</span>
      {status === 'added' && (
        <span className="text-[8px] font-medium uppercase tracking-wider opacity-60">new</span>
      )}
    </div>
  );

  return (
    <div className="flex">
      <div className="flex-1 min-w-0 border-r-2 border-r-[var(--stroke-pane-border)]">
        {content}
      </div>
      <div className="flex-1 min-w-0">{content}</div>
    </div>
  );
}

// ── Auto-kept collapse bar ───────────────────────────────────────────────────

function AutoKeptCollapseBar({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="flex cursor-pointer select-none" onClick={onToggle}>
      <div className="flex-1 min-w-0 border-r-2 border-r-[var(--stroke-pane-border)]">
        <div
          className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-tertiary)] py-[3px] px-3 hover:bg-[var(--hover-bg)]"
          style={{ paddingLeft: 'calc(36px + 4px + 10px)' }}
        >
          <span className={cn('transition-transform', expanded && 'rotate-90')}>{'\u203A'}</span>
          <span>
            {count} identical frame{count > 1 ? 's' : ''} auto-kept
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-tertiary)] py-[3px] px-3 hover:bg-[var(--hover-bg)]"
          style={{ paddingLeft: 'calc(36px + 4px + 10px)' }}
        >
          <span className={cn('transition-transform', expanded && 'rotate-90')}>{'\u203A'}</span>
          <span>
            {count} identical frame{count > 1 ? 's' : ''} auto-kept
          </span>
        </div>
      </div>
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
  activeFrameId,
  onSelectFrame,
}: MergeYAMLTreeViewProps) {
  const [autoKeptExpanded, setAutoKeptExpanded] = useState(false);

  // Build a lookup of relations that touch each conflict frame
  const conflictRelations = useMemo(() => {
    const map = new Map<string, Relation[]>();
    const allRelations = [
      ...mergeResult.relationsInBoth,
      ...mergeResult.relationsOnlyInSource,
      ...mergeResult.relationsOnlyInTarget,
    ];
    const conflictIds = new Set(mergeResult.conflicts.map((c) => c.frameId));
    for (const rel of allRelations) {
      if (conflictIds.has(rel.from)) {
        const existing = map.get(rel.from) ?? [];
        existing.push(rel);
        map.set(rel.from, existing);
      }
      if (conflictIds.has(rel.to)) {
        const existing = map.get(rel.to) ?? [];
        existing.push(rel);
        map.set(rel.to, existing);
      }
    }
    return map;
  }, [mergeResult]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Column headers ── */}
      <div className="flex shrink-0 border-b border-[var(--stroke-divider)]">
        {/* Source header */}
        <div className="flex flex-1 items-center justify-between px-4 h-[34px] text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.8px] bg-[var(--surface-panel)] border-r-2 border-r-[var(--stroke-pane-border)]">
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-[6px] h-[6px] rounded-full"
              style={{ background: 'var(--merge-source-accent)' }}
            />
            Source
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-medium border border-[var(--stroke-divider)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] normal-case tracking-normal">
            {sourceBranch} @ {sourceHash.slice(0, 7)}
          </span>
        </div>

        {/* Target header */}
        <div className="flex flex-1 items-center justify-between px-4 h-[34px] text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.8px] bg-[var(--surface-panel)]">
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-[6px] h-[6px] rounded-full"
              style={{ background: 'var(--merge-target-accent)' }}
            />
            Target
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-medium border border-[var(--stroke-divider)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] normal-case tracking-normal">
            {targetBranch} @ {targetHash.slice(0, 7)}
          </span>
        </div>
      </div>

      {/* ── Single scroll container ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* ── 1. Conflicts ── */}
        {mergeResult.conflicts.map((conflict) => {
          const frameId = conflict.frameId;
          const resolution = resolutions.get(frameId) ?? null;
          const rels = conflictRelations.get(frameId);

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
                frameId={frameId}
                resolution={resolution}
                onResolve={(res) => onResolveConflict(frameId, res)}
                hasSlotConflicts={conflict.slotConflicts.length > 0}
              />
              {/* Relation annotations for this conflict frame */}
              {rels?.map((rel) => (
                <RelationRow
                  key={`${rel.from}-${rel.to}-${rel.type}`}
                  relation={rel}
                  status={
                    mergeResult.relationsOnlyInTarget.some(
                      (r) => r.from === rel.from && r.to === rel.to && r.type === rel.type
                    )
                      ? 'added'
                      : 'kept'
                  }
                />
              ))}
            </div>
          );
        })}

        {/* ── 2. Only in source ── */}
        {mergeResult.onlyInSource.map((frame) => (
          <div key={frame.id}>
            <MergeFrameRow
              type="onlyInSource"
              frameId={frame.id}
              sourceFrame={frame}
              isKept={keepSource.has(frame.id)}
              onToggleKeep={() => onToggleKeepSource(frame.id)}
              anchorId={`merge-frame-${frame.id}`}
            />
          </div>
        ))}

        {/* ── 3. Only in target ── */}
        {mergeResult.onlyInTarget.map((frame) => {
          // Check for new relations involving this frame
          const newRels = mergeResult.relationsOnlyInTarget.filter(
            (r) => r.from === frame.id || r.to === frame.id
          );

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
              {newRels.map((rel) => (
                <RelationRow
                  key={`${rel.from}-${rel.to}-${rel.type}`}
                  relation={rel}
                  status="added"
                />
              ))}
            </div>
          );
        })}

        {/* ── 4. Auto-kept (collapsible) ── */}
        <AutoKeptCollapseBar
          count={mergeResult.autoKept.length}
          expanded={autoKeptExpanded}
          onToggle={() => setAutoKeptExpanded((prev) => !prev)}
        />
        {autoKeptExpanded &&
          mergeResult.autoKept.map((frame) => (
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
    </div>
  );
}
