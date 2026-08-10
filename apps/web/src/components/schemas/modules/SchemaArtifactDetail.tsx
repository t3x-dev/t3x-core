'use client';

import { dump } from 'js-yaml';
import {
  Check,
  CheckCircle2,
  CircleDot,
  Copy,
  History,
  Info,
  Layers3,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { findSchemaArtifactInstance } from '@/data/schemaArtifactInstances';
import type {
  SchemaArtifactDetailView,
  SchemaArtifactInstance,
  SchemaArtifactPreview,
} from '@/types/schemaModules';
import { SchemaArtifactIcon } from './SchemaArtifactIcon';

const CORE_VIEWS: Array<{ id: SchemaArtifactDetailView; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'rules', label: 'Rules' },
  { id: 'render', label: 'Render' },
  { id: 'versions', label: 'Versions' },
];

export function SchemaArtifactDetail({ artifact }: { artifact: SchemaArtifactPreview }) {
  const instance = findSchemaArtifactInstance(artifact);
  if (artifact.kind === 'module' && instance) {
    return <ModuleArtifactDetail artifact={artifact} instance={instance} />;
  }
  return <TabbedArtifactDetail artifact={artifact} />;
}

function ModuleArtifactDetail({
  artifact,
  instance,
}: {
  artifact: SchemaArtifactPreview;
  instance: SchemaArtifactInstance;
}) {
  return (
    <section
      aria-label={`${artifact.title} details`}
      className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
    >
      <ArtifactHeader artifact={artifact} />
      <div className="grid items-start gap-3 p-3 min-[821px]:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.9fr)]">
        <ModuleInstancePanel instance={instance} />
        <aside className="grid gap-3">
          <ModuleUseCases instance={instance} />
          <ModuleRules artifact={artifact} />
        </aside>
      </div>
    </section>
  );
}

function ModuleInstancePanel({ instance }: { instance: SchemaArtifactInstance }) {
  const [copied, setCopied] = useState(false);
  const yaml = dump(instance.value, { lineWidth: 100, noRefs: true, sortKeys: false }).trimEnd();

  async function copyYaml() {
    await navigator.clipboard.writeText(yaml);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm">
      <header className="flex flex-col gap-3 border-b border-[var(--stroke-divider)] px-4 py-3 min-[561px]:flex-row min-[561px]:items-start min-[561px]:justify-between">
        <SectionHeading index="1" title="YAML Instance">
          A concise example of the structure contributed by this Module.
        </SectionHeading>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
            <span className="size-1.5 rounded-full bg-[var(--accent-commit)]" />
            Sample · Not project data
          </span>
          <button
            aria-live="polite"
            className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2.5 text-[10px] font-semibold text-[var(--text-secondary)] hover:border-[var(--stroke-strong)] hover:text-[var(--text-primary)]"
            onClick={copyYaml}
            type="button"
          >
            {copied ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <Copy aria-hidden="true" className="size-3.5" />
            )}
            {copied ? 'Copied' : 'Copy YAML'}
          </button>
        </div>
      </header>
      <pre className="min-h-[320px] overflow-auto bg-[var(--surface-panel)] p-4 font-mono text-[11px] leading-5 text-[var(--text-primary)]">
        <code>{yaml}</code>
      </pre>
      <p className="flex items-start gap-2 border-t border-[color-mix(in_srgb,var(--accent-commit)_18%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-commit)_6%,var(--surface-card))] px-4 py-2.5 text-[10px] leading-4 text-[var(--text-secondary)]">
        <Info
          aria-hidden="true"
          className="mt-0.5 size-3.5 flex-none text-[var(--accent-commit)]"
        />
        Selecting this Module never copies the sample. Uncovered fields remain gaps.
      </p>
    </section>
  );
}

