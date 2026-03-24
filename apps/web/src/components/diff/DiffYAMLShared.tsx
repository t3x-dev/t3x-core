'use client';

import type { FrameDiff, Relation } from '@t3x-dev/core';
import { cn } from '@/lib/utils';
import type { AlignedFrame } from './DiffYAMLUtils';

// ── CSS custom properties for diff colors ──

export const DY_CSS_VARS: React.CSSProperties = {
  '--dy-surface': '#0d1117',
  '--dy-added-bg': 'rgba(46,160,67,0.15)',
  '--dy-added-accent': '#3fb950',
  '--dy-added-word': 'rgba(46,160,67,0.45)',
  '--dy-removed-bg': 'rgba(248,81,73,0.15)',
  '--dy-removed-accent': '#f85149',
  '--dy-removed-word': 'rgba(248,81,73,0.40)',
  '--dy-modified-bg': 'rgba(210,153,34,0.10)',
  '--dy-modified-accent': '#d29922',
} as React.CSSProperties;

// ── Relation color map ──

export const REL_COLORS: Record<string, string> = {
  causes: '#ff9e64',
  conditions: '#e3b341',
  contrasts: '#f85149',
  elaborates: '#58a6ff',
  follows: '#7d8590',
  depends: '#d2a8ff',
};

export function relColor(type: string): string {
  return REL_COLORS[type] ?? '#7d8590';
}

// ── Relation helpers ──

export interface FrameRelation {
  relation: Relation;
  status: 'added' | 'removed' | 'kept';
  /** The "other" frame id (relative to the frame we're annotating) */
  otherId: string;
  /** Arrow direction: 'in' means other -> this frame, 'out' means this frame -> other */
  direction: 'in' | 'out';
}

/**
 * Gather relations relevant to a given frame, annotated with diff status.
 */
export function getFrameRelations(
  frameId: string,
  diff: FrameDiff,
): FrameRelation[] {
  const results: FrameRelation[] = [];
  const seen = new Set<string>();

  for (const r of diff.relationsAdded) {
    const key = `${r.from}:${r.to}:${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.from === frameId) {
      results.push({ relation: r, status: 'added', otherId: r.to, direction: 'out' });
    } else if (r.to === frameId) {
      results.push({ relation: r, status: 'added', otherId: r.from, direction: 'in' });
    }
  }

  for (const r of diff.relationsRemoved) {
    const key = `${r.from}:${r.to}:${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.from === frameId) {
      results.push({ relation: r, status: 'removed', otherId: r.to, direction: 'out' });
    } else if (r.to === frameId) {
      results.push({ relation: r, status: 'removed', otherId: r.from, direction: 'in' });
    }
  }

  return results;
}

// ── Relation annotation line ──

export function RelationAnnotation({
  rel,
  paddingLeft = 'calc(36px + 4px + 10px)',
}: {
  rel: FrameRelation;
  paddingLeft?: string;
}) {
  const statusClass = rel.status === 'added' ? 'text-[var(--dy-added-accent)]'
    : rel.status === 'removed' ? 'text-[var(--dy-removed-accent)] line-through opacity-50'
    : 'text-[var(--text-tertiary)] opacity-40';

  const arrow = rel.direction === 'in' ? '\u2190' : '\u2192';

  return (
    <div
      className={cn(
        'flex items-center gap-1 font-mono text-[10px] min-h-[18px]',
        statusClass,
      )}
      style={{ paddingLeft, paddingRight: '10px' }}
    >
      <span className="inline-flex items-center gap-[3px] px-1 rounded-sm text-[9px]">
        <span
          className="w-1 h-1 rounded-full shrink-0"
          style={{ background: relColor(rel.relation.type) }}
        />
      </span>
      <span className="opacity-40">{arrow}</span>
      <span>{rel.otherId}</span>
      <span className="opacity-30 text-[9px]">{rel.relation.type}</span>
    </div>
  );
}

// ── Frame separator ──

export function FrameSeparator({
  aligned,
  onClick,
  isActive,
  paddingLeft = 'calc(36px + 4px + 10px)',
}: {
  aligned: AlignedFrame;
  onClick: () => void;
  isActive: boolean;
  paddingLeft?: string;
}) {
  const statusLabel = aligned.type === 'modified' ? '~mod'
    : aligned.type === 'added' ? '+new'
    : aligned.type === 'removed' ? '-del'
    : '=';

  const statusClass = aligned.type === 'modified' ? 'text-[var(--dy-modified-accent)]'
    : aligned.type === 'added' ? 'text-[var(--dy-added-accent)]'
    : aligned.type === 'removed' ? 'text-[var(--dy-removed-accent)]'
    : 'text-[var(--text-tertiary)]';

  const frame = aligned.leftFrame ?? aligned.rightFrame;
  const frameType = frame?.type ?? aligned.frameId;

  return (
    <div
      id={`diff-frame-${aligned.frameId}`}
      className={cn(
        'flex items-center gap-[5px] text-[9px] font-medium uppercase tracking-[0.6px] select-none cursor-pointer',
        'pt-[5px] pb-[2px] opacity-60 hover:opacity-100',
        'text-[var(--text-tertiary)]',
        isActive && 'opacity-100 bg-[var(--hover-bg)]',
      )}
      style={{ paddingLeft }}
      onClick={onClick}
    >
      <span className={cn('text-[8px] font-semibold tracking-[0.3px]', statusClass)}>
        {statusLabel}
      </span>
      <span>{frameType}</span>
      <span className="font-mono opacity-40 text-[8px]">{aligned.frameId}</span>
      {/* Divider line */}
      <span className="flex-1 h-px bg-[var(--stroke-divider)] opacity-50" />
    </div>
  );
}

// ── Identical frames collapse bar ──

export function IdenticalCollapseBar({
  frames,
  onClick,
  paddingLeft = 'calc(36px + 4px + 10px)',
}: {
  frames: AlignedFrame[];
  onClick: () => void;
  paddingLeft?: string;
}) {
  if (frames.length === 0) return null;
  const names = frames
    .map(f => (f.leftFrame ?? f.rightFrame)?.type ?? f.frameId)
    .join(', ');
  return (
    <div
      className="flex items-center gap-[5px] font-mono text-[10px] text-[var(--text-tertiary)] cursor-pointer select-none opacity-50 hover:opacity-80 hover:bg-[var(--hover-bg)]"
      style={{ padding: `3px 10px 3px ${paddingLeft}` }}
      onClick={onClick}
    >
      <span>{'\u25B6'}</span>
      <span>{frames.length} identical frame{frames.length > 1 ? 's' : ''}</span>
      <span className="opacity-50">({names})</span>
    </div>
  );
}
