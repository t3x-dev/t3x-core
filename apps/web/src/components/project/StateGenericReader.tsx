'use client';

import { Braces, FileCode2 } from 'lucide-react';
import { useState } from 'react';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { Badge } from '@/components/ui/badge';
import type { StatePointRow } from '@/domain/project/stateViewModel';
import { cn } from '@/utils/cn';

export function StateGenericReader({
  rows,
  schemaName,
  yamlText,
}: {
  rows: StatePointRow[];
  schemaName: string;
  yamlText: string;
}) {
  const [mode, setMode] = useState<'structure' | 'yaml'>('structure');
  const roots = rows.filter((row) => row.depth === 0);

  return (
    <section
      aria-label="Generic structured state render"
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-card)]"
    >
      <header className="flex min-h-[55px] shrink-0 flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2.5">
        <div>
          <div className="flex items-center gap-2">
            <strong className="text-sm text-[var(--text-primary)]">Generic structured state</strong>
            <Badge variant="outline">{schemaName}</Badge>
          </div>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            No specialized reader is registered; committed nodes remain fully inspectable.
          </p>
        </div>
        <div
          aria-label="Generic state representation"
          className="ml-auto inline-flex rounded-md border border-[var(--stroke-default)] bg-[var(--surface-app)] p-0.5"
          role="tablist"
        >
          {(['structure', 'yaml'] as const).map((nextMode) => (
            <button
              aria-selected={mode === nextMode}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded px-3 text-[11px] font-bold capitalize text-[var(--text-tertiary)]',
                mode === nextMode && 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
              )}
              key={nextMode}
              onClick={() => setMode(nextMode)}
              role="tab"
              type="button"
            >
              {nextMode === 'structure' ? (
                <Braces aria-hidden="true" className="size-3.5" />
              ) : (
                <FileCode2 aria-hidden="true" className="size-3.5" />
              )}
              {nextMode}
            </button>
          ))}
        </div>
      </header>

      <StateScrollArea className="min-h-0 flex-1" label="Generic state content">
        {mode === 'structure' ? (
          <div className="mx-auto grid max-w-[1100px] gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {roots.map((root) => (
              <article
                className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4"
                key={root.path}
              >
                <div className="flex items-center justify-between gap-3">
                  <code className="truncate font-mono text-sm font-bold text-[var(--text-primary)]">
                    {root.key}
                  </code>
                  <Badge variant="outline">{root.type}</Badge>
                </div>
                <p className="mt-3 text-xs text-[var(--text-secondary)]">{root.value}</p>
                <p className="mt-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                  {rows.filter((row) => row.path.startsWith(`${root.path}/`)).length} descendant
                  nodes
                </p>
              </article>
            ))}
          </div>
        ) : (
          <pre className="min-w-max p-5 font-mono text-xs leading-6 text-[var(--text-code)]">
            {yamlText}
          </pre>
        )}
      </StateScrollArea>
    </section>
  );
}
