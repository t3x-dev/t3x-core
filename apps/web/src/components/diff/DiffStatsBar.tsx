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
    { key: 'identical', label: 'Identical', count: identical, color: 'bg-gray-100 text-gray-600' },
    { key: 'modified', label: 'Modified', count: modified, color: 'bg-amber-100 text-amber-700' },
    { key: 'added', label: 'Added', count: added, color: 'bg-green-100 text-green-700' },
    { key: 'removed', label: 'Removed', count: removed, color: 'bg-red-100 text-red-700' },
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
