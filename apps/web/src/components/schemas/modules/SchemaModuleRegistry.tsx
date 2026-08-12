'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Filter,
  GripVertical,
  Layers3,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSchemaArtifactRegistry } from '@/hooks/schemas/useSchemaArtifactRegistry';
import { useSchemaCompositionDraft } from '@/hooks/schemas/useSchemaCompositionDraft';
import { useSchemaCompositionPreview } from '@/hooks/schemas/useSchemaCompositionPreview';
import type {
  SchemaArtifactPreview,
  SchemaCompositionDraft,
  SchemaCompositionDraftV2,
  SchemaCompositionWorkspaceContext,
  YSchemaArtifactFamily,
} from '@/types/schemaModules';
import { SchemaArtifactDetail } from './SchemaArtifactDetail';
import { SchemaArtifactIcon } from './SchemaArtifactIcon';

type TagGroupId = 'main' | 'type' | 'domain' | 'version' | 'source' | 'other';

interface TagSection {
  id: string;
  label: string;
  tags: string[];
}

const TAG_GROUPS: Array<{ id: TagGroupId; label: string; prefixes: string[] }> = [
  { id: 'main', label: 'Main', prefixes: ['role', 'recommended', 'status'] },
  { id: 'type', label: 'Type', prefixes: ['type', 'contribution'] },
  { id: 'domain', label: 'Domain', prefixes: ['domain'] },
  { id: 'version', label: 'Version', prefixes: ['version'] },
  { id: 'source', label: 'Source', prefixes: ['source'] },
  { id: 'other', label: 'Other', prefixes: ['runtime', 'protocol', 'maturity', 'tag'] },
];

