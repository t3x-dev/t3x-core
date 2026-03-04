'use client';

import {
  AlignJustify,
  Check,
  Columns2,
  Equal,
  FileText,
  Minus,
  Paperclip,
  Pencil,
  Plus,
} from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import { useTerminology } from '@/hooks/useTerminology';
import { cn } from '@/lib/utils';

interface DiffStatsBarProps {
  identical: number;
  equivalent?: number;
  modified: number;
  added: number;
  removed: number;
  onJump?: (section: string) => void;
  /** View mode toggle (page mode only) */
  viewMode?: 'split' | 'unified' | 'document';
  onViewModeChange?: (mode: 'split' | 'unified' | 'document') => void;
  /** Context snippets toggle (page mode only) */
  showSnippets?: boolean;
  onToggleSnippets?: () => void;
}

export function DiffStatsBar({
  identical,
  equivalent = 0,
  modified,
  added,
  removed,
  onJump,
  viewMode,
  onViewModeChange,
  showSnippets,
  onToggleSnippets,
}: DiffStatsBarProps) {
  const { t } = useTerminology();
  const aIdentical = useCountUp(identical);
  const aEquivalent = useCountUp(equivalent);
  const aModified = useCountUp(modified);
  const aAdded = useCountUp(added);
  const aRemoved = useCountUp(removed);

  const items = [
    {
      key: 'identical',
      label: t('identical_sentences'),
      count: aIdentical,
      color: 'border border-[var(--stroke-divider)] text-[var(--text-tertiary)] bg-transparent',
      icon: Check,
    },
    {
      key: 'equivalent',
      label: t('equivalent_sentences'),
      count: aEquivalent,
      color:
        'border border-teal-500/40 text-teal-500 bg-transparent',
      icon: Equal,
    },
    {
      key: 'modified',
      label: t('modified_sentences'),
      count: aModified,
      color:
        'border border-[var(--diff-modified-line)]/40 text-[var(--diff-modified-line)] bg-transparent',
      icon: Pencil,
    },
    {
      key: 'added',
      label: t('added_sentences'),
      count: aAdded,
      color:
        'border border-[var(--diff-added-line)]/40 text-[var(--diff-added-line)] bg-transparent',
      icon: Plus,
    },
    {
      key: 'removed',
      label: t('removed_sentences'),
      count: aRemoved,
      color:
        'border border-[var(--diff-removed-line)]/40 text-[var(--diff-removed-line)] bg-transparent',
      icon: Minus,
    },
  ];

  return (
    <div className="flex items-center gap-3 px-6 py-3 bg-[var(--surface-panel)] border-b border-[var(--stroke-divider)] shrink-0">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onJump?.(item.key)}
          disabled={item.count === 0}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${item.color} ${item.count === 0 ? 'text-[var(--text-tertiary)] cursor-default' : 'hover:brightness-110 cursor-pointer'}`}
        >
          <item.icon className="h-3 w-3" />
          <span>{item.label}</span>
          <span>{item.count}</span>
        </button>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Context snippets toggle */}
      {onToggleSnippets != null && (
        <button
          type="button"
          onClick={onToggleSnippets}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border',
            showSnippets
              ? 'border-[var(--accent-commit)]/40 text-[var(--accent-commit)] bg-[var(--hover-bg)]'
              : 'border-[var(--stroke-divider)] text-[var(--text-tertiary)] bg-transparent hover:text-[var(--text-secondary)]'
          )}
        >
          <Paperclip className="h-3 w-3" />
          <span>Context</span>
        </button>
      )}

      {/* View mode toggle */}
      {onViewModeChange && viewMode && (
        <div className="inline-flex rounded-md border border-[var(--stroke-divider)] overflow-hidden">
          <button
            type="button"
            onClick={() => onViewModeChange('document')}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors',
              viewMode === 'document'
                ? 'bg-[var(--hover-bg)] text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            )}
            title="Document view"
          >
            <FileText className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('split')}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors border-l border-[var(--stroke-divider)]',
              viewMode === 'split'
                ? 'bg-[var(--hover-bg)] text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            )}
            title="Split view"
          >
            <Columns2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('unified')}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors border-l border-[var(--stroke-divider)]',
              viewMode === 'unified'
                ? 'bg-[var(--hover-bg)] text-[var(--text-primary)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            )}
            title="Unified view"
          >
            <AlignJustify className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
