'use client';

import { cn } from '@/lib/utils';

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
        'diff-yaml-line flex items-stretch font-mono text-[11.5px] leading-[21px] min-h-[21px]',
        status === 'unchanged' && 'opacity-[0.45] hover:opacity-80',
        isEmpty && 'diff-yaml-empty'
      )}
    >
      {/* Gutter */}
      <div
        className={cn(
          'w-[36px] min-w-[36px] shrink-0 select-none text-right pr-2 text-[9px] leading-[21px]',
          status === 'added' && 'text-[var(--dy-added-accent)] opacity-50',
          status === 'removed' && 'text-[var(--dy-removed-accent)] opacity-50',
          status === 'modified' && 'text-[var(--dy-modified-accent)] opacity-40',
          status === 'source' && 'text-[var(--merge-source-accent)] opacity-50',
          status === 'target' && 'text-[var(--merge-target-accent)] opacity-50',
          (status === 'unchanged' || isEmpty) && 'text-[var(--text-tertiary)] opacity-50'
        )}
      >
        {isEmpty ? '' : lineNumber}
      </div>

      {/* Marker strip */}
      <div
        className={cn(
          'w-1 min-w-1 shrink-0',
          status === 'added' && 'bg-[var(--dy-added-accent)]',
          status === 'removed' && 'bg-[var(--dy-removed-accent)]',
          status === 'modified' && 'bg-[var(--dy-modified-accent)]',
          status === 'source' && 'bg-[var(--merge-source-accent)]',
          status === 'target' && 'bg-[var(--merge-target-accent)]'
        )}
      />

      {/* Content */}
      <div
        className={cn(
          'flex-1 px-[10px] whitespace-pre overflow-hidden text-ellipsis',
          status === 'added' && 'bg-[var(--dy-added-bg)]',
          status === 'removed' && 'bg-[var(--dy-removed-bg)]',
          status === 'modified' && 'bg-[var(--dy-modified-bg)]',
          status === 'source' && 'bg-[var(--merge-source-bg)]',
          status === 'target' && 'bg-[var(--merge-target-bg)]'
        )}
        style={
          isEmpty
            ? {
                background:
                  'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.015) 4px, rgba(255,255,255,0.015) 5px)',
              }
            : undefined
        }
      >
        {isEmpty ? null : children}
      </div>
    </div>
  );
}