export function SchemaModuleRegistry({
  nextVersion = '1.0.0',
  initialArtifactName,
  initialArtifactVersion,
  workspace,
  registryArtifacts,
}: {
  nextVersion?: string;
  family?: YSchemaArtifactFamily;
  initialArtifactName?: string;
  initialArtifactVersion?: string;
  workspace?: SchemaCompositionWorkspaceContext;
  registryArtifacts?: SchemaArtifactPreview[];
}) {
  const registry = useSchemaArtifactRegistry(
    workspace?.projectId,
    undefined,
    registryArtifacts === undefined
  );
  const artifacts = useMemo(
    () =>
      (registryArtifacts ?? registry.artifacts)
        .map(withEffectiveTags)
        .sort(
          (left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title)
        ),
    [registry.artifacts, registryArtifacts]
  );
  const { apply, publish, save } = useSchemaCompositionDraft();
  const previewState = useSchemaCompositionPreview();
  const [nameQuery, setNameQuery] = useState('');
  const [activeTagGroup, setActiveTagGroup] = useState<TagGroupId>('main');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [selectedArtifactName, setSelectedArtifactName] = useState(initialArtifactName ?? '');
  const [compositionModules, setCompositionModules] = useState<SchemaArtifactPreview[]>([]);
  const [compositionRevision, setCompositionRevision] = useState(
    workspace?.composition?.revision ?? 0
  );
  const [workspaceRevision, setWorkspaceRevision] = useState(workspace?.workspaceRevision);
  const [savedSignature, setSavedSignature] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishPending, setPublishPending] = useState(false);
  const [publishTitle, setPublishTitle] = useState(
    `${workspace?.workspaceTitle ?? 'Composed'} Schema`
  );
  const [publishCanonicalName, setPublishCanonicalName] = useState(
    `projects/${workspace?.projectId ?? 'project'}/schema`
  );
  const [publishVersion, setPublishVersion] = useState(nextVersion);
  const [publishDescription, setPublishDescription] = useState('');
  const [publishTags, setPublishTags] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const artifactSignature = artifacts
    .map((artifact) => `${artifact.canonicalName}@${artifact.version}`)
    .join('|');
  const persistedSignature = workspace?.composition
    ? compositionSignature(artifactsFromComposition(workspace.composition, artifacts))
    : undefined;

  useEffect(() => {
    const persisted = artifactsFromComposition(workspace?.composition, artifacts);
    setCompositionModules(persisted);
    setCompositionRevision(workspace?.composition?.revision ?? 0);
    setWorkspaceRevision(workspace?.workspaceRevision);
    setSavedSignature(persistedSignature);
    setSelectedArtifactName((current) =>
      artifacts.some((artifact) => artifact.canonicalName === current)
        ? current
        : (artifacts[0]?.canonicalName ?? '')
    );
  }, [artifactSignature, persistedSignature, workspace?.workspaceId, workspace?.workspaceRevision]);

  useEffect(() => {
    if (!initialArtifactName || selectedArtifactName !== initialArtifactName) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('module-detail')?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialArtifactName, selectedArtifactName]);

  const selectedArtifact =
    artifacts.find(
      (artifact) =>
        artifact.canonicalName === selectedArtifactName &&
        (!initialArtifactVersion || artifact.version === initialArtifactVersion)
    ) ??
    artifacts.find((artifact) => artifact.canonicalName === selectedArtifactName) ??
    artifacts[0];
  const tagSections = useMemo(
    () => buildTagSections(artifacts, activeTagGroup),
    [artifacts, activeTagGroup]
  );
  const visibleModules = useMemo(() => {
    const query = nameQuery.trim().toLowerCase();
    const selectedBySection = groupSelectedTags(selectedTags);
    return artifacts.filter((artifact) => {
      const nameMatches =
        !query ||
        artifact.title.toLowerCase().includes(query) ||
        artifact.canonicalName.toLowerCase().includes(query);
      if (!nameMatches) return false;
      const tags = new Set(artifact.tags ?? []);
      return [...selectedBySection.values()].every((sectionTags) =>
        sectionTags.some((tag) => tags.has(tag))
      );
    });
  }, [artifacts, nameQuery, selectedTags]);
  const draft = buildOpenComposition(
    workspace?.workspaceId ?? 'preview',
    compositionRevision,
    compositionModules
  );
  const dirty = savedSignature !== compositionSignature(compositionModules);

  function toggleTag(tag: string) {
    setSelectedTags((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function toggleModule(module: SchemaArtifactPreview) {
    previewState.reset();
    setFeedback(undefined);
    setCompositionModules((current) =>
      current.some((item) => item.canonicalName === module.canonicalName)
        ? current.filter((item) => item.canonicalName !== module.canonicalName)
        : isCoreModule(module)
          ? [module, ...current]
          : [...current, module]
    );
  }

  function moveModule(index: number, direction: -1 | 1) {
    previewState.reset();
    setCompositionModules((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [
        next[target] as SchemaArtifactPreview,
        next[index] as SchemaArtifactPreview,
      ];
      return next;
    });
  }

  function finishModuleDrag(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    previewState.reset();
    setFeedback(undefined);
    setCompositionModules((current) => {
      const from = current.findIndex((module) => artifactKey(module) === event.active.id);
      const to = current.findIndex((module) => artifactKey(module) === event.over?.id);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  }

  async function compileComposition() {
    const preview = await previewState.compile(draft, workspace?.projectId);
    if (preview)
      setFeedback(preview.report.valid ? 'Composition is valid.' : 'Review blocking issues.');
    return preview;
  }

  async function saveComposition() {
    if (!workspace || workspaceRevision === undefined) return;
    const saved = await save(workspace.projectId, workspace.workspaceId, draft, workspaceRevision);
    if (!saved.composition) throw new Error('The saved Workspace did not return a Composition.');
    const normalized = artifactsFromComposition(saved.composition, artifacts);
    setCompositionModules(normalized);
    setCompositionRevision(saved.composition.revision);
    setWorkspaceRevision(saved.workspaceRevision);
    setSavedSignature(compositionSignature(normalized));
    if (saved.preview) previewState.accept(saved.preview);
    setFeedback('Composition draft saved. No Commit was created.');
    await workspace.onSaved?.(saved);
  }

  async function applyComposition() {
    if (
      !workspace ||
      workspaceRevision === undefined ||
      compositionRevision < 1 ||
      !previewState.result?.report.valid
    ) {
      return;
    }
    const result = await apply(
      workspace.projectId,
      workspace.workspaceId,
      workspaceRevision,
      compositionRevision,
      previewState.result.compositionHash
    );
    setWorkspaceRevision(result.workspaceRevision);
    setFeedback('Verified Composition applied to this Workspace.');
    await workspace.onApplied?.(result);
  }

  async function publishSchemaVersion() {
    if (!workspace || !previewState.result?.report.valid || dirty || compositionRevision < 1)
      return;
    setPublishPending(true);
    setFeedback(undefined);
    try {
      const published = await publish(workspace.projectId, workspace.workspaceId, {
        compositionRevision,
        compositionHash: previewState.result.compositionHash,
        canonicalName: publishCanonicalName.trim(),
        version: publishVersion.trim(),
        title: publishTitle.trim(),
        ...(publishDescription.trim() ? { description: publishDescription.trim() } : {}),
        ...(releaseNotes.trim() ? { releaseNotes: releaseNotes.trim() } : {}),
        tags: publishTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setPublishOpen(false);
      setFeedback(`Published ${published.title} ${published.version} as an immutable Schema.`);
      await workspace.onPublished?.(published);
    } catch (cause) {
      setFeedback(
        cause instanceof Error ? cause.message : 'Schema version could not be published.'
      );
    } finally {
      setPublishPending(false);
    }
  }

  if (!selectedArtifact) {
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
      aria-label="Schema Module Registry"
      className="mt-4 grid gap-4 min-[1181px]:grid-cols-[270px_minmax(0,1fr)_350px]"
    >
      <aside className="self-start overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm min-[1181px]:sticky min-[1181px]:top-4">
        <div className="border-b border-[var(--stroke-divider)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Browse by tags</p>
              <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">HF-style discovery</p>
            </div>
            {selectedTags.size > 0 ? (
              <button
                className="text-[11px] font-medium text-[var(--accent-commit)] hover:underline"
                onClick={() => setSelectedTags(new Set())}
                type="button"
              >
                Clear all
              </button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label="Tag groups">
            {TAG_GROUPS.map((group) => (
              <button
                aria-selected={activeTagGroup === group.id}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${activeTagGroup === group.id ? 'bg-[var(--text-primary)] text-[var(--surface-card)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'}`}
                key={group.id}
                onClick={() => setActiveTagGroup(group.id)}
                role="tab"
                type="button"
              >
                {group.label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[calc(100vh-180px)] space-y-5 overflow-y-auto p-3">
          {tagSections.map((section) => {
            const expanded = expandedSections.has(section.id);
            const visible = expanded ? section.tags : section.tags.slice(0, 8);
            return (
              <section key={section.id} aria-labelledby={`tag-section-${section.id}`}>
                <div className="flex items-center justify-between">
                  <h3
                    id={`tag-section-${section.id}`}
                    className="text-[11px] font-semibold text-[var(--text-secondary)]"
                  >
                    {section.label}
                  </h3>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {section.tags.filter((tag) => selectedTags.has(tag)).length || ''}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {visible.map((tag) => (
                    <button
                      aria-pressed={selectedTags.has(tag)}
                      className={`rounded-[9px] border px-2.5 py-1.5 text-[11px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors ${selectedTags.has(tag) ? 'border-[var(--accent-commit)] bg-[color-mix(in_srgb,var(--accent-commit)_10%,var(--surface-card))] font-semibold text-[var(--text-primary)]' : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:border-[var(--stroke-strong)]'}`}
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      title={tag}
                      type="button"
                    >
                      {tagLabel(tag)}
                    </button>
                  ))}
                  {section.tags.length > 8 ? (
                    <button
                      className="flex items-center gap-1 rounded-[9px] border border-[var(--stroke-divider)] px-2.5 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
                      onClick={() =>
                        setExpandedSections((current) => {
                          const next = new Set(current);
                          if (next.has(section.id)) next.delete(section.id);
                          else next.add(section.id);
                          return next;
                        })
                      }
                      type="button"
                    >
                      {expanded ? 'Less' : `+${section.tags.length - 8}`}
                      <ChevronDown
                        className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </aside>

      <main className="min-w-0">
        <div className="flex flex-col gap-3 min-[641px]:flex-row min-[641px]:items-end min-[641px]:justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
              Modules{' '}
              <span className="font-normal text-[var(--text-tertiary)]">
                {visibleModules.length}
              </span>
            </h2>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
              Filter by tags on the left, search by Module name here, compose on the right.
            </p>
          </div>
          <label className="flex h-9 min-w-[260px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 focus-within:border-[var(--accent-commit)] focus-within:ring-2 focus-within:ring-[var(--accent-commit)]/10">
            <Search aria-hidden="true" className="size-4 text-[var(--text-tertiary)]" />
            <span className="sr-only">Search Modules by name</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder="Search modules by name..."
              value={nameQuery}
            />
            {nameQuery ? (
              <button
                aria-label="Clear Module name search"
                onClick={() => setNameQuery('')}
                type="button"
              >
                <X className="size-3.5 text-[var(--text-tertiary)]" />
              </button>
            ) : null}
          </label>
        </div>

        {selectedTags.size > 0 ? (
          <fieldset className="mt-3 flex flex-wrap items-center gap-1.5">
            <legend className="sr-only">Selected tags</legend>
            <Filter className="size-3.5 text-[var(--text-tertiary)]" />
            {[...selectedTags].map((tag) => (
              <button
                className="flex items-center gap-1 rounded-full bg-[var(--active-bg)] px-2 py-1 text-[10px] text-[var(--text-secondary)]"
                key={tag}
                onClick={() => toggleTag(tag)}
                type="button"
              >
                {tagLabel(tag)} <X className="size-3" />
              </button>
            ))}
          </fieldset>
        ) : null}

        <div className="mt-3 grid gap-2 min-[761px]:grid-cols-2">
          {visibleModules.map((module) => {
            const selected = compositionModules.some(
              (item) => item.canonicalName === module.canonicalName
            );
            const active = selectedArtifact.canonicalName === module.canonicalName;
            return (
              <article
                className={`group flex min-w-0 gap-3 rounded-[var(--radius-md)] border bg-[var(--surface-card)] p-3 shadow-sm transition-colors ${active ? 'border-[var(--accent-commit)]' : 'border-[var(--stroke-divider)] hover:border-[var(--stroke-strong)]'}`}
                key={`${module.canonicalName}@${module.version}`}
              >
                <button
                  aria-label={`Inspect ${module.title}`}
                  className="flex min-w-0 flex-1 gap-3 text-left"
                  onClick={() => setSelectedArtifactName(module.canonicalName)}
                  type="button"
                >
                  <SchemaArtifactIcon artifact={module} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">
                        {module.title}
                      </span>
                      {module.tags?.includes('role:core') ? (
                        <Badge variant="outline">Core tag</Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-[var(--text-secondary)]">
                      {module.description}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                      {(module.tags ?? [])
                        .filter(cardTag)
                        .slice(0, 3)
                        .map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tagLabel(tag)}
                          </Badge>
                        ))}
                      <span className="font-mono">{module.version}</span>
                    </span>
                  </span>
                </button>
                <Button
                  aria-label={
                    selected
                      ? `Remove ${module.title} from composition`
                      : `Add ${module.title} to composition`
                  }
                  className="size-8 self-start px-0"
                  onClick={() => toggleModule(module)}
                  size="icon-sm"
                  type="button"
                  variant={selected ? 'commit' : 'canvas-outline'}
                >
                  {selected ? <Check className="size-4" /> : <Plus className="size-4" />}
                </Button>
              </article>
            );
          })}
        </div>
        {visibleModules.length === 0 ? (
          <div className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--stroke-strong)] p-10 text-center text-[12px] text-[var(--text-secondary)]">
            No Modules match this name and Tag selection.
          </div>
        ) : null}
        <div className="scroll-mt-4" id="module-detail">
          <SchemaArtifactDetail key={selectedArtifact.canonicalName} artifact={selectedArtifact} />
        </div>
      </main>

      <aside
        aria-label="Composition workbench"
        className="self-start rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm min-[1181px]:sticky min-[1181px]:top-4"
      >
        <div className="border-b border-[var(--stroke-divider)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Layers3 className="size-4 text-[var(--accent-commit)]" />
                <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
                  Composition
                </h2>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                {compositionModules.length} Modules · no required Core
              </p>
            </div>
            <Badge variant={previewState.result?.report.valid ? 'commit' : 'outline'}>
              {previewState.result?.report.valid ? 'Valid' : dirty ? 'Draft' : 'Saved'}
            </Badge>
          </div>
        </div>
        <div className="max-h-[calc(100vh-310px)] space-y-2 overflow-y-auto p-3">
          {compositionModules.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--stroke-strong)] p-6 text-center">
              <Sparkles className="mx-auto size-5 text-[var(--text-tertiary)]" />
              <p className="mt-2 text-[12px] font-medium text-[var(--text-primary)]">
                Start from any Module
              </p>
              <p className="mt-1 text-[10px] leading-4 text-[var(--text-tertiary)]">
                Core is optional and behaves like every other tagged Module.
              </p>
            </div>
          ) : null}
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={finishModuleDrag}
            sensors={dragSensors}
          >
            <SortableContext
              items={compositionModules.map(artifactKey)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {compositionModules.map((module, index) => (
                  <SortableCompositionModule
                    index={index}
                    key={artifactKey(module)}
                    module={module}
                    onMove={moveModule}
                    onRemove={toggleModule}
                    total={compositionModules.length}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {previewState.result?.report.issues.map((issue) => (
            <div
              className={`rounded-[var(--radius-md)] border p-2.5 text-[10px] leading-4 ${issue.blocking ? 'border-[var(--destructive)]/30 bg-[var(--destructive)]/5 text-[var(--destructive)]' : 'border-[var(--stroke-divider)] text-[var(--text-secondary)]'}`}
              key={`${issue.code}:${issue.module ?? issue.path ?? issue.message}`}
            >
              <strong>{issue.code}</strong> · {issue.message}
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-[var(--stroke-divider)] p-3">
          {previewState.error ? (
            <p className="text-[10px] text-[var(--destructive)]">{previewState.error}</p>
          ) : null}
          {feedback ? <p className="text-[10px] text-[var(--text-secondary)]">{feedback}</p> : null}
          <Button
            className="w-full"
            disabled={previewState.pending || compositionModules.length === 0}
            onClick={compileComposition}
            type="button"
            variant="canvas-outline"
          >
            <ShieldCheck className="size-4" />{' '}
            {previewState.pending ? 'Compiling…' : 'Verify composition'}
          </Button>
          {workspaceRevision !== undefined ? (
            <Button
              className="w-full"
              disabled={!dirty || compositionModules.length === 0}
              onClick={saveComposition}
              type="button"
              variant="commit"
            >
              Save draft
            </Button>
          ) : null}
          {workspaceRevision !== undefined && compositionRevision > 0 ? (
            <Button
              className="w-full"
              disabled={dirty || !previewState.result?.report.valid}
              onClick={applyComposition}
              type="button"
            >
              Apply verified composition
            </Button>
          ) : null}
          {workspaceRevision !== undefined ? (
            <Button
              className="w-full"
              disabled={
                dirty ||
                compositionRevision < 1 ||
                !previewState.result?.report.valid ||
                publishPending
              }
              onClick={() => setPublishOpen(true)}
              type="button"
              variant="commit"
            >
              <PackageCheck className="size-4" /> Publish Schema version
            </Button>
          ) : null}
        </div>
      </aside>
      <Dialog onOpenChange={setPublishOpen} open={publishOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>Publish Schema version</DialogTitle>
            <DialogDescription>
              Freeze Composition r{compositionRevision} and its exact Module versions as an
              immutable Schema. This does not create a Module or Commit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <PublishField id="schema-version-title" label="Schema title">
              <Input
                id="schema-version-title"
                onChange={(event) => setPublishTitle(event.target.value)}
                value={publishTitle}
              />
            </PublishField>
            <div className="grid gap-4 min-[481px]:grid-cols-[minmax(0,1fr)_120px]">
              <PublishField id="schema-canonical-name" label="Canonical name">
                <Input
                  className="font-mono text-xs"
                  id="schema-canonical-name"
                  onChange={(event) => setPublishCanonicalName(event.target.value)}
                  value={publishCanonicalName}
                />
              </PublishField>
              <PublishField id="schema-semantic-version" label="Version">
                <Input
                  className="font-mono text-xs"
                  id="schema-semantic-version"
                  onChange={(event) => setPublishVersion(event.target.value)}
                  value={publishVersion}
                />
              </PublishField>
            </div>
            <PublishField id="schema-version-tags" label="Tags (comma separated)">
              <Input
                id="schema-version-tags"
                onChange={(event) => setPublishTags(event.target.value)}
                placeholder="product, checkout, team"
                value={publishTags}
              />
            </PublishField>
            <PublishField id="schema-version-description" label="Description (optional)">
              <Textarea
                id="schema-version-description"
                onChange={(event) => setPublishDescription(event.target.value)}
                rows={2}
                value={publishDescription}
              />
            </PublishField>
            <PublishField id="schema-release-notes" label="Release notes (optional)">
              <Textarea
                id="schema-release-notes"
                onChange={(event) => setReleaseNotes(event.target.value)}
                rows={3}
                value={releaseNotes}
              />
            </PublishField>
          </div>
          <DialogFooter>
            <Button onClick={() => setPublishOpen(false)} type="button" variant="canvas-outline">
              Cancel
            </Button>
            <Button
              disabled={
                publishPending ||
                !publishTitle.trim() ||
                !publishCanonicalName.trim() ||
                !publishVersion.trim()
              }
              onClick={publishSchemaVersion}
              type="button"
              variant="commit"
            >
              <PackageCheck className="size-4" />
              {publishPending ? 'Publishing…' : `Publish ${publishVersion || 'version'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PublishField({
  children,
  id,
  label,
}: {
  children: React.ReactNode;
  id: string;
  label: string;
}) {
  return (
    <div className="grid gap-1.5 text-xs font-medium text-[var(--text-primary)]">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function SortableCompositionModule({
  index,
  module,
  onMove,
  onRemove,
  total,
}: {
  index: number;
  module: SchemaArtifactPreview;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (module: SchemaArtifactPreview) => void;
  total: number;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: artifactKey(module),
  });
  return (
    <article
      className={`rounded-[var(--radius-md)] border bg-[var(--surface-card)] p-2.5 transition-[border-color,box-shadow,opacity] ${isDragging ? 'relative z-10 border-[var(--accent-commit)] opacity-90 shadow-lg' : 'border-[var(--stroke-divider)]'}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="flex items-start gap-2">
        <button
          aria-label={`Drag ${module.title} to reorder`}
          className="-ml-1 mt-0.5 flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] active:cursor-grabbing"
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-3.5" />
        </button>
        <span className="mt-0.5 w-5 shrink-0 font-mono text-[10px] text-[var(--text-tertiary)]">
          {String((index + 1) * 10).padStart(2, '0')}
        </span>
        <SchemaArtifactIcon artifact={module} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
            {module.title}
          </p>
          <p className="mt-0.5 truncate font-mono text-[9px] text-[var(--text-tertiary)]">
            {module.canonicalName}@{module.version}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            aria-label={`Move ${module.title} earlier`}
            className="rounded p-0.5 hover:bg-[var(--hover-bg)] disabled:opacity-30"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            type="button"
          >
            <ArrowUp className="size-3.5 text-[var(--text-tertiary)]" />
          </button>
          <button
            aria-label={`Move ${module.title} later`}
            className="rounded p-0.5 hover:bg-[var(--hover-bg)] disabled:opacity-30"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
            type="button"
          >
            <ArrowDown className="size-3.5 text-[var(--text-tertiary)]" />
          </button>
          <button
            aria-label={`Remove ${module.title} from composition`}
            className="rounded p-0.5 hover:bg-[var(--hover-bg)]"
            onClick={() => onRemove(module)}
            type="button"
          >
            <X className="size-3.5 text-[var(--text-tertiary)]" />
          </button>
        </div>
      </div>
    </article>
  );
}

function artifactKey(module: Pick<SchemaArtifactPreview, 'canonicalName' | 'version'>): string {
  return `${module.canonicalName}@${module.version}`;
}

function isCoreModule(module: Pick<SchemaArtifactPreview, 'kind' | 'tags'>): boolean {
  return module.kind === 'core' || module.tags?.includes('role:core') === true;
}

function withEffectiveTags(artifact: SchemaArtifactPreview): SchemaArtifactPreview {
  const tags = new Set(artifact.tags ?? []);
  if (artifact.kind === 'core') tags.add('role:core');
  tags.add(`type:${artifact.family}`);
  tags.add(`domain:${slug(artifact.domain)}`);
  tags.add(`version:${artifact.version}`);
  tags.add(`source:${artifact.source}`);
  tags.add(`status:${artifact.status}`);
  tags.add(artifact.kind === 'core' ? 'contribution:foundation' : 'contribution:structure');
  if (artifact.recommended) tags.add('recommended:yes');
  return { ...artifact, tags: [...tags].sort() };
}

function buildTagSections(artifacts: SchemaArtifactPreview[], groupId: TagGroupId): TagSection[] {
  const group = TAG_GROUPS.find((candidate) => candidate.id === groupId) ?? TAG_GROUPS[0];
  const byPrefix = new Map<string, Set<string>>();
  for (const artifact of artifacts) {
    for (const tag of artifact.tags ?? []) {
      const prefix = tag.includes(':') ? tag.split(':', 1)[0] : 'tag';
      if (!group?.prefixes.includes(prefix ?? 'tag')) continue;
      const values = byPrefix.get(prefix ?? 'tag') ?? new Set<string>();
      values.add(tag);
      byPrefix.set(prefix ?? 'tag', values);
    }
  }
  return [...byPrefix.entries()]
    .map(([id, tags]) => ({ id, label: sectionLabel(id), tags: [...tags].sort(tagSort) }))
    .filter((section) => section.tags.length > 0);
}

function groupSelectedTags(tags: Set<string>): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const tag of tags) {
    const prefix = tag.includes(':') ? tag.split(':', 1)[0] : 'tag';
    grouped.set(prefix ?? 'tag', [...(grouped.get(prefix ?? 'tag') ?? []), tag]);
  }
  return grouped;
}

function artifactsFromComposition(
  composition: SchemaCompositionDraft | undefined,
  artifacts: SchemaArtifactPreview[]
): SchemaArtifactPreview[] {
  if (!composition) return [];
  const byKey = new Map(
    artifacts.map((artifact) => [`${artifact.canonicalName}@${artifact.version}`, artifact])
  );
  const references =
    composition.apiVersion === 't3x.dev/yschema-composition/v2'
      ? [...composition.modules].sort(
          (left, right) => left.presentationOrder - right.presentationOrder
        )
      : [
          composition.core,
          ...[...composition.modules].sort((left, right) => left.order - right.order),
        ];
  return references.flatMap((reference) => {
    const artifact = byKey.get(`${reference.canonicalName}@${reference.version}`);
    return artifact ? [artifact] : [];
  });
}

function buildOpenComposition(
  workspaceId: string,
  revision: number,
  modules: SchemaArtifactPreview[]
): SchemaCompositionDraftV2 {
  return {
    apiVersion: 't3x.dev/yschema-composition/v2',
    id: `composition:${workspaceId}`,
    revision,
    status: 'draft',
    modules: modules.map((module, index) => ({
      canonicalName: module.canonicalName,
      version: module.version,
      presentationOrder: (index + 1) * 10,
    })),
  };
}

function compositionSignature(modules: SchemaArtifactPreview[]): string {
  return modules.map((module) => `${module.canonicalName}@${module.version}`).join('|');
}

function sectionLabel(prefix: string): string {
  return prefix === 'recommended'
    ? 'Featured'
    : `${prefix[0]?.toUpperCase() ?? ''}${prefix.slice(1)}`;
}

function tagLabel(tag: string): string {
  const value = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag;
  return value
    .split('-')
    .map((part) => (part ? `${part[0]?.toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

function tagSort(left: string, right: string): number {
  return tagLabel(left).localeCompare(tagLabel(right));
}

function cardTag(tag: string): boolean {
  return tag.startsWith('type:') || tag.startsWith('domain:') || tag === 'role:core';
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
