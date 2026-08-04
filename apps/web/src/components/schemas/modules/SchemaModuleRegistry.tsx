'use client';

import { Check, Plus, Search, SlidersHorizontal, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSchemaArtifactRegistry } from '@/hooks/schemas/useSchemaArtifactRegistry';
import { useSchemaCompositionDraft } from '@/hooks/schemas/useSchemaCompositionDraft';
import type {
  SchemaArtifactPreview,
  SchemaCompositionDraft,
  SchemaCompositionWorkspaceContext,
  WorkspaceSchemaCompositionResult,
} from '@/types/schemaModules';
import { SchemaArtifactDetail } from './SchemaArtifactDetail';
import { SchemaArtifactIcon } from './SchemaArtifactIcon';
import { SchemaCompositionWorkbench } from './SchemaCompositionWorkbench';

export function SchemaModuleRegistry({
  nextVersion,
  workspace,
  registryArtifacts,
}: {
  nextVersion?: string;
  workspace?: SchemaCompositionWorkspaceContext;
  registryArtifacts?: SchemaArtifactPreview[];
}) {
  const registry = useSchemaArtifactRegistry(workspace?.projectId, registryArtifacts === undefined);
  const artifacts = registryArtifacts ?? registry.artifacts;
  const core =
    artifacts.find(
      (artifact) => artifact.kind === 'core' && artifact.canonicalName === 't3x/prd-core'
    ) ?? artifacts.find((artifact) => artifact.kind === 'core');
  const availableModules = artifacts.filter((artifact) => artifact.kind === 'module');
  const { publish, save } = useSchemaCompositionDraft();
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('All');
  const [selectedArtifactName, setSelectedArtifactName] = useState('');
  const selectedArtifact =
    artifacts.find((artifact) => artifact.canonicalName === selectedArtifactName) ?? core;
  const [compositionModules, setCompositionModules] = useState<SchemaArtifactPreview[]>([]);
  const [compositionRevision, setCompositionRevision] = useState(
    workspace?.composition?.revision ?? 0
  );
  const [workspaceRevision, setWorkspaceRevision] = useState(workspace?.workspaceRevision);
  const [savedSignature, setSavedSignature] = useState<string>();
  const artifactSignature = artifacts
    .map((artifact) => `${artifact.canonicalName}@${artifact.version}`)
    .join('|');
  const persistedCompositionSignature = workspace?.composition
    ? compositionSignature(modulesFromComposition(workspace.composition, availableModules))
    : undefined;

  useEffect(() => {
    if (!core) return;
    const persistedModules = modulesFromComposition(workspace?.composition, availableModules);
    setCompositionModules(persistedModules);
    setCompositionRevision(workspace?.composition?.revision ?? 0);
    setWorkspaceRevision(workspace?.workspaceRevision);
    setSavedSignature(persistedCompositionSignature);
    setSelectedArtifactName((current) =>
      artifacts.some((artifact) => artifact.canonicalName === current)
        ? current
        : core.canonicalName
    );
  }, [
    artifactSignature,
    persistedCompositionSignature,
    workspace?.composition?.revision,
    workspace?.workspaceId,
    workspace?.workspaceRevision,
  ]);
  const domains = ['All', ...new Set(availableModules.map((module) => module.domain))];
  const visibleModules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return availableModules.filter((module) => {
      const matchesDomain = domain === 'All' || module.domain === domain;
      const matchesQuery =
        !normalizedQuery ||
        `${module.title} ${module.description} ${module.canonicalName}`
          .toLowerCase()
          .includes(normalizedQuery);
      return matchesDomain && matchesQuery;
    });
  }, [availableModules, domain, query]);

  function toggleModule(module: SchemaArtifactPreview) {
    const isSelected = compositionModules.some(
      (item) => item.canonicalName === module.canonicalName
    );
    setCompositionModules(
      isSelected
        ? compositionModules.filter((item) => item.canonicalName !== module.canonicalName)
        : [...compositionModules, module]
    );
  }

  async function saveComposition(
    composition: SchemaCompositionDraft
  ): Promise<WorkspaceSchemaCompositionResult> {
    if (!workspace || workspaceRevision === undefined) {
      throw new Error('Select a persisted Workspace before saving this Composition draft.');
    }
    const saved = await save(
      workspace.projectId,
      workspace.workspaceId,
      composition,
      workspaceRevision
    );
    if (!saved.composition) {
      throw new Error('The saved Workspace did not return a Composition draft.');
    }
    const normalizedModules = modulesFromComposition(saved.composition, availableModules);
    setCompositionModules(normalizedModules);
    setCompositionRevision(saved.composition.revision);
    setWorkspaceRevision(saved.workspaceRevision);
    setSavedSignature(compositionSignature(normalizedModules));
    await workspace.onSaved?.(saved);
    return saved;
  }

  async function publishComposition(input: Parameters<typeof publish>[2]) {
    if (!workspace || compositionRevision < 1) {
      throw new Error('Save this Composition to a persisted Workspace before publishing it.');
    }
    const published = await publish(workspace.projectId, workspace.workspaceId, input);
    await workspace.onPublished?.(published);
    return published;
  }

  if (!core || !selectedArtifact) {
    return (
      <section
        aria-label="Schema Module Registry"
        className="mt-4 rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-8 text-center"
      >
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {registry.pending ? 'Loading YSchema Registry…' : 'YSchema Registry unavailable'}
        </p>
        {registry.error ? (
          <p className="mt-2 text-xs text-[var(--destructive)]">{registry.error}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className="mt-4 grid gap-4 min-[1181px]:grid-cols-[220px_minmax(0,1fr)_340px]"
      aria-label="Schema Module Registry"
    >
      <aside className="self-start rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 shadow-sm min-[1181px]:sticky min-[1181px]:top-4">
        <div className="flex items-center gap-2 px-1 py-2 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
          <SlidersHorizontal className="size-3.5" /> Artifact type
        </div>
        <button
          className={`mt-1 flex w-full items-center gap-2 rounded-[var(--radius-md)] border p-2.5 text-left transition-colors ${selectedArtifact.kind === 'core' ? 'border-[var(--accent-commit)] bg-[color-mix(in_srgb,var(--accent-commit)_8%,transparent)]' : 'border-[var(--stroke-divider)] hover:bg-[var(--hover-bg)]'}`}
          onClick={() => setSelectedArtifactName(core.canonicalName)}
          type="button"
        >
          <SchemaArtifactIcon artifact={core} />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-[var(--text-primary)]">
              PRD Core
            </span>
            <span className="block text-[10px] text-[var(--text-tertiary)]">Pinned foundation</span>
          </span>
        </button>
        <p className="mt-5 px-1 text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
          Domains
        </p>
        <div className="mt-2 space-y-0.5">
          {domains.map((item) => (
            <button
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12px] ${domain === item ? 'bg-[var(--active-bg)] font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'}`}
              key={item}
              onClick={() => setDomain(item)}
              type="button"
            >
              <span>{item}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">
                {item === 'All'
                  ? availableModules.length
                  : availableModules.filter((module) => module.domain === item).length}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-[var(--radius-md)] bg-[var(--surface-panel)] p-3 text-[11px] leading-5 text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">Core + Modules</strong>
          <br />
          Core owns invariants. Modules add domain structure through declared extension slots.
        </div>
      </aside>

      <main className="min-w-0">
        <div className="flex flex-col gap-3 min-[641px]:flex-row min-[641px]:items-center min-[641px]:justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
              PRD Modules{' '}
              <span className="font-normal text-[var(--text-tertiary)]">
                {visibleModules.length}
              </span>
            </h2>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
              Choose focused contracts, inspect their rules, then arrange the render order.
            </p>
          </div>
          <label className="flex h-9 min-w-[240px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 focus-within:border-[var(--accent-commit)] focus-within:ring-2 focus-within:ring-[var(--accent-commit)]/10">
            <Search aria-hidden="true" className="size-4 text-[var(--text-tertiary)]" />
            <span className="sr-only">Search Modules</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name or capability"
              value={query}
            />
          </label>
        </div>

        <div className="mt-3 grid gap-2 min-[761px]:grid-cols-2">
          {visibleModules.map((module) => {
            const isInComposition = compositionModules.some(
              (item) => item.canonicalName === module.canonicalName
            );
            const isActive = selectedArtifact.canonicalName === module.canonicalName;
            return (
              <article
                className={`group flex min-w-0 gap-3 rounded-[var(--radius-md)] border bg-[var(--surface-card)] p-3 shadow-sm transition-colors ${isActive ? 'border-[var(--accent-commit)]' : 'border-[var(--stroke-divider)] hover:border-[var(--stroke-strong)]'}`}
                key={module.canonicalName}
              >
                <button
                  aria-label={`Inspect ${module.title}`}
                  className="flex min-w-0 flex-1 gap-3 text-left"
                  onClick={() => setSelectedArtifactName(module.canonicalName)}
                  type="button"
                >
                  <SchemaArtifactIcon artifact={module} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">
                      {module.title}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-[var(--text-secondary)]">
                      {module.description}
                    </span>
                    <span className="mt-2 flex items-center gap-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                      <Badge variant="outline">{module.domain}</Badge>
                      <span>{module.version}</span>
                      <span>·</span>
                      <span>{module.usageCount.toLocaleString()} uses</span>
                      <span className="flex items-center gap-0.5">
                        <Star className="size-3" />
                        {module.starCount}
                      </span>
                    </span>
                  </span>
                </button>
                <Button
                  aria-label={
                    isInComposition
                      ? `Remove ${module.title} from composition`
                      : `Add ${module.title} to composition`
                  }
                  className="size-8 self-start px-0"
                  onClick={() => toggleModule(module)}
                  size="icon-sm"
                  type="button"
                  variant={isInComposition ? 'commit' : 'canvas-outline'}
                >
                  {isInComposition ? <Check className="size-4" /> : <Plus className="size-4" />}
                </Button>
              </article>
            );
          })}
        </div>
        {visibleModules.length === 0 ? (
          <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--stroke-strong)] p-10 text-center text-[12px] text-[var(--text-secondary)]">
            No Modules match this filter.
          </div>
        ) : null}
        <SchemaArtifactDetail key={selectedArtifact.canonicalName} artifact={selectedArtifact} />
      </main>

      <SchemaCompositionWorkbench
        compositionId={
          workspace?.composition?.id ??
          (workspace ? `composition:${workspace.workspaceId}` : 'webui-prd-composition')
        }
        compositionRevision={compositionRevision}
        core={core}
        dirty={savedSignature !== compositionSignature(compositionModules)}
        modules={compositionModules}
        onModulesChange={setCompositionModules}
        onPublish={workspaceRevision === undefined ? undefined : publishComposition}
        onSave={workspaceRevision === undefined ? undefined : saveComposition}
        nextVersion={nextVersion}
        workspaceTitle={workspace?.workspaceTitle}
        projectId={workspace?.projectId}
      />
    </section>
  );
}

function modulesFromComposition(
  composition: SchemaCompositionDraft | undefined,
  availableModules: SchemaArtifactPreview[]
): SchemaArtifactPreview[] {
  if (!composition) return availableModules.slice(0, 6);
  const artifactsByKey = new Map(
    availableModules.map((artifact) => [`${artifact.canonicalName}@${artifact.version}`, artifact])
  );
  return [...composition.modules]
    .sort((left, right) => left.order - right.order)
    .flatMap((reference) => {
      const artifact = artifactsByKey.get(`${reference.canonicalName}@${reference.version}`);
      return artifact ? [artifact] : [];
    });
}

function compositionSignature(modules: SchemaArtifactPreview[]): string {
  return modules
    .map((module) => `${module.canonicalName}@${module.version}:${module.placement}`)
    .join('|');
}
