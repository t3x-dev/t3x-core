'use client';

import type { SentenceRelation } from '@/lib/api/relations';
import { cn } from '@/lib/utils';

interface RelationsListProps {
  relations: SentenceRelation[];
  sentences: Array<{ id: string; text: string }>;
}

const typeColors: Record<string, string> = {
  supports: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  contrasts: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  causes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  elaborates: 'bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400',
  temporal_follows: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  conditions: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  summarizes: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
};

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function lookupSentence(id: string, sentences: Array<{ id: string; text: string }>): string {
  const found = sentences.find((s) => s.id === id);
  return found?.text ?? `[${id}]`;
}

export function RelationsList({ relations, sentences }: RelationsListProps) {
  if (relations.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-[var(--text-tertiary)] text-sm">
        No relations found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {relations.map((rel) => (
        <div
          key={rel.id}
          className="flex items-center gap-3 p-3 bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-md text-sm"
          title={rel.reasoning}
        >
          {/* Source sentence */}
          <span className="flex-1 min-w-0 text-[var(--text-secondary)] truncate">
            {truncate(lookupSentence(rel.source_id, sentences), 60)}
          </span>

          {/* Relation type badge */}
          <span
            className={cn(
              'shrink-0 px-2 py-0.5 rounded-full text-xs font-medium',
              typeColors[rel.type] ?? 'bg-gray-100 text-gray-700'
            )}
          >
            {rel.type.replace('_', ' ')}
          </span>

          {/* Target sentence */}
          <span className="flex-1 min-w-0 text-[var(--text-secondary)] truncate">
            {truncate(lookupSentence(rel.target_id, sentences), 60)}
          </span>

          {/* Confidence bar */}
          <div className="shrink-0 w-16 h-2 rounded-full bg-[var(--surface-app)] overflow-hidden border border-[var(--stroke-divider)]">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${Math.round(rel.confidence * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
