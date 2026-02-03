'use client';

interface DiffStatsBarProps {
  identical: number;
  modified: number;
  added: number;
  removed: number;
  onJump?: (section: string) => void;
}

export function DiffStatsBar({ identical, modified, added, removed, onJump }: DiffStatsBarProps) {
  const items = [
    {
      key: 'identical',
      label: 'Identical',
      count: identical,
      color: 'bg-muted text-muted-foreground',
    },
    {
      key: 'modified',
      label: 'Modified',
      count: modified,
      color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    },
    {
      key: 'added',
      label: 'Added',
      count: added,
      color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    },
    {
      key: 'removed',
      label: 'Removed',
      count: removed,
      color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    },
  ];

  return (
    <div className="flex items-center gap-3 px-6 py-3 bg-muted/30 border-b">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onJump?.(item.key)}
          disabled={item.count === 0}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-opacity ${item.color} ${item.count === 0 ? 'opacity-40 cursor-default' : 'hover:opacity-80 cursor-pointer'}`}
        >
          <span>{item.label}</span>
          <span>{item.count}</span>
        </button>
      ))}
    </div>
  );
}
