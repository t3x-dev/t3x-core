'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { NodeRelation } from '@/lib/api/relations';
import { truncate } from '@/lib/truncate';
import { cn } from '@/lib/utils';

interface RelationsListProps {
  relations: NodeRelation[];
  nodes: Array<{ id: string; text: string }>;
}

const typeColors: Record<string, string> = {
  causes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  conditions: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  contrasts: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  follows: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  depends: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
};

function lookupNode(id: string, nodes: Array<{ id: string; text: string }>): string {
  const found = nodes.find((n) => n.id === id);
  return found?.text ?? `[${id}]`;
}

export function RelationsList({ relations, nodes }: RelationsListProps) {
  if (relations.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-[var(--text-tertiary)] text-sm">
        No relations found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {relations.map((rel, idx) => {
        return (
          <div
            key={`${rel.from}-${rel.to}-${rel.type}-${idx}`}
            className="flex flex-col p-3 bg-[var(--surface-card)] border border-[var(--stroke-divider)] rounded-md text-sm"
          >
            <div className="flex items-center gap-3">
              <span className="shrink-0 w-5" />

              {/* Source node */}
              <span className="flex-1 min-w-0 text-[var(--text-secondary)] truncate">
                {truncate(lookupNode(rel.from, nodes), 60)}
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

              {/* Target node */}
              <span className="flex-1 min-w-0 text-[var(--text-secondary)] truncate">
                {truncate(lookupNode(rel.to, nodes), 60)}
              </span>

            </div>
          </div>
        );
      })}
    </div>
  );
}
