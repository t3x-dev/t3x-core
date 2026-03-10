'use client';

import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (relations.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-[var(--text-tertiary)] text-sm">
        No relations found
      </div>
    );
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {relations.map((rel) => {
        const hasReasoning = !!rel.reasoning;
        const isExpanded = expandedIds.has(rel.id);
        const isLowConfidence = rel.confidence < 0.5;

        return (
          <div
            key={rel.id}
            className="flex flex-col p-3 bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-md text-sm"
          >
            <div className="flex items-center gap-3">
              {/* Expand toggle */}
              {hasReasoning ? (
                <button
                  type="button"
                  className="shrink-0 p-0.5 rounded hover:bg-[var(--surface-app)] text-[var(--text-tertiary)] transition-colors"
                  onClick={() => toggleExpand(rel.id)}
                  aria-label={isExpanded ? 'Collapse reasoning' : 'Expand reasoning'}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <span className="shrink-0 w-5" />
              )}

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

              {/* Confidence bar + low-confidence warning */}
              <div className="shrink-0 flex items-center gap-1.5">
                {isLowConfidence && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                <div className="w-16 h-2 rounded-full bg-[var(--surface-app)] overflow-hidden border border-[var(--stroke-divider)]">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.round(rel.confidence * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Expanded reasoning */}
            {hasReasoning && isExpanded && (
              <div className="mt-2 ml-7 bg-muted/30 rounded-md p-2 text-sm text-[var(--text-secondary)]">
                <div className="text-xs font-medium text-[var(--text-tertiary)] mb-1">
                  Reasoning:
                </div>
                {rel.reasoning}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
