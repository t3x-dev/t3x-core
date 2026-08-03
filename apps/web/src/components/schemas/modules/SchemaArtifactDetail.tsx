'use client';

import { CheckCircle2, CircleDot, History, Layers3, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { SchemaArtifactDetailView, SchemaArtifactPreview } from '@/types/schemaModules';
import { SchemaArtifactIcon } from './SchemaArtifactIcon';

const VIEWS: Array<{ id: SchemaArtifactDetailView; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'rules', label: 'Rules' },
  { id: 'render', label: 'Render' },
  { id: 'versions', label: 'Versions' },
];

export function SchemaArtifactDetail({ artifact }: { artifact: SchemaArtifactPreview }) {
  const [view, setView] = useState<SchemaArtifactDetailView>('overview');
  return (
    <section className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)]">
      <header className="flex items-start gap-3 border-b border-[var(--stroke-divider)] p-4">
        <SchemaArtifactIcon artifact={artifact} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {artifact.title}
            </h3>
            <Badge variant={artifact.kind === 'core' ? 'commit' : 'outline'}>{artifact.kind}</Badge>
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
      <div
        className="flex gap-5 overflow-x-auto border-b border-[var(--stroke-divider)] px-4"
        role="tablist"
        aria-label={`${artifact.title} details`}
      >
        {VIEWS.map((item) => (
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
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
        Markdown outline
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
