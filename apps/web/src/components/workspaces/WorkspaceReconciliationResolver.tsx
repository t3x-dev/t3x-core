'use client';

import type {
  WorkspaceReconciliationPreparation,
  WorkspaceReconciliationResolution,
  WorkspaceReconciliationValue,
} from '@t3x-dev/api-client';
import { Check, GitBranch, History, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

const absent = Symbol('absent');
type ComparableValue = unknown | typeof absent;

function sameValue(left: ComparableValue, right: ComparableValue): boolean {
  if (left === absent || right === absent) return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: ComparableValue): value is Record<string, unknown> {
  return value !== absent && value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compactConflictValues(
  values: [ComparableValue, ComparableValue, ComparableValue]
): [unknown, unknown, unknown] | null {
  if (sameValue(values[0], values[1]) && sameValue(values[1], values[2])) return null;

  if (values.every(Array.isArray)) {
    const arrays = values as [unknown[], unknown[], unknown[]];
    const keyed =
      arrays.some((value) => value.length > 0) &&
      arrays.every((value) =>
        value.every((item) => isRecord(item) && typeof item.key === 'string')
      );
    const output: [unknown[], unknown[], unknown[]] = [[], [], []];

    if (keyed) {
      const keys = [
        ...new Set(
          arrays.flatMap((value) => value.map((item) => (item as Record<string, unknown>).key))
        ),
      ];
      for (const key of keys) {
        const items = arrays.map(
          (value) => value.find((item) => isRecord(item) && item.key === key) ?? absent
        ) as [ComparableValue, ComparableValue, ComparableValue];
        const compacted = compactConflictValues(items);
        if (!compacted) continue;
        for (const index of [0, 1, 2] as const) {
          output[index].push(
            items[index] === absent ? { key, value: '(not present)' } : compacted[index]
          );
        }
      }
      return output;
    }

    const length = Math.max(...arrays.map((value) => value.length));
    for (let itemIndex = 0; itemIndex < length; itemIndex += 1) {
      const items = arrays.map((value) => value[itemIndex] ?? absent) as [
        ComparableValue,
        ComparableValue,
        ComparableValue,
      ];
      const compacted = compactConflictValues(items);
      if (!compacted) continue;
      for (const index of [0, 1, 2] as const) {
        output[index].push({ index: itemIndex, value: compacted[index] });
      }
    }
    return output;
  }

  if (values.every(isRecord)) {
    const records = values as [
      Record<string, unknown>,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    const keys = [...new Set(records.flatMap((value) => Object.keys(value)))].filter(
      (key) => key !== 'key'
    );
    const output: [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>] = [
      {},
      {},
      {},
    ];
    for (const key of keys) {
      const items = records.map((value) => (Object.hasOwn(value, key) ? value[key] : absent)) as [
        ComparableValue,
        ComparableValue,
        ComparableValue,
      ];
      const compacted = compactConflictValues(items);
      if (!compacted) continue;
      for (const index of [0, 1, 2] as const) output[index][key] = compacted[index];
    }
    for (const index of [0, 1, 2] as const) {
      if (typeof records[index].key === 'string') {
        output[index] = { key: records[index].key, ...output[index] };
      }
    }
    return output;
  }

  return values.map((value) => (value === absent ? '(not present)' : value)) as [
    unknown,
    unknown,
    unknown,
  ];
}

function summarizeFocusedValue(
  value: WorkspaceReconciliationValue,
  focusedValue: unknown
): { path: string; value: string } {
  if (!value.present) return { path: '', value: 'Deleted' };
  const path: string[] = [];
  let current = focusedValue;
  while (true) {
    if (Array.isArray(current)) {
      if (current.length !== 1) {
        return { path: path.join(' / '), value: `${current.length} changed items` };
      }
      current = current[0];
      continue;
    }
    if (isRecord(current)) {
      if (typeof current.key === 'string') path.push(current.key);
      if (typeof current.index === 'number' && Object.hasOwn(current, 'value')) {
        path.push(`Item ${current.index + 1}`);
        current = current.value;
        continue;
      }
      const entries = Object.entries(current).filter(([key]) => key !== 'key');
      if (entries.length !== 1) {
        return { path: path.join(' / '), value: `${entries.length} changed fields` };
      }
      const [key, next] = entries[0]!;
      if (key !== 'children' && key !== 'slots') path.push(key);
      current = next;
      continue;
    }
    return {
      path: path.join(' / '),
      value: current === null ? 'Empty' : String(current),
    };
  }
}

function summarizeSchemaValue(value: WorkspaceReconciliationValue) {
  if (!value.present || !isRecord(value.value)) return { path: 'Schema', value: 'No bound Schema' };
  const binding = Array.isArray(value.value.bindings) ? value.value.bindings[0] : null;
  const definition = isRecord(value.value.definition) ? value.value.definition : null;
  const name =
    (definition && typeof definition.name === 'string' ? definition.name : null) ??
    (isRecord(binding) && typeof binding.schemaName === 'string' ? binding.schemaName : null) ??
    'Bound Schema';
  const version = isRecord(binding) && typeof binding.version === 'string' ? binding.version : null;
  return { path: 'Schema contract', value: version ? `${name} · ${version}` : name };
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
  const resolvedCount = Object.keys(choices).length;

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Structured Workspace conflicts</legend>
      {preparation.conflicts.map((conflict, index) => {
        const focusedValues = compactConflictValues([
          conflict.base.present ? conflict.base.value : absent,
          conflict.ours.present ? conflict.ours.value : absent,
          conflict.theirs.present ? conflict.theirs.value : absent,
        ]) ?? [conflict.base.value, conflict.ours.value, conflict.theirs.value];
        const summaries =
          conflict.scope === 'schema'
            ? [
                summarizeSchemaValue(conflict.base),
                summarizeSchemaValue(conflict.ours),
                summarizeSchemaValue(conflict.theirs),
              ]
            : [
                summarizeFocusedValue(conflict.base, focusedValues[0]),
                summarizeFocusedValue(conflict.ours, focusedValues[1]),
                summarizeFocusedValue(conflict.theirs, focusedValues[2]),
              ];
        const focusedPath = summaries.find((summary) => summary.path)?.path ?? conflict.path;
        return (
          <section
            aria-label={`Conflict ${index + 1}: ${conflict.path}`}
            className="overflow-hidden rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm"
            key={conflict.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--status-warning-muted)] text-xs font-bold text-[var(--status-warning)]">
                  {index + 1}
                </span>
                <code className="truncate text-xs font-semibold text-[var(--text-primary)]">
                  {focusedPath}
                </code>
              </div>
              <span className="rounded-full border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                {conflict.kind} conflict
              </span>
            </div>
            <div className="grid gap-3 p-3 lg:grid-cols-3">
              {(
                [
                  {
                    action: 'Restore base value',
                    choice: 'base',
                    icon: History,
                    label: 'Base',
                    summary: summaries[0],
                  },
                  {
                    action: 'Keep my value',
                    choice: 'ours',
                    icon: UserRound,
                    label: 'Your Draft',
                    summary: summaries[1],
                  },
                  {
                    action: 'Use branch value',
                    choice: 'theirs',
                    icon: GitBranch,
                    label: 'Latest branch',
                    summary: summaries[2],
                  },
                ] as const
              ).map(({ action, choice, icon: Icon, label, summary }) => {
                const selected = choices[conflict.id] === choice;
                return (
                  <div
                    className={cn(
                      'flex min-w-0 flex-col overflow-hidden rounded-lg border bg-[var(--surface-panel)] transition-all',
                      selected
                        ? 'border-[var(--color-brand)] bg-[var(--status-info-muted)] shadow-sm'
                        : 'border-[var(--stroke-divider)] hover:border-[var(--stroke-strong)]'
                    )}
                    data-selected={selected ? 'true' : 'false'}
                    key={choice}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3 py-2.5">
                      <span className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                        <span
                          className={cn(
                            'flex size-6 items-center justify-center rounded-md bg-[var(--surface-card)] text-[var(--text-tertiary)]',
                            selected && 'bg-[var(--color-brand)] text-[var(--on-accent)]'
                          )}
                        >
                          <Icon aria-hidden="true" className="size-3.5" />
                        </span>
                        {label}
                      </span>
                      {selected ? (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-brand)]">
                          <Check aria-hidden="true" className="size-3.5" /> Selected
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-h-14 flex-1 items-center bg-[var(--surface-card)] px-3 py-2.5">
                      <p
                        className="line-clamp-2 text-sm font-medium leading-5 text-[var(--text-primary)]"
                        title={summary.value}
                      >
                        {summary.value}
                      </p>
                    </div>
                    <div className="border-t border-[var(--stroke-divider)] p-2.5">
                      <Button
                        aria-pressed={selected}
                        className="w-full"
                        disabled={disabled}
                        onClick={() =>
                          setChoices((current) => ({ ...current, [conflict.id]: choice }))
                        }
                        size="sm"
                        type="button"
                        variant={selected ? 'default' : 'outline'}
                      >
                        {selected ? <Check aria-hidden="true" className="size-3.5" /> : null}
                        {action}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
        <div className="min-w-48 flex-1">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-[var(--text-primary)]">Resolution progress</span>
            <span className="text-[var(--text-tertiary)]">
              {resolvedCount} of {preparation.conflicts.length}
            </span>
          </div>
          <div
            aria-label={`${resolvedCount} of ${preparation.conflicts.length} conflicts resolved`}
            aria-valuemax={preparation.conflicts.length}
            aria-valuemin={0}
            aria-valuenow={resolvedCount}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--stroke-divider)]"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-[var(--color-brand)] transition-[width]"
              style={{
                width: `${preparation.conflicts.length ? (resolvedCount / preparation.conflicts.length) * 100 : 100}%`,
              }}
            />
          </div>
          {!complete ? (
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
              Choose one result for every conflict before applying.
            </p>
          ) : (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-[var(--status-success)]">
              <Check aria-hidden="true" className="size-3.5" /> All conflicts are resolved.
            </p>
          )}
        </div>
        <Button
          disabled={disabled || !complete}
          onClick={() =>
            onResolve(
              preparation.conflicts.map((conflict) => ({
                conflict_id: conflict.id,
                choice: choices[conflict.id]!,
              }))
            )
          }
          type="button"
        >
          <Check aria-hidden="true" className="size-4" />
          Validate and apply resolutions
        </Button>
      </div>
    </fieldset>
  );
}
