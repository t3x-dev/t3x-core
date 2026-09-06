'use client';
import type { StudioPreview } from '@t3x-dev/api-client';
import { Box, LockKeyhole } from 'lucide-react';
import { StateValueReader } from '@/components/project/StateValueReader';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function StudioDefinitionPreview({
  preview,
  xray,
}: {
  preview: StudioPreview;
  xray: boolean;
}) {
  const nodes = record(preview.schema.nodes);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Definition preview</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Compiled structure · no execution results
          </p>
        </div>
        <span className="rounded bg-[var(--status-info-muted)] px-2 py-1 font-mono text-[10px] text-[var(--status-info)]  ">
          T3X
        </span>
      </div>
      <div className="divide-y divide-[var(--stroke-divider)] rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)]">
        {Object.entries(nodes).map(([path, value]) => {
          const node = record(value);
          const slots = record(node.slots);
          const required = Array.isArray(node.requiredSlots) ? node.requiredSlots : [];
          return (
            <section key={path} className="p-4" aria-label={`Definition ${path}`}>
              <h4 className="flex items-center gap-2 font-mono text-sm font-semibold">
                <Box className="size-4 text-[var(--status-info)]" />
                {path}
              </h4>
              {typeof node.description === 'string' ? (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{node.description}</p>
              ) : null}
              {Object.keys(slots).length ? (
                <dl className="mt-3 divide-y divide-[var(--stroke-divider)]">
                  {Object.entries(slots).map(([name, definition]) => {
                    const slot = record(definition);
                    const locked = required.includes(name) || slot.required === true;
                    return (
                      <div
                        key={name}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 py-2 text-xs"
                      >
                        <dt className="break-words font-medium">
                          {name}
                          {locked ? (
                            <span className="ml-2 inline-flex items-center gap-1 text-[var(--text-tertiary)]">
                              <LockKeyhole className="size-3" />
                              Required
                            </span>
                          ) : null}
                          {typeof slot.description === 'string' ? (
                            <p className="mt-1 font-normal text-[var(--text-secondary)]">
                              {slot.description}
                            </p>
                          ) : null}
                        </dt>
                        <dd className="font-mono text-[var(--status-info)]">
                          {typeof slot.type === 'string' ? slot.type : 'defined'}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ) : null}
              {xray ? (
                <details className="mt-3 rounded bg-[var(--surface-panel)] p-3 text-xs">
                  <summary className="cursor-pointer font-mono text-[var(--status-info)]">
                    Definition & source
                  </summary>
                  <StateValueReader
                    value={{
                      definition: node,
                      source: preview.origins[path] ?? 'No origin declared',
                    }}
                  />
                </details>
              ) : null}
            </section>
          );
        })}
        {!Object.keys(nodes).length ? (
          <p className="p-4 text-sm text-[var(--text-secondary)]">
            This definition declares no nodes.
          </p>
        ) : null}
      </div>
      {preview.renderPlan.length ? (
        <details className="text-xs text-[var(--text-secondary)]">
          <summary className="cursor-pointer">
            Module rendering order · {preview.renderPlan.length}
          </summary>
          <div className="mt-2">
            <StateValueReader value={preview.renderPlan} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
export function StudioChanges({
  changes,
}: {
  changes: NonNullable<StudioPreview['workspace']>['changes'];
}) {
  return changes.length ? (
    <ul className="divide-y divide-[var(--stroke-divider)]">
      {changes.map((change, index) => (
        <li key={`${change.path}:${index}`} className="py-3 text-xs">
          <div className="flex gap-2">
            <span className="font-mono text-[var(--status-info)]">{change.kind}</span>
            <span className="break-all font-mono">{change.path}</span>
          </div>
          <p className="mt-1 text-[var(--text-secondary)]">{change.summary}</p>
        </li>
      ))}
    </ul>
  ) : (
    <p className="py-3 text-sm text-[var(--text-secondary)]">No definition changes.</p>
  );
}
