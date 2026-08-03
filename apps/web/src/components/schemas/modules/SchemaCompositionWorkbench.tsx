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
  Play,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSchemaCompositionPreview } from '@/hooks/schemas/useSchemaCompositionPreview';
import type {
  SchemaArtifactPreview,
  SchemaCompositionDraft,
  WorkspaceSchemaCompositionResult,
} from '@/types/schemaModules';

interface SchemaCompositionWorkbenchProps {
  applied: boolean;
  compositionId: string;
  compositionRevision: number;
  core: SchemaArtifactPreview;
  dirty: boolean;
  modules: SchemaArtifactPreview[];
  onModulesChange: (modules: SchemaArtifactPreview[]) => void;
  onApply?: (compositionHash: string) => Promise<WorkspaceSchemaCompositionResult>;
  onSave?: (composition: SchemaCompositionDraft) => Promise<WorkspaceSchemaCompositionResult>;
  projectId?: string;
  workspaceTitle?: string;
}

export function SchemaCompositionWorkbench({
  applied,
  compositionId,
  compositionRevision,
  core,
  dirty,
  modules,
  onModulesChange,
  onApply,
  onSave,
  projectId,
  workspaceTitle,
}: SchemaCompositionWorkbenchProps) {
  const { accept, compile, error, pending, reset, result: preview } = useSchemaCompositionPreview();
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saveFeedback, setSaveFeedback] = useState<string>();
  const [applyPending, setApplyPending] = useState(false);
  const [applyError, setApplyError] = useState<string>();
  const [applyFeedback, setApplyFeedback] = useState<string>();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (dirty) {
      setSaveFeedback(undefined);
      setApplyFeedback(undefined);
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

  async function applyComposition() {
    if (!onApply || dirty) return;
    setApplyPending(true);
    setApplyError(undefined);
    setApplyFeedback(undefined);
    try {
      const verified = preview ?? (await compile(buildComposition(), projectId));
      if (!verified) return;
      if (!verified.report.valid) {
        setApplyError('Resolve the blocking Composition issues before applying it.');
        return;
      }
      const result = await onApply(verified.compositionHash);
      if (result.preview) accept(result.preview);
      setApplyFeedback(
        `Applied revision ${result.composition?.revision ?? compositionRevision} to ${workspaceTitle ?? 'Workspace'}. Candidate and YOps proposals are now stale; regenerate before review.`
      );
    } catch (cause) {
      setApplyError(cause instanceof Error ? cause.message : 'Composition apply failed.');
    } finally {
      setApplyPending(false);
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
            {dirty
              ? 'unsaved'
              : applied
                ? `applied r${compositionRevision}`
                : `saved r${compositionRevision}`}
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
        {error || saveError || applyError ? (
          <p className="mb-3 rounded-md bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] px-3 py-2 text-[11px] text-[var(--destructive)]">
            {applyError ?? saveError ?? error}
          </p>
        ) : null}
        {saveFeedback ? (
          <p className="mb-3 rounded-md bg-[color-mix(in_srgb,var(--accent-leaf)_9%,transparent)] px-3 py-2 text-[11px] leading-4 text-[var(--text-secondary)]">
            {saveFeedback}
          </p>
        ) : null}
        {applyFeedback ? (
          <p className="mb-3 rounded-md bg-[color-mix(in_srgb,var(--accent-commit)_9%,transparent)] px-3 py-2 text-[11px] leading-4 text-[var(--text-secondary)]">
            {applyFeedback}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="w-full px-2"
            disabled={pending || savePending || applyPending}
            onClick={runPreview}
            type="button"
            variant="canvas-outline"
          >
            <Play aria-hidden="true" className="size-3.5" />{' '}
            {pending ? 'Compiling…' : 'Compile preview'}
          </Button>
          <Button
            className="w-full px-2"
            disabled={!onSave || !dirty || pending || savePending || applyPending}
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
            !onApply ||
            dirty ||
            compositionRevision < 1 ||
            applied ||
            pending ||
            savePending ||
            applyPending
          }
          onClick={applyComposition}
          type="button"
          variant="commit"
        >
          <Sparkles aria-hidden="true" className="size-3.5" />{' '}
          {applyPending
            ? 'Applying…'
            : applied
              ? `Applied revision ${compositionRevision}`
              : onApply
                ? 'Apply to Workspace'
                : 'Apply unavailable'}
        </Button>
        <p className="mt-2 text-center text-[10px] leading-4 text-[var(--text-tertiary)]">
          Save stores the Manifest. Apply binds the verified contract and invalidates old proposals.
          Neither action creates a Commit or advances history.
        </p>
      </div>
    </aside>
  );
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
