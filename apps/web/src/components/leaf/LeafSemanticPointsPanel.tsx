'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  buildLeafSemanticPointSummary,
  type LeafSemanticPointItem,
} from '@/domain/leaf/semanticPoints';
import { cn } from '@/utils/cn';

interface LeafSemanticPointsPanelProps {
  points: LeafSemanticPointItem[];
  saving: boolean;
  onTogglePoint: (pointId: string, included: boolean) => void;
}

export function LeafSemanticPointsPanel({
  points,
  saving,
  onTogglePoint,
}: LeafSemanticPointsPanelProps) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'all' | 'excluded'>('all');
  const summary = buildLeafSemanticPointSummary(points);
  const filteredPoints = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return points.filter((point) => {
      if (view === 'excluded' && point.included) return false;
      return !normalizedQuery || point.label.toLowerCase().includes(normalizedQuery);
    });
  }, [points, query, view]);

  return (
    <div className="border-b border-[var(--stroke-divider)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          State Points
        </span>
        <span className="text-[11px] text-[var(--text-tertiary)]">
          {summary.included} / {summary.total} included
        </span>
      </div>

      {points.length > 0 ? (
        <div className="mb-2 space-y-1.5">
          <label className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-tertiary)]"
            />
            <input
              aria-label="Filter state points"
              className="h-8 w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] pl-8 pr-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-commit)]"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Filter state points..."
              type="search"
              value={query}
            />
          </label>
          <fieldset className="flex gap-1">
            <legend className="sr-only">State point view</legend>
            {(['all', 'excluded'] as const).map((option) => (
              <button
                aria-pressed={view === option}
                className={cn(
                  'min-h-7 rounded-md border px-2 text-[11px] font-medium transition-colors',
                  view === option
                    ? 'border-[var(--accent-commit)]/30 bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]'
                    : 'border-[var(--stroke-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                )}
                key={option}
                onClick={() => setView(option)}
                type="button"
              >
                {option === 'all' ? 'All' : 'Excluded'}
              </button>
            ))}
          </fieldset>
        </div>
      ) : null}

      {points.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-[var(--text-tertiary)]">
          No source state points available.
        </p>
      ) : (
        <div className="max-h-[240px] space-y-1 overflow-y-auto pr-1">
          {filteredPoints.map((point) => (
            <label
              key={point.id}
              className={cn(
                'flex min-h-8 items-start gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                point.included
                  ? 'border-[var(--stroke-default)] bg-[var(--surface-card)] text-[var(--text-secondary)]'
                  : 'border-[var(--stroke-divider)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)]'
              )}
            >
              <input
                type="checkbox"
                aria-label={point.label}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-commit)]"
                checked={point.included}
                disabled={saving}
                onChange={(event) => onTogglePoint(point.id, event.currentTarget.checked)}
              />
              <span className="min-w-0 flex-1 break-words leading-relaxed">{point.label}</span>
            </label>
          ))}
          {filteredPoints.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-[var(--text-tertiary)]">
              No matching state points.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