function ModuleUseCases({ instance }: { instance: SchemaArtifactInstance }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm">
      <header className="border-b border-[var(--stroke-divider)] px-4 py-3">
        <SectionHeading index="2" title="Where to use it">
          Use when this structure should be explicit before implementation.
        </SectionHeading>
      </header>
      <ul className="divide-y divide-[var(--stroke-divider)] px-3">
        {instance.useCases.map((useCase) => (
          <li className="flex gap-2.5 py-3" key={useCase}>
            <span className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent-leaf)_10%,transparent)] text-[var(--accent-leaf)]">
              <Check aria-hidden="true" className="size-3.5" />
            </span>
            <p className="text-[11px] leading-4 text-[var(--text-secondary)]">{useCase}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ModuleRules({ artifact }: { artifact: SchemaArtifactPreview }) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm">
      <header className="border-b border-[var(--stroke-divider)] px-4 py-3">
        <SectionHeading index="3" title="Rules">
          Composition constraints and gap behavior.
        </SectionHeading>
      </header>
      <dl className="divide-y divide-[var(--stroke-divider)] px-3">
        <ModuleRule label="Dependency">
          {artifact.requires.length > 0 ? (
            <span>
              Requires <InlineValues values={artifact.requires} />
            </span>
          ) : (
            'No additional capabilities'
          )}
        </ModuleRule>
        <ModuleRule label="Placement">
          <span>
            Added to <InlineValues values={[artifact.placement]} />
          </span>
        </ModuleRule>
      </dl>
      <div className="m-3 rounded-md border border-[color-mix(in_srgb,var(--accent-commit)_28%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-commit)_6%,var(--surface-card))] p-3 text-[10px] leading-4 text-[var(--text-secondary)]">
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

function TabbedArtifactDetail({ artifact }: { artifact: SchemaArtifactPreview }) {
  const [view, setView] = useState<SchemaArtifactDetailView>('overview');
  return (
    <section
      aria-label={`${artifact.title} details`}
      className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
    >
      <ArtifactHeader artifact={artifact} />
      <div
        aria-label={`${artifact.title} details`}
        className="flex gap-5 overflow-x-auto border-b border-[var(--stroke-divider)] px-4"
        role="tablist"
      >
        {CORE_VIEWS.map((item) => (
          <button
            aria-selected={view === item.id}
            className={`h-10 flex-none border-b-2 text-[12px] font-semibold transition-colors ${view === item.id ? 'border-[var(--accent-commit)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            key={item.id}
            onClick={() => setView(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-h-[180px] p-4">
        {view === 'overview' ? <ArtifactOverview artifact={artifact} /> : null}
        {view === 'rules' ? <ArtifactRules artifact={artifact} /> : null}
        {view === 'render' ? <ArtifactRender artifact={artifact} /> : null}
        {view === 'versions' ? <ArtifactVersions artifact={artifact} /> : null}
      </div>
    </section>
  );
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

function ArtifactOverview({ artifact }: { artifact: SchemaArtifactPreview }) {
  return (
    <div className="grid gap-3 min-[641px]:grid-cols-2">
      <DetailBlock icon={Layers3} label="Provides" values={artifact.provides} />
      <DetailBlock
        icon={CircleDot}
        label="Requires"
        values={artifact.requires.length ? artifact.requires : ['No dependencies']}
      />
      <DetailBlock icon={CheckCircle2} label="Placement" values={[artifact.placement]} />
      <DetailBlock icon={ShieldCheck} label="Owned paths" values={artifact.nodePaths} mono />
    </div>
  );
}

function ArtifactRules({ artifact }: { artifact: SchemaArtifactPreview }) {
  return (
    <div className="space-y-2">
      {artifact.rules.map((rule) => (
        <div
          className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--stroke-divider)] p-3"
          key={rule.id}
        >
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 size-4 flex-none text-[var(--accent-commit)]"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-[12px] font-semibold text-[var(--text-primary)]">
                {rule.id}
              </code>
              {rule.blocking ? <Badge variant="warning">blocking</Badge> : null}
            </div>
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
              {rule.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ArtifactRender({ artifact }: { artifact: SchemaArtifactPreview }) {
  const [defaultRenderer, ...alternateRenderers] = artifact.renderers;
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
        Default renderer
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="commit">{rendererLabel(defaultRenderer ?? 'markdown')}</Badge>
        {alternateRenderers.map((renderer) => (
          <Badge key={renderer} variant="outline">
            {rendererLabel(renderer)}
          </Badge>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[var(--text-secondary)]">
        {rendererDescription(artifact.family)}
      </p>
      <div className="mt-3 space-y-3 border-l-2 border-[var(--accent-commit)] pl-4">
        {artifact.nodePaths.map((path) => (
          <div key={path}>
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              ## {humanize(path)}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-[var(--text-tertiary)]">
              source: {artifact.canonicalName}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtifactVersions({ artifact }: { artifact: SchemaArtifactPreview }) {
  return (
    <div className="divide-y divide-[var(--stroke-divider)] rounded-[var(--radius-md)] border border-[var(--stroke-divider)]">
      {artifact.versions.map((version) => (
        <div className="flex items-center gap-3 px-3 py-2.5" key={version.version}>
          <History aria-hidden="true" className="size-4 text-[var(--text-tertiary)]" />
          <code className="text-[12px] font-semibold text-[var(--text-primary)]">
            {version.version}
          </code>
          <Badge variant={version.status === 'current' ? 'success' : 'outline'}>
            {version.status}
          </Badge>
          <span className="ml-auto text-[11px] text-[var(--text-tertiary)]">
            {version.updatedAt}
          </span>
        </div>
      ))}
    </div>
  );
}

function DetailBlock({
  icon: Icon,
  label,
  values,
  mono = false,
}: {
  icon: typeof Layers3;
  label: string;
  values: string[];
  mono?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--stroke-divider)] p-3">
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
        <Icon aria-hidden="true" className="size-3.5" /> {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            className={`rounded-md bg-[var(--hover-bg)] px-2 py-1 text-[11px] text-[var(--text-secondary)] ${mono ? 'font-mono' : ''}`}
            key={value}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function familyLabel(family: SchemaArtifactPreview['family']): string {
  if (family === 'esphome-device') return 'ESPHome Device';
  return family === 'prd' ? 'PRD' : family[0].toUpperCase() + family.slice(1);
}

function rendererLabel(renderer: string): string {
  return renderer.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rendererDescription(family: SchemaArtifactPreview['family']): string {
  if (family === 'skill') {
    return 'The primary renderer emits a Skill package with SKILL.md plus declared resources, scripts, and assets.';
  }
  if (family === 'prompt') {
    return 'The primary renderer compiles ordered messages and typed variables into portable prompt text.';
  }
  if (family === 'esphome-device') {
    return 'The primary renderer emits ESPHome YAML for local config validation and device compilation.';
  }
  return 'The primary renderer produces a human-readable Markdown contract with canonical YAML available for tooling.';
}
