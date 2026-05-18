'use client';

import type { Relation } from '@t3x-dev/core';
import { Checkbox } from '@/components/ui/checkbox';

export function RelationSideSection({
  title,
  relations,
  included,
  onToggle,
}: {
  title: string;
  relations: Relation[];
  included: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (relations.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-[var(--text-tertiary)]">{title}</div>
      <div className="space-y-0.5 pl-2">
        {relations.map((r) => {
          const key = `${r.from}-${r.type}-${r.to}`;
          return (
            <button
              type="button"
              key={key}
              onClick={() => onToggle(key)}
              className="flex items-center gap-2 text-xs font-mono cursor-pointer"
            >
              <Checkbox checked={included.has(key)} tabIndex={-1} />
              <span>
                {r.from} <span className="text-[var(--text-tertiary)]">--{r.type}--&gt;</span>{' '}
                {r.to}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
