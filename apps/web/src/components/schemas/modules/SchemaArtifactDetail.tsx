'use client';

import { dump } from 'js-yaml';
import { AlertTriangle, Ban, Check, CheckCircle2, CircleDot, Info } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { findSchemaArtifactInstance } from '@/data/schemaArtifactInstances';
import type { SchemaArtifactInstance, SchemaArtifactPreview } from '@/types/schemaModules';
import { SchemaArtifactIcon } from './SchemaArtifactIcon';

type ModuleDetailView = 'rendered' | 'yaml' | 'guide';

const MODULE_VIEWS: Array<{ id: ModuleDetailView; label: string }> = [
  { id: 'rendered', label: 'Rendered' },
  { id: 'yaml', label: 'YAML' },
  { id: 'guide', label: 'Guide' },
];

type FieldTone = 'blue' | 'violet' | 'teal' | 'indigo' | 'positive' | 'danger' | 'warning';

const NEUTRAL_FIELD_TONES: FieldTone[] = ['blue', 'violet', 'teal', 'indigo'];

const POSITIVE_FIELDS = new Set(['allowed', 'evidence']);
const DANGER_FIELDS = new Set([
  'abuse_cases',
  'denied',
  'errors',
  'failure_modes',
  'prohibited',
  'redactions',
  'risks',
  'stop_conditions',
  'threats',
]);
const WARNING_FIELDS = new Set([
  'approval_required',
  'approvals',
  'compatibility',
  'constraints',
  'energy_budget',
  'fallback_access',
  'fallbacks',
  'privacy_constraints',
  'quality_budgets',
  'release_gates',
  'restore_policy',
  'retention',
  'rollback',
  'thresholds',
]);

const FIELD_TONE_STYLES: Record<FieldTone, { card: string; icon: string; marker: string }> = {
  blue: {
    card: 'border-[color-mix(in_srgb,var(--accent-commit)_24%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-commit)_5%,var(--surface-card))]',
    icon: 'text-[var(--accent-commit)]',
    marker: 'bg-[var(--accent-commit)]',
  },
  violet: {
    card: 'border-[color-mix(in_srgb,var(--accent-extract)_24%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-extract)_5%,var(--surface-card))]',
    icon: 'text-[var(--accent-extract)]',
    marker: 'bg-[var(--accent-extract)]',
  },
  teal: {
    card: 'border-[color-mix(in_srgb,var(--accent-leaf)_24%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-leaf)_5%,var(--surface-card))]',
    icon: 'text-[var(--accent-leaf)]',
    marker: 'bg-[var(--accent-leaf)]',
  },
  indigo: {
    card: 'border-[color-mix(in_srgb,var(--accent-conversation)_24%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-conversation)_5%,var(--surface-card))]',
    icon: 'text-[var(--accent-conversation)]',
    marker: 'bg-[var(--accent-conversation)]',
  },
  positive: {
    card: 'border-[var(--status-success)]/25 bg-[var(--status-success-muted)]',
    icon: 'text-[var(--status-success)]',
    marker: 'bg-[var(--status-success)]',
  },
  danger: {
    card: 'border-[var(--status-error)]/25 bg-[var(--status-error-muted)]',
    icon: 'text-[var(--status-error)]',
    marker: 'bg-[var(--status-error)]',
  },
  warning: {
    card: 'border-[var(--status-warning)]/25 bg-[var(--status-warning-muted)]',
    icon: 'text-[var(--status-warning)]',
    marker: 'bg-[var(--status-warning)]',
  },
};

export function SchemaArtifactDetail({ artifact }: { artifact: SchemaArtifactPreview }) {
  const instance = findSchemaArtifactInstance(artifact);
  return <ModuleArtifactDetail artifact={artifact} instance={instance} />;
}

