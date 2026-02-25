'use client';

import { useCountUp } from '@/hooks/useCountUp';

interface DiffStatsBarProps {
  identical: number;
  modified: number;
  added: number;
  removed: number;
  onJump?: (section: string) => void;
}

export function DiffStatsBar({ identical, modified, added, removed, onJump }: DiffStatsBarProps) {
  const aIdentical = useCountUp(identical);
  const aModified = useCountUp(modified);
  const aAdded = useCountUp(added);
  const aRemoved = useCountUp(removed);

  const items = [
    {
      key: 'identical',
      label: 'Identical',
      count: aIdentical,
      color: 'border border-[var(--stroke-divider)] text-[var(--text-tertiary)] bg-transparent',
    },
    {
      key: 'modified',
      label: 'Modified',
      count: aModified,
      color:
        'border border-[var(--diff-modified-line)]/40 text-[var(--diff-modified-line)] bg-transparent',
    },
    {
      key: 'added',
      label: 'Added',
      count: aAdded,
      color:
        'border border-[var(--diff-added-line)]/40 text-[var(--diff-added-line)] bg-transparent',
    },
    {
      key: 'removed',
      label: 'Removed',
      count: aRemoved,
      color:
        'border border-[var(--diff-removed-line)]/40 text-[var(--diff-removed-line)] bg-transparent',
    },
  ];

  return (
    <div className="flex items-center gap-3 px-6 py-3 bg-[var(--surface-panel)] border-b border-[var(--stroke-divider)]">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onJump?.(item.key)}
          disabled={item.count === 0}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${item.color} ${item.count === 0 ? 'text-[var(--text-tertiary)] cursor-default' : 'hover:brightness-110 cursor-pointer'}`}
        >
          <span>{item.label}</span>
          <span>{item.count}</span>
        </button>
      ))}
    </div>
  );
}
