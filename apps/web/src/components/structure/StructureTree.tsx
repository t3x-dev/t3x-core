'use client';

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './StructureTree.module.css';

/** Presentation only: callers retain their own document operations and persistence. */
export function StructureTreeRow({
  path,
  editable = false,
  depth,
  expanded,
  selected,
  picking,
  kind,
  label,
  icon,
  iconTitle,
  preview,
  actions,
  onSelect,
  onToggle,
}: {
  path: string;
  editable?: boolean;
  depth: number;
  expanded?: boolean;
  selected: boolean;
  picking?: boolean;
  kind: string;
  label: ReactNode;
  icon: ReactNode;
  iconTitle: string;
  preview: ReactNode;
  actions: ReactNode;
  onSelect: () => void;
  onToggle?: () => void;
}) {
  return (
    <div
      aria-expanded={expanded}
      aria-selected={selected}
      aria-level={depth + 1}
      className={styles.row}
      data-editable={editable || undefined}
      data-kind={kind}
      data-picking={picking || undefined}
      data-selected={selected || undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      role="treeitem"
      style={{ paddingLeft: 8 + Math.min(depth, 8) * 16 }}
      tabIndex={0}
    >
      <span className={styles.identity} title={path || 'root'}>
        {onToggle && expanded !== undefined ? (
          <button
            type="button"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${path}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <ChevronRight className={styles.chevron} data-visible aria-hidden="true" />
          </button>
        ) : (
          <ChevronRight
            className={styles.chevron}
            data-visible={expanded !== undefined}
            aria-hidden="true"
          />
        )}
        <span className={styles.typeIcon} title={iconTitle}>
          {icon}
        </span>
        <span className={styles.label}>{label}</span>
      </span>
      <span className={styles.preview} title={typeof preview === 'string' ? preview : undefined}>
        {preview}
      </span>
      {actions}
    </div>
  );
}

export function visibleTreeRows<T extends { path: string; parentPath: string | null }>(
  rows: readonly T[],
  collapsed: Readonly<Record<string, boolean>>
): T[] {
  const hidden = new Set<string>();
  for (const row of rows) {
    if (row.parentPath !== null && (collapsed[row.parentPath] || hidden.has(row.parentPath))) {
      hidden.add(row.path);
    }
  }
  return rows.filter((row) => !hidden.has(row.path));
}
