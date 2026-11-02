'use client';

import type {
  WorkspaceReconciliationPreparation,
  WorkspaceReconciliationResolution,
  WorkspaceReconciliationValue,
} from '@t3x-dev/api-client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

function valueText(value: WorkspaceReconciliationValue): string {
  if (!value.present) return '(deleted)';
  const text = JSON.stringify(value.value, null, 2);
  return text.length > 1200 ? `${text.slice(0, 1200)}\n…` : text;
}

export function WorkspaceReconciliationResolver({
  disabled,
  preparation,
  onResolve,
}: {
  disabled: boolean;
  preparation: WorkspaceReconciliationPreparation;
  onResolve: (resolutions: WorkspaceReconciliationResolution[]) => void;
}) {
  const [choices, setChoices] = useState<Record<string, 'base' | 'ours' | 'theirs'>>({});
  const complete = useMemo(
    () => preparation.conflicts.every((conflict) => choices[conflict.id] !== undefined),
    [choices, preparation.conflicts]
  );

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Structured Workspace conflicts</legend>
      {preparation.conflicts.map((conflict) => (
        <section className="rounded-md border p-3" key={conflict.id}>
          <div className="flex flex-wrap items-center gap-2">
            <code>{conflict.path}</code>
            <span className="rounded border px-1.5 py-0.5 text-xs">{conflict.kind}</span>
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {(
              [
                ['Base', conflict.base],
                ['Your Draft', conflict.ours],
                ['Latest branch', conflict.theirs],
              ] as const
            ).map(([label, value]) => (
              <div className="min-w-0 rounded border p-2" key={label}>
                <strong className="text-xs">{label}</strong>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">
                  {valueText(value)}
                </pre>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={choices[conflict.id] === 'base' ? 'default' : 'outline'}
              aria-pressed={choices[conflict.id] === 'base'}
              disabled={disabled}
              onClick={() => setChoices((current) => ({ ...current, [conflict.id]: 'base' }))}
            >
              Restore base value
            </Button>
            <Button
              type="button"
              size="sm"
              variant={choices[conflict.id] === 'ours' ? 'default' : 'outline'}
              aria-pressed={choices[conflict.id] === 'ours'}
              disabled={disabled}
              onClick={() => setChoices((current) => ({ ...current, [conflict.id]: 'ours' }))}
            >
              Keep my value
            </Button>
            <Button
              type="button"
              size="sm"
              variant={choices[conflict.id] === 'theirs' ? 'default' : 'outline'}
              aria-pressed={choices[conflict.id] === 'theirs'}
              disabled={disabled}
              onClick={() => setChoices((current) => ({ ...current, [conflict.id]: 'theirs' }))}
            >
              Use branch value
            </Button>
          </div>
        </section>
      ))}
      <Button
        type="button"
        size="sm"
        disabled={disabled || !complete}
        onClick={() =>
          onResolve(
            preparation.conflicts.map((conflict) => ({
              conflict_id: conflict.id,
              choice: choices[conflict.id]!,
            }))
          )
        }
      >
        Validate and apply resolutions
      </Button>
      {!complete ? <p>Choose one value for every conflict before applying.</p> : null}
    </fieldset>
  );
}
