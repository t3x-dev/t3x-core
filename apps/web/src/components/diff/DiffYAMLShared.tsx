'use client';

import type { Relation, TreeDiff } from '@t3x-dev/core';
import { useEffect, useState } from 'react';
import type { CompatNode } from '@/domain/tree/treeCompat';
import { cn } from '@/utils/cn';
import type { AlignedNode } from './DiffYAMLUtils';

// ── CSS custom properties for diff colors ──
// Light mode values (default); dark mode overridden via .dark class in globals.css

export const DY_CSS_VARS_LIGHT: React.CSSProperties = {
  '--dy-surface': '#ffffff',
  '--dy-added-bg': 'var(--diff-added-bg)',
  '--dy-added-accent': 'var(--diff-added-accent)',
  '--dy-added-word': 'var(--diff-added-word-bg)',
  '--dy-removed-bg': 'var(--diff-removed-bg)',
  '--dy-removed-accent': 'var(--diff-removed-accent)',
  '--dy-removed-word': 'var(--diff-removed-word-bg)',
  '--dy-modified-bg': 'var(--diff-modified-bg)',
  '--dy-modified-accent': 'var(--diff-modified-accent)',
  '--dy-text-primary': '#1a1a2e',
  '--dy-text-secondary': '#4a4a6a',
  '--dy-text-tertiary': '#7a7a9a',
} as React.CSSProperties;

export const DY_CSS_VARS_DARK: React.CSSProperties = {
  '--dy-surface': '#0e0e10',
  '--dy-added-bg': 'var(--diff-added-bg)',
  '--dy-added-accent': 'var(--diff-added-accent)',
  '--dy-added-word': 'var(--diff-added-word-bg)',
  '--dy-removed-bg': 'var(--diff-removed-bg)',
  '--dy-removed-accent': 'var(--diff-removed-accent)',
  '--dy-removed-word': 'var(--diff-removed-word-bg)',
  '--dy-modified-bg': 'var(--diff-modified-bg)',
  '--dy-modified-accent': 'var(--diff-modified-accent)',
  '--dy-text-primary': '#ECECEF',
  '--dy-text-secondary': '#9D9DA5',
  '--dy-text-tertiary': '#6B6B75',
} as React.CSSProperties;

/** Hook: returns the correct CSS vars based on dark/light mode */
export function useDYTheme(): React.CSSProperties {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark ? DY_CSS_VARS_DARK : DY_CSS_VARS_LIGHT;
}

// ── Relation color map ──

export const REL_COLORS: Record<string, string> = {
  causes: '#FF9E64',
  conditions: '#E5A030',
  contrasts: '#F87171',
  elaborates: '#7AA2F7',
  follows: '#6B6B75',
  depends: '#BB9AF7',
};

export function relColor(type: string): string {
  return REL_COLORS[type] ?? '#7d8590';
}

// ── Relation helpers ──

export interface TreeRelation {
  relation: Relation;
  status: 'added' | 'removed' | 'kept';
  /** The "other"  node id (relative to the  node we're annotating) */
  otherId: string;
  /** Arrow direction: 'in' means other -> this node, 'out' means this tree -> other */
  direction: 'in' | 'out';
}

/**
 * Gather relations relevant to a given node, annotated with diff status.
 */
export function getTreeRelations(treeId: string, diff: TreeDiff): TreeRelation[] {
  const results: TreeRelation[] = [];
  const seen = new Set<string>();

  for (const r of diff.relationsAdded) {
    const key = `${r.from}:${r.to}:${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.from === treeId) {
      results.push({ relation: r, status: 'added', otherId: r.to, direction: 'out' });
    } else if (r.to === treeId) {
      results.push({ relation: r, status: 'added', otherId: r.from, direction: 'in' });
    }
  }

  for (const r of diff.relationsRemoved) {
    const key = `${r.from}:${r.to}:${r.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.from === treeId) {
      results.push({ relation: r, status: 'removed', otherId: r.to, direction: 'out' });
    } else if (r.to === treeId) {
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
  rel: TreeRelation;
  paddingLeft?: string;
}) {
  const statusClass =
    rel.status === 'added'
      ? 'text-[var(--dy-added-accent)]'
      : rel.status === 'removed'
        ? 'text-[var(--dy-removed-accent)] line-through opacity-50'
        : 'text-[var(--text-tertiary)] opacity-40';

  const arrow = rel.direction === 'in' ? '\u2190' : '\u2192';

  return (
    <div
      className={cn('flex items-center gap-1 font-mono text-[10px] min-h-[18px]', statusClass)}
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

// ── Tree separator ──

export function TreeSeparator({
  aligned,
  onClick,
  isActive,
  paddingLeft = 'calc(36px + 4px + 10px)',
}: {
  aligned: AlignedNode;
  onClick: () => void;
  isActive: boolean;
  paddingLeft?: string;
}) {
  const statusLabel =
    aligned.type === 'modified'
      ? '~mod'
      : aligned.type === 'added'
        ? '+new'
        : aligned.type === 'removed'
          ? '-del'
          : '=';

  const statusClass =
    aligned.type === 'modified'
      ? 'text-[var(--dy-modified-accent)]'
      : aligned.type === 'added'
        ? 'text-[var(--dy-added-accent)]'
        : aligned.type === 'removed'
          ? 'text-[var(--dy-removed-accent)]'
          : 'text-[var(--text-tertiary)]';

  const node = aligned.leftNode ?? aligned.rightNode;
  const treeType = node?.key ?? aligned.treeId;

  return (
    <div
      id={`diff-tree-${aligned.treeId}`}
      className={cn(
        'flex items-center gap-[5px] text-[9px] font-medium uppercase tracking-[0.6px] select-none cursor-pointer',
        'pt-[5px] pb-[2px] opacity-60 hover:opacity-100',
        'text-[var(--text-tertiary)]',
        isActive && 'opacity-100 bg-[var(--hover-bg)]'
      )}
      style={{ paddingLeft }}
      onClick={onClick}
    >
      <span className={cn('text-[8px] font-semibold tracking-[0.3px]', statusClass)}>
        {statusLabel}
      </span>
      <span>{treeType}</span>
      <span className="font-mono opacity-40 text-[8px]">{aligned.treeId}</span>
      {/* Divider line */}
      <span className="flex-1 h-px bg-[var(--stroke-divider)] opacity-50" />
    </div>
  );
}

// ── Identical trees collapse bar ──

export function IdenticalCollapseBar({
  nodes,
  onClick,
  paddingLeft = 'calc(36px + 4px + 10px)',
}: {
  nodes: AlignedNode[];
  onClick: () => void;
  paddingLeft?: string;
}) {
  if (nodes.length === 0) return null;
  const names = nodes.map((f) => (f.leftNode ?? f.rightNode)?.key ?? f.treeId).join(', ');
  return (
    <div
      className="flex items-center gap-[5px] font-mono text-[10px] text-[var(--text-tertiary)] cursor-pointer select-none opacity-50 hover:opacity-80 hover:bg-[var(--hover-bg)]"
      style={{ padding: `3px 10px 3px ${paddingLeft}` }}
      onClick={onClick}
    >
      <span>{'\u25B6'}</span>
      <span>
        {nodes.length} identical tree{nodes.length > 1 ? 's' : ''}
      </span>
      <span className="opacity-50">({names})</span>
    </div>
  );
}
