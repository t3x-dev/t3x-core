'use client';
import type { SchemaEvolutionImpact, StudioPreview } from '@t3x-dev/api-client';
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
export function StudioChecks({ preview }: { preview: StudioPreview }) {
  const passed =
    preview.report.valid && preview.adoption.allowed && preview.impact?.canAdopt !== false;
  const layers = preview.report.layers ?? [];
  const layerIssues = new Set(
    layers.flatMap((layer) => layer.issues.map((issue) => issue.message))
  );
  return (
    <section aria-label="Schema checks" className="space-y-3 text-xs">
      <h3 className="text-sm font-medium">Schema checks</h3>
      <p>{passed ? 'All blocking checks passed' : 'Changes require attention'}</p>
      {!preview.adoption.allowed && preview.adoption.reason ? (
        <p>{preview.adoption.reason}</p>
      ) : null}
      {layers.map((layer) => (
        <div key={layer.id} className="space-y-2 border-t border-[var(--stroke-divider)] pt-3">
          <div className="flex items-center justify-between gap-3 font-medium">
            <span>{layer.label}</span>
            <span
              className={
                layer.status === 'passed'
                  ? 'text-[var(--status-success)]'
                  : 'text-[var(--status-warning)]'
              }
            >
              {layer.status === 'not_run'
                ? 'Not run'
                : layer.status === 'passed'
                  ? 'Passed'
                  : layer.status === 'warning'
                    ? 'Warning'
                    : 'Failed'}
            </span>
          </div>
          {layer.summary ? <p>{layer.summary}</p> : null}
          {layer.issues.map((issue, index) => (
            <p key={`${issue.code}-${index}`}>{issue.message}</p>
          ))}
        </div>
      ))}
      {preview.report.issues
        .filter((issue) => !layerIssues.has(issue.message))
        .map((issue, index) => (
          <p key={`${issue.code}-${index}`}>{issue.message}</p>
        ))}
    </section>
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

const IMPACT_LABELS = {
  safe_addition: 'Safe addition',
  safe_change: 'Compatible change',
  needs_input: 'Needs input',
  needs_mapping: 'Needs mapping',
  blocked: 'Blocked',
};

export function StudioImpactPreview({ impact }: { impact: SchemaEvolutionImpact | null }) {
  if (!impact)
    return (
      <p className="py-3 text-xs text-[var(--text-secondary)]">
        Select a Workspace to preview content impact.
      </p>
    );
  return (
    <section aria-label="Schema content impact" className="min-w-0 space-y-3 text-xs">
      <output className="block font-medium">
        {impact.status === 'safe'
          ? 'No new content blockers'
          : impact.status === 'needs_input'
            ? 'New required input — prepare content after adoption'
            : impact.status === 'needs_mapping'
              ? 'Mapping required before adoption or publication'
              : 'Content impact could not be approved'}
      </output>
      <p className="text-[var(--text-secondary)]">
        {impact.content.source === 'authoring_ledger'
          ? 'Current Draft content'
          : 'Workspace candidate content'}
        {impact.content.valid === null
          ? ' · not checked'
          : impact.content.ready
            ? ' · satisfies the candidate Schema'
            : ' · still needs review'}
      </p>
      {impact.items.length ? (
        <ul className="divide-y divide-[var(--stroke-divider)]">
          {impact.items.map((item, index) => (
            <li key={`${item.kind}:${item.code}:${item.path}:${index}`} className="space-y-1 py-3">
              <span
                className={
                  item.kind === 'safe_addition' || item.kind === 'safe_change'
                    ? 'text-[var(--status-success)]'
                    : 'text-[var(--status-warning)]'
                }
              >
                {IMPACT_LABELS[item.kind]}
              </span>
              <p className="break-all font-mono">{item.path}</p>
              <p className="text-[var(--text-secondary)]">{item.message}</p>
              {item.affectedPaths.length ? (
                <details>
                  <summary className="cursor-pointer">
                    Affected content · {item.affectedPaths.length}
                  </summary>
                  {item.affectedPaths.map((path) => (
                    <p className="mt-1 break-all font-mono" key={path}>
                      {path}
                    </p>
                  ))}
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>No content changes are required by this definition change.</p>
      )}
    </section>
  );
}
