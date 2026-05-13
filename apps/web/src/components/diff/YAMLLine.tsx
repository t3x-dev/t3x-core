'use client';

import { cn } from '@/utils/cn';

export type YAMLLineStatus =
  | 'added'
  | 'removed'
  | 'modified'
  | 'unchanged'
  | 'empty'
  | 'source'
  | 'target';

export interface YAMLLineProps {
  lineNumber?: number;
  status: YAMLLineStatus;
  children: React.ReactNode;
}

/**
 * Single YAML line: gutter (line number) + marker strip (4px) + content area.
 * Gutter-neutral: background tint only on content area, not gutter.
 */
export function YAMLLine({ lineNumber, status, children }: YAMLLineProps) {
  const isEmpty = status === 'empty';

  return (
    <div
      className={cn(
        'diff-yaml-line flex min-h-[22px] items-stretch font-mono text-[12px] leading-[22px] text-[var(--dy-text-secondary)]',
        status === 'unchanged' && 'opacity-90 hover:opacity-100',
        isEmpty && 'diff-yaml-empty'
      )}
    >
      {/* Gutter */}
      <div
        className={cn(
          'w-[36px] min-w-[36px] shrink-0 select-none text-right pr-2 text-[9px] leading-[21px]',
          status === 'added' && 'text-[var(--dy-added-accent)] opacity-70',
          status === 'removed' && 'text-[var(--dy-removed-accent)] opacity-70',
          status === 'modified' && 'text-[var(--dy-modified-accent)] opacity-65',
          status === 'source' && 'text-[var(--merge-src-accent)] opacity-70',
          status === 'target' && 'text-[var(--merge-tgt-accent)] opacity-70',
          (status === 'unchanged' || isEmpty) && 'text-[var(--text-tertiary)] opacity-65'
        )}
      >
        {isEmpty ? '' : lineNumber}
      </div>

      {/* Marker strip */}
      <div
        className={cn(
          'w-px min-w-px shrink-0',
          status === 'added' && 'bg-[var(--dy-added-accent)]',
          status === 'removed' && 'bg-[var(--dy-removed-accent)]',
          status === 'modified' && 'bg-[var(--dy-modified-accent)]',
          status === 'source' && 'bg-[var(--merge-src-accent)]',
          status === 'target' && 'bg-[var(--merge-tgt-accent)]'
        )}
      />

      {/* Content */}
      <div
        className={cn(
          'flex-1 px-[10px] whitespace-pre overflow-hidden text-ellipsis',
          status === 'added' && 'bg-[var(--dy-added-bg)]',
          status === 'removed' &&
            'bg-[var(--dy-removed-bg)] text-[var(--diff-removed-text)] line-through decoration-[var(--dy-removed-accent)]/40 opacity-90',
          status === 'added' && 'text-[var(--diff-added-text)]',
          status === 'modified' && 'bg-[var(--dy-modified-bg)] text-[var(--diff-modified-text)]',
          status === 'source' && 'bg-[var(--merge-src-bg)]',
          status === 'target' && 'bg-[var(--merge-tgt-bg)]'
        )}
        style={
          isEmpty
            ? {
                background: 'var(--surface-app)',
              }
            : undefined
        }
      >
        {isEmpty ? null : children}
      </div>
    </div>
  );
}
