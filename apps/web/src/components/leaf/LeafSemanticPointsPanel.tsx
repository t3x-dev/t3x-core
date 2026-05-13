'use client';

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
  const summary = buildLeafSemanticPointSummary(points);

  return (
    <div className="p-3 border-b border-[var(--stroke-divider)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Semantic Points
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)]">
          {summary.included} / {summary.total} included
        </span>
      </div>

      {points.length === 0 ? (
        <p className="py-2 text-center text-[10px] text-[var(--text-tertiary)]">
          No source semantic points available.
        </p>
      ) : (
        <div className="max-h-[240px] space-y-1 overflow-y-auto pr-1">
          {points.map((point) => (
            <label
              key={point.id}
              className={cn(
                'flex items-start gap-2 rounded-md border px-2 py-1.5 text-[11px] transition-colors',
                point.included
                  ? 'border-[var(--stroke-default)] bg-[var(--surface-card)] text-[var(--text-secondary)]'
                  : 'border-[var(--stroke-divider)] bg-[var(--surface-elevated)] text-[var(--text-tertiary)]'
              )}
            >
              <input
                type="checkbox"
                aria-label={point.label}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent-leaf)]"
                checked={point.included}
                disabled={saving}
                onChange={(event) => onTogglePoint(point.id, event.currentTarget.checked)}
              />
              <span className="min-w-0 flex-1 break-words leading-relaxed">{point.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
