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
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  LockKeyhole,
  PackageCheck,
  Play,
  Save,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
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
import { useSchemaCompositionPreview } from '@/hooks/schemas/useSchemaCompositionPreview';
import type {
  PublishedSchemaVersionManifest,
  PublishSchemaCompositionInput,
  SchemaArtifactPreview,
  SchemaCompositionDraft,
  WorkspaceSchemaCompositionResult,
} from '@/types/schemaModules';

interface SchemaCompositionWorkbenchProps {
  compositionId: string;
  compositionRevision: number;
  core: SchemaArtifactPreview;
  dirty: boolean;
  modules: SchemaArtifactPreview[];
  nextVersion?: string;
  onModulesChange: (modules: SchemaArtifactPreview[]) => void;
  onPublish?: (input: PublishSchemaCompositionInput) => Promise<PublishedSchemaVersionManifest>;
  onSave?: (composition: SchemaCompositionDraft) => Promise<WorkspaceSchemaCompositionResult>;
  projectId?: string;
  workspaceTitle?: string;
}

export function SchemaCompositionWorkbench({
  compositionId,
  compositionRevision,
  core,
  dirty,
  modules,
  nextVersion = '1.0.0',
  onModulesChange,
  onPublish,
  onSave,
  projectId,
  workspaceTitle,
}: SchemaCompositionWorkbenchProps) {
  const { accept, compile, error, pending, reset, result: preview } = useSchemaCompositionPreview();
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saveFeedback, setSaveFeedback] = useState<string>();
  const [publishPending, setPublishPending] = useState(false);
  const [publishError, setPublishError] = useState<string>();
  const [publishFeedback, setPublishFeedback] = useState<string>();
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState(`${workspaceTitle ?? 'Project'} PRD`);
  const [publishCanonicalName, setPublishCanonicalName] = useState(defaultCanonicalName(projectId));
  const [publishVersion, setPublishVersion] = useState(nextVersion);
  const [publishDescription, setPublishDescription] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (dirty) {
      setSaveFeedback(undefined);
      setPublishFeedback(undefined);
    }
  }, [dirty]);

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const from = modules.findIndex((module) => module.canonicalName === event.active.id);
    const to = modules.findIndex((module) => module.canonicalName === event.over?.id);
    if (from < 0 || to < 0) return;
    onModulesChange(arrayMove(modules, from, to));
    reset();
  }

  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= modules.length) return;
    onModulesChange(arrayMove(modules, index, next));
    reset();
  }

  async function runPreview() {
    await compile(buildComposition(), projectId);
  }

  function buildComposition(): SchemaCompositionDraft {
    return {
      apiVersion: 't3x.dev/yschema-composition/v1',
      id: compositionId,
      revision: compositionRevision,
      family: 'prd',
      status: 'draft',
      core: { canonicalName: core.canonicalName, version: core.version },
      modules: modules.map((module, index) => ({
        canonicalName: module.canonicalName,
        version: module.version,
        order: (index + 1) * 10,
        slot: module.placement,
      })),
    };
  }

  async function saveDraft() {
    if (!onSave) return;
    setSavePending(true);
    setSaveError(undefined);
    setSaveFeedback(undefined);
    try {
      const saved = await onSave(buildComposition());
      if (saved.preview) accept(saved.preview);
      setSaveFeedback(
        `Saved draft revision ${saved.composition?.revision ?? compositionRevision} to ${workspaceTitle ?? 'Workspace'}. No Commit was created.`
      );
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Composition draft save failed.');
    } finally {
      setSavePending(false);
    }
  }

  async function preparePublish() {
    if (!onPublish || dirty) return;
    setPublishError(undefined);
    const verified = preview ?? (await compile(buildComposition(), projectId));
    if (!verified) return;
    if (!verified.report.valid) {
      setPublishError('Resolve the blocking Composition issues before publishing it.');
      return;
    }
    setPublishVersion(nextVersion);
    setPublishOpen(true);
  }

  async function submitPublish() {
    if (!onPublish || !preview) return;
    setPublishPending(true);
    setPublishError(undefined);
    setPublishFeedback(undefined);
    try {
      const published = await onPublish({
        compositionRevision,
        compositionHash: preview.compositionHash,
        canonicalName: publishCanonicalName.trim(),
        version: publishVersion.trim(),
        title: publishTitle.trim(),
        ...(publishDescription.trim() ? { description: publishDescription.trim() } : {}),
        ...(releaseNotes.trim() ? { releaseNotes: releaseNotes.trim() } : {}),
      });
      setPublishFeedback(`Published ${published.title} ${published.version} to version history.`);
      setPublishOpen(false);
    } catch (cause) {
      setPublishError(cause instanceof Error ? cause.message : 'Schema version publish failed.');
    } finally {
      setPublishPending(false);
    }
  }

  return (
    <aside
      aria-label="Composition workbench"
      className="self-start overflow-hidden rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] shadow-sm min-[1181px]:sticky min-[1181px]:top-4"
    >
      <header className="border-b border-[var(--stroke-divider)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              Composition draft
            </p>
            <h3 className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">
              PRD full-stack contract
            </h3>
          </div>
          <Badge variant={dirty ? 'pending' : 'success'}>
            {dirty ? 'unsaved' : `saved r${compositionRevision}`}
          </Badge>
        </div>
        <p className="mt-2 text-[12px] leading-5 text-[var(--text-secondary)]">
          Drag a handle, or use the arrow buttons. Core stays locked at the top.
        </p>
      </header>

      <div className="p-3">
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-2.5">
          <span className="flex size-7 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent-commit)_12%,transparent)] text-[var(--accent-commit)]">
            <LockKeyhole aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-[var(--text-primary)]">
              {core.title}
            </p>
            <p className="font-mono text-[10px] text-[var(--text-tertiary)]">0 · {core.version}</p>
          </div>
          <Badge variant="outline">locked</Badge>
        </div>

        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
          <SortableContext
            items={modules.map((module) => module.canonicalName)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="mt-2 space-y-1.5">
              {modules.map((module, index) => (
                <SortableModuleRow
                  index={index}
                  key={module.canonicalName}
                  module={module}
                  onMove={move}
                  onRemove={() => {
                    onModulesChange(
                      modules.filter((item) => item.canonicalName !== module.canonicalName)
                    );
                    reset();
                  }}
                  total={modules.length}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        {modules.length === 0 ? (
          <div className="mt-2 rounded-[var(--radius-md)] border border-dashed border-[var(--stroke-strong)] p-5 text-center text-[12px] text-[var(--text-secondary)]">
            Choose Modules from the registry to assemble this Schema.
          </div>
        ) : null}
      </div>

      <div className="border-t border-[var(--stroke-divider)] p-3">
        {preview ? (
          <div
            className={`mb-3 rounded-[var(--radius-md)] border p-3 ${preview.report.valid ? 'border-[color-mix(in_srgb,var(--accent-leaf)_45%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-leaf)_8%,transparent)]' : 'border-[color-mix(in_srgb,var(--accent-pending)_45%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-pending)_8%,transparent)]'}`}
          >
            <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-primary)]">
              {preview.report.valid ? (
                <CheckCircle2 className="size-4 text-[var(--accent-leaf)]" />
              ) : (
                <AlertTriangle className="size-4 text-[var(--accent-pending)]" />
              )}
              {preview.report.valid
                ? 'Composition is valid'
                : `${preview.report.issues.length} blocking issue${preview.report.issues.length === 1 ? '' : 's'}`}
            </p>
            <p className="mt-1 truncate font-mono text-[10px] text-[var(--text-tertiary)]">
              {preview.compiledSchemaHash}
            </p>
            {preview.report.issues.slice(0, 2).map((issue) => (
              <p
                className="mt-2 text-[11px] leading-4 text-[var(--text-secondary)]"
                key={`${issue.code}-${issue.module}`}
              >
                {issue.message}
              </p>
            ))}
          </div>
        ) : null}
        {error || saveError || publishError ? (
          <p className="mb-3 rounded-md bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] px-3 py-2 text-[11px] text-[var(--destructive)]">
            {publishError ?? saveError ?? error}
          </p>
        ) : null}
        {saveFeedback ? (
          <p className="mb-3 rounded-md bg-[color-mix(in_srgb,var(--accent-leaf)_9%,transparent)] px-3 py-2 text-[11px] leading-4 text-[var(--text-secondary)]">
            {saveFeedback}
          </p>
        ) : null}
        {publishFeedback ? (
          <p className="mb-3 rounded-md bg-[color-mix(in_srgb,var(--accent-commit)_9%,transparent)] px-3 py-2 text-[11px] leading-4 text-[var(--text-secondary)]">
            {publishFeedback}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="w-full px-2"
            disabled={pending || savePending || publishPending}
            onClick={runPreview}
            type="button"
            variant="canvas-outline"
          >
            <Play aria-hidden="true" className="size-3.5" />{' '}
            {pending ? 'Compiling…' : 'Compile preview'}
          </Button>
          <Button
            className="w-full px-2"
            disabled={!onSave || !dirty || pending || savePending || publishPending}
            onClick={saveDraft}
            type="button"
            variant="pending"
          >
            <Save aria-hidden="true" className="size-3.5" />{' '}
            {savePending ? 'Saving…' : onSave ? 'Save draft' : 'No Workspace'}
          </Button>
        </div>
        <Button
          className="mt-2 w-full"
          disabled={
            !onPublish ||
            dirty ||
            compositionRevision < 1 ||
            (preview !== undefined && !preview.report.valid) ||
            pending ||
            savePending ||
            publishPending
          }
          onClick={preparePublish}
          type="button"
          variant="commit"
        >
          <PackageCheck aria-hidden="true" className="size-3.5" />{' '}
          {publishPending
            ? 'Publishing…'
            : preview && !preview.report.valid
              ? 'Resolve issues to publish'
              : onPublish
                ? 'Publish version'
                : 'Publish unavailable'}
        </Button>
        <p className="mt-2 text-center text-[10px] leading-4 text-[var(--text-tertiary)]">
          Save keeps an editable draft. Publish creates an immutable Schema version; apply it later
          from version history. Neither action creates a Commit.
        </p>
      </div>

      <Dialog onOpenChange={setPublishOpen} open={publishOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Publish Schema version</DialogTitle>
            <DialogDescription>
              Freeze saved Composition r{compositionRevision} as a reusable, immutable contract.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <PublishField id="schema-version-title" label="Version title">
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
            <PublishField id="schema-version-description" label="Description (optional)">
              <Textarea
                id="schema-version-description"
                onChange={(event) => setPublishDescription(event.target.value)}
                placeholder="What this contract is designed to capture."
                rows={2}
                value={publishDescription}
              />
            </PublishField>
            <PublishField id="schema-release-notes" label="Release notes (optional)">
              <Textarea
                id="schema-release-notes"
                onChange={(event) => setReleaseNotes(event.target.value)}
                placeholder="What changed from the previous version."
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
              onClick={submitPublish}
              type="button"
              variant="commit"
            >
              <PackageCheck aria-hidden="true" className="size-3.5" />
              {publishPending ? 'Publishing…' : `Publish ${publishVersion || 'version'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function PublishField({ children, id, label }: { children: ReactNode; id: string; label: string }) {
  return (
    <div className="grid gap-1.5 text-xs font-medium text-[var(--text-primary)]">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function defaultCanonicalName(projectId?: string): string {
  const projectKey = (projectId ?? 'project')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `projects/${projectKey || 'project'}/prd`;
}

function SortableModuleRow({
  index,
  module,
  onMove,
  onRemove,
  total,
}: {
  index: number;
  module: SchemaArtifactPreview;
  onMove: (index: number, delta: number) => void;
  onRemove: () => void;
  total: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.canonicalName,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-2 ${isDragging ? 'relative z-10 shadow-lg ring-2 ring-[var(--accent-commit)]/25' : ''}`}
    >
      <button
        aria-label={`Drag ${module.title} to reorder`}
        className="flex size-7 touch-none cursor-grab items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] active:cursor-grabbing"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <span className="w-4 text-center font-mono text-[10px] text-[var(--text-tertiary)]">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
          {module.title}
        </p>
        <p className="truncate text-[10px] text-[var(--text-tertiary)]">{module.placement}</p>
      </div>
      <div className="flex items-center">
        <button
          aria-label={`Move ${module.title} earlier`}
          className="flex size-6 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] disabled:opacity-30"
          disabled={index === 0}
          onClick={() => onMove(index, -1)}
          type="button"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          aria-label={`Move ${module.title} later`}
          className="flex size-6 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] disabled:opacity-30"
          disabled={index === total - 1}
          onClick={() => onMove(index, 1)}
          type="button"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <button
          aria-label={`Remove ${module.title}`}
          className="flex size-6 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--destructive)]"
          onClick={onRemove}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