function ModuleArtifactDetail({
  artifact,
  instance,
}: {
  artifact: SchemaArtifactPreview;
  instance: SchemaArtifactInstance;
}) {
  const [view, setView] = useState<ModuleDetailView>('rendered');
  const yaml = dump(instance.value, { lineWidth: 100, noRefs: true, sortKeys: false }).trimEnd();
  const panelId = `${artifact.canonicalName.replaceAll('/', '-').replaceAll('@', '-')}-module-view`;

  function adjacentView(current: ModuleDetailView, direction: -1 | 1): ModuleDetailView {
    const currentIndex = MODULE_VIEWS.findIndex((candidate) => candidate.id === current);
    const nextIndex = (currentIndex + direction + MODULE_VIEWS.length) % MODULE_VIEWS.length;
    return MODULE_VIEWS[nextIndex]?.id ?? 'rendered';
  }

  return (
    <section
      aria-label={`${artifact.title} details`}
      className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
    >
      <ArtifactHeader artifact={artifact} />
      <div className="p-3">
        <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm">
          <header className="flex flex-col gap-3 border-b border-[var(--stroke-divider)] px-4 py-3 min-[561px]:flex-row min-[561px]:items-start min-[561px]:justify-between">
            <SectionHeading index="1" title="Instance">
              See what this Module contributes, then inspect its exact structure when needed.
            </SectionHeading>
            <div
              aria-label={`${artifact.title} instance views`}
              className="flex w-full rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-0.5 min-[561px]:w-auto"
              role="tablist"
            >
              {MODULE_VIEWS.map((item) => (
                <button
                  aria-controls={`${panelId}-panel`}
                  aria-selected={view === item.id}
                  className={`h-7 flex-1 rounded-[5px] px-3 text-[10px] font-semibold transition-colors min-[561px]:flex-none ${view === item.id ? 'bg-[var(--surface-card)] text-[var(--accent-commit)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                  id={`${panelId}-${item.id}-tab`}
                  key={item.id}
                  onClick={() => setView(item.id)}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    const nextView = adjacentView(item.id, event.key === 'ArrowRight' ? 1 : -1);
                    setView(nextView);
                    const tabs = event.currentTarget.parentElement?.querySelectorAll('button');
                    tabs?.[
                      MODULE_VIEWS.findIndex((candidate) => candidate.id === nextView)
                    ]?.focus();
                  }}
                  role="tab"
                  tabIndex={view === item.id ? 0 : -1}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          <div aria-labelledby={`${panelId}-${view}-tab`} id={`${panelId}-panel`} role="tabpanel">
            {view === 'rendered' ? (
              <ModuleRenderedView artifact={artifact} instance={instance} />
            ) : null}
            {view === 'yaml' ? <ModuleYamlView yaml={yaml} /> : null}
            {view === 'guide' ? <ModuleGuideView artifact={artifact} instance={instance} /> : null}
          </div>

          <p className="flex items-start gap-2 border-t border-[var(--stroke-divider)] px-4 py-2.5 text-[10px] leading-4 text-[var(--text-secondary)]">
            <Info
              aria-hidden="true"
              className="mt-0.5 size-3.5 flex-none text-[var(--accent-commit)]"
            />
            <span>
              <strong className="text-[var(--text-primary)]">Representative example.</strong>{' '}
              Selecting this Module does not copy the sample into project data.
            </span>
          </p>
        </section>
      </div>
    </section>
  );
}

function ModuleRenderedView({
  artifact,
  instance,
}: {
  artifact: SchemaArtifactPreview;
  instance: SchemaArtifactInstance;
}) {
  const rootEntries = Object.entries(instance.value);
  const singleRoot = rootEntries.length === 1 ? rootEntries[0] : undefined;
  const rootKey = singleRoot?.[0] ?? artifact.title;
  const rootValue: unknown = singleRoot?.[1];
  const fields: Array<[string, unknown]> =
    singleRoot && isRecord(rootValue) ? Object.entries(rootValue) : rootEntries;

  return (
    <div className="min-h-[320px] bg-[var(--surface-panel)] p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
            {humanize(rootKey)}
          </h4>
          <p className="mt-1 text-[10px] leading-4 text-[var(--text-secondary)]">
            {artifact.description}
          </p>
        </div>
        <span className="flex flex-none items-center gap-1.5 text-[9px] text-[var(--text-tertiary)]">
          <span className="size-1.5 rounded-full bg-[var(--accent-commit)]" />
          Sample instance
        </span>
      </div>
      <div className="grid gap-3 min-[641px]:grid-cols-2">
        {fields.map(([field, value], index) => (
          <RenderedField
            field={field}
            key={field}
            position={index}
            value={value}
            wide={fields.length === 1 || (fields.length % 2 === 1 && index === fields.length - 1)}
          />
        ))}
      </div>
    </div>
  );
}

function RenderedField({
  field,
  position,
  value,
  wide,
}: {
  field: string;
  position: number;
  value: unknown;
  wide: boolean;
}) {
  const tone = fieldTone(field, position);
  const styles = FIELD_TONE_STYLES[tone];
  const Icon =
    tone === 'positive'
      ? CheckCircle2
      : tone === 'danger'
        ? Ban
        : tone === 'warning'
          ? AlertTriangle
          : CircleDot;

  return (
    <section
      className={`rounded-[var(--radius-md)] border p-3 ${styles.card} ${wide ? 'min-[641px]:col-span-2' : ''}`}
      data-tone={tone}
    >
      <h5
        className={`flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.06em] ${styles.icon}`}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {humanize(field)}
      </h5>
      {Array.isArray(value) ? (
        <ul className="mt-2.5 grid gap-2 min-[721px]:grid-cols-2">
          {value.map((item) => (
            <li
              className="grid grid-cols-[6px_minmax(0,1fr)] items-start gap-2 text-[10px] leading-4 text-[var(--text-secondary)]"
              key={`${field}-${formatRenderedValue(item)}`}
            >
              <span
                aria-hidden="true"
                className={`mt-[5px] size-1.5 rounded-full ${styles.marker}`}
              />
              <span>{formatRenderedValue(item)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[10px] leading-4 text-[var(--text-secondary)]">
          {formatRenderedValue(value)}
        </p>
      )}
    </section>
  );
}

function ModuleYamlView({ yaml }: { yaml: string }) {
  return (
    <pre className="min-h-[320px] overflow-auto bg-[var(--surface-panel)] p-4 font-mono text-[11px] leading-5 text-[var(--text-primary)]">
      <code>{yaml}</code>
    </pre>
  );
}

function ModuleGuideView({
  artifact,
  instance,
}: {
  artifact: SchemaArtifactPreview;
  instance: SchemaArtifactInstance;
}) {
  return (
    <div className="grid min-h-[320px] items-start gap-3 bg-[var(--surface-panel)] p-4 min-[821px]:grid-cols-[minmax(0,1.12fr)_minmax(270px,0.88fr)]">
      <ModuleUseCases instance={instance} />
      <ModuleRules artifact={artifact} />
    </div>
  );
}

function ModuleUseCases({ instance }: { instance: SchemaArtifactInstance }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)]">
      <header className="border-b border-[var(--stroke-divider)] px-4 py-3">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-primary)]">
          Where to use it
        </h4>
        <p className="mt-1 text-[9px] leading-4 text-[var(--text-secondary)]">
          Choose this Module when its contribution should be explicit and reviewable.
        </p>
      </header>
      <ul className="divide-y divide-[var(--stroke-divider)] px-3">
        {instance.useCases.map((useCase) => (
          <li className="flex gap-2.5 py-3" key={useCase.title}>
            <span className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-md bg-[var(--status-success-muted)] text-[var(--status-success)]">
              <Check aria-hidden="true" className="size-3.5" />
            </span>
            <div>
              <h5 className="text-[10px] font-semibold text-[var(--text-primary)]">
                {useCase.title}
              </h5>
              <p className="mt-0.5 text-[9px] leading-4 text-[var(--text-secondary)]">
                {useCase.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ModuleRules({ artifact }: { artifact: SchemaArtifactPreview }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)]">
      <header className="border-b border-[var(--stroke-divider)] px-4 py-3">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.07em] text-[var(--text-primary)]">
          Rules
        </h4>
        <p className="mt-1 text-[9px] leading-4 text-[var(--text-secondary)]">
          Composition constraints and ownership boundaries.
        </p>
      </header>
      <dl className="divide-y divide-[var(--stroke-divider)] px-3">
        <ModuleRule label="Provides">
          <InlineValues values={artifact.provides} />
        </ModuleRule>
        <ModuleRule label="Requires">
          {artifact.requires.length > 0 ? (
            <InlineValues values={artifact.requires} />
          ) : (
            'No additional capabilities'
          )}
        </ModuleRule>
        <ModuleRule label="Placement">
          <InlineValues values={[artifact.placement]} />
        </ModuleRule>
        <ModuleRule label="Owned paths">
          <InlineValues values={artifact.nodePaths} />
        </ModuleRule>
      </dl>
      <div className="m-3 rounded-md border border-[color-mix(in_srgb,var(--accent-commit)_28%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-commit)_6%,var(--surface-card))] p-3 text-[9px] leading-4 text-[var(--text-secondary)]">
        <strong className="text-[var(--text-primary)]">Gap behavior</strong>
        <br />
        Fields not supplied by Source remain gaps. Gaps do not prevent Commit by default.
      </div>
    </section>
  );
}

function SectionHeading({
  children,
  index,
  title,
}: {
  children: string;
  index: string;
  title: string;
}) {
  return (
    <div>
      <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--text-primary)]">
        <span className="flex size-5 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent-commit)_10%,transparent)] text-[10px] text-[var(--accent-commit)]">
          {index}
        </span>
        {title}
      </h4>
      <p className="mt-1 pl-7 text-[10px] leading-4 text-[var(--text-secondary)]">{children}</p>
    </div>
  );
}

function ModuleRule({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="grid gap-1.5 py-3 min-[481px]:grid-cols-[88px_minmax(0,1fr)] min-[481px]:gap-3">
      <dt className="text-[9px] font-bold uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className="min-w-0 text-[10px] leading-4 text-[var(--text-secondary)]">{children}</dd>
    </div>
  );
}

function InlineValues({ values }: { values: string[] }) {
  return (
    <>
      {values.map((value, index) => (
        <span key={value}>
          {index > 0 ? ', ' : null}
          <code className="rounded bg-[var(--hover-bg)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-primary)]">
            {value}
          </code>
        </span>
      ))}
    </>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatRenderedValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return 'Not set in this sample';
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${humanize(key)}: ${formatRenderedValue(nestedValue)}`)
      .join(' · ');
  }
  return String(value);
}

function fieldTone(field: string, position: number): FieldTone {
  if (POSITIVE_FIELDS.has(field)) return 'positive';
  if (DANGER_FIELDS.has(field)) return 'danger';
  if (WARNING_FIELDS.has(field)) return 'warning';
  return NEUTRAL_FIELD_TONES[position % NEUTRAL_FIELD_TONES.length] ?? 'blue';
}

function ArtifactHeader({ artifact }: { artifact: SchemaArtifactPreview }) {
  return (
    <header className="flex items-start gap-3 border-b border-[var(--stroke-divider)] p-4">
      <SchemaArtifactIcon artifact={artifact} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{artifact.title}</h3>
          <Badge variant={artifact.kind === 'core' ? 'commit' : 'outline'}>{artifact.kind}</Badge>
          <Badge variant="outline">{familyLabel(artifact.family)}</Badge>
          <Badge variant="success">{artifact.status}</Badge>
        </div>
        <p className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">
          {artifact.canonicalName}@{artifact.version}
        </p>
        <p className="mt-2 max-w-[760px] text-[13px] leading-5 text-[var(--text-secondary)]">
          {artifact.description}
        </p>
      </div>
    </header>
  );
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function familyLabel(family: SchemaArtifactPreview['family']): string {
  if (family === 'esphome-device') return 'ESPHome Device';
  return family === 'prd' ? 'PRD' : family[0].toUpperCase() + family.slice(1);
}
