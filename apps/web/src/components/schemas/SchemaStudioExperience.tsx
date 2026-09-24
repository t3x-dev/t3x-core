'use client';

import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { getProjectIdRepoPath, getProjectIdWorkspacePath } from '@/domain/project/repoPath';
import { useStudioCandidates } from '@/hooks/schemas/useStudioCandidates';
import { useApplyStudioSelection, useStudioPreview } from '@/hooks/schemas/useStudioPreview';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import styles from './SchemaStudioExperience.module.css';
import { StudioChanges } from './StudioDefinitionPreview';

type ModuleTone = 'blue' | 'purple' | 'orange' | 'green' | 'rose' | 'slate' | 'amber';

type StudioModule = {
  id: string;
  title: string;
  source: string;
  sourceTone: ModuleTone | 'black';
  tone: ModuleTone;
  icon: string;
  checked: boolean;
  candidate?: StudioCandidate;
};

type StudioSource = {
  name: string;
  tone: ModuleTone | 'black';
  icon: string;
  modules: StudioModule[];
};

const demoSources: StudioSource[] = [
  {
    name: 'T3X PRD',
    tone: 'black',
    icon: 'ri-checkbox-blank-circle-line',
    modules: [
      {
        id: 'summary',
        title: 'Summary',
        source: 'T3X PRD',
        sourceTone: 'black',
        tone: 'blue',
        icon: 'ri-box-3-fill',
        checked: true,
      },
      {
        id: 'requirements',
        title: 'Requirements',
        source: 'T3X PRD',
        sourceTone: 'black',
        tone: 'purple',
        icon: 'ri-file-list-3-fill',
        checked: true,
      },
      {
        id: 'milestones',
        title: 'Milestones',
        source: 'T3X PRD',
        sourceTone: 'black',
        tone: 'orange',
        icon: 'ri-flag-2-fill',
        checked: false,
      },
    ],
  },
  {
    name: 'Release Ops',
    tone: 'blue',
    icon: 'ri-rocket-2-fill',
    modules: [
      {
        id: 'rollout',
        title: 'Rollout',
        source: 'Release Ops',
        sourceTone: 'blue',
        tone: 'green',
        icon: 'ri-rocket-2-fill',
        checked: true,
      },
      {
        id: 'acceptance',
        title: 'Acceptance',
        source: 'Release Ops',
        sourceTone: 'blue',
        tone: 'rose',
        icon: 'ri-checkbox-circle-fill',
        checked: true,
      },
      {
        id: 'audit',
        title: 'Audit',
        source: 'Release Ops',
        sourceTone: 'blue',
        tone: 'slate',
        icon: 'ri-database-2-fill',
        checked: false,
      },
    ],
  },
  {
    name: 'Risk Kit',
    tone: 'purple',
    icon: 'ri-alert-fill',
    modules: [
      {
        id: 'risk',
        title: 'Risk',
        source: 'Risk Kit',
        sourceTone: 'purple',
        tone: 'amber',
        icon: 'ri-alert-fill',
        checked: true,
      },
      {
        id: 'controls',
        title: 'Controls',
        source: 'Risk Kit',
        sourceTone: 'purple',
        tone: 'slate',
        icon: 'ri-shield-check-fill',
        checked: false,
      },
    ],
  },
];

const demoComposition = demoSources
  .flatMap((source) => source.modules)
  .filter((item) => item.checked);

const toneClasses: Record<ModuleTone | 'black', string> = {
  black: 'bg-[var(--text-primary)] text-[var(--status-warning)]',
  blue: 'bg-[var(--color-brand)] text-[var(--on-accent)]',
  purple: 'bg-[var(--status-info)] text-[var(--on-accent)]',
  orange: 'bg-[var(--status-warning)] text-[var(--on-accent)]',
  green: 'bg-[var(--status-success)] text-[var(--on-accent)]',
  rose: 'bg-[var(--status-error)] text-[var(--on-accent)]',
  slate: 'bg-[var(--text-tertiary)] text-[var(--on-accent)]',
  amber: 'bg-[var(--status-warning)] text-[var(--on-accent)]',
};

function candidateTone(index: number): ModuleTone {
  return (['blue', 'purple', 'green', 'rose', 'amber', 'slate'] as const)[index % 6];
}

function candidateIcon(index: number) {
  return [
    'ri-box-3-fill',
    'ri-file-list-3-fill',
    'ri-rocket-2-fill',
    'ri-checkbox-circle-fill',
    'ri-alert-fill',
  ][index % 5];
}

export function SchemaStudioExperience({
  projectId,
  children,
}: {
  projectId: string;
  children?: ReactNode;
}) {
  const params = useSearchParams();
  const candidates = useStudioCandidates(projectId);
  const workspaces = useProjectWorkspaces(projectId);
  const applySelection = useApplyStudioSelection(projectId);
  const [selection, setSelection] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState(params?.get('workspace') ?? '');
  const requestedWorkspaceId = params?.get('workspace') ?? '';
  const [mode, setMode] = useState<'structure' | 'yaml'>('structure');
  const [activeModuleId, setActiveModuleId] = useState('requirements');
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());
  const [advanced, setAdvanced] = useState(false);
  const [review, setReview] = useState<StudioPreview>();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string>();
  const [applied, setApplied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    setWorkspaceId(requestedWorkspaceId);
  }, [requestedWorkspaceId]);

  const requested = params?.get('candidate');
  useEffect(() => {
    if (requested) setSelection([requested]);
  }, [requested]);

  const target = workspaces.workspaces.find((item) => item.id === workspaceId);
  const preview = useStudioPreview(
    projectId,
    { candidateIds: selection, ...(workspaceId ? { workspaceId } : {}) },
    target?.revision
  );
  const data = preview.data;
  const locked = new Set(
    data?.modules.filter((item) => item.requiredBy.length).map((item) => item.candidateId)
  );
  const candidateSelectionKey = JSON.stringify(selection);

  useEffect(() => {
    setReview(undefined);
    setError(undefined);
    setApplied(false);
  }, [candidateSelectionKey, workspaceId]);

  const liveSources = useMemo<StudioSource[]>(() => {
    if (!candidates.items.length) return [];
    const bySource = new Map<string, StudioSource>();
    candidates.items.forEach((candidate, index) => {
      const sourceName = candidate.source?.canonicalName.split('/').at(-1) ?? 'Unavailable source';
      const displaySource = sourceName
        .split(/[-_]/)
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(' ');
      const group = bySource.get(displaySource) ?? {
        name: displaySource,
        tone: candidateTone(index),
        icon: candidateIcon(index),
        modules: [],
      };
      group.modules.push({
        id: candidate.id,
        title: candidate.title ?? 'Unavailable source',
        source: displaySource,
        sourceTone: group.tone,
        tone: candidateTone(index),
        icon: candidateIcon(index),
        checked: selection.includes(candidate.id),
        candidate,
      });
      bySource.set(displaySource, group);
    });
    return [...bySource.values()];
  }, [candidates.items, selection]);

  const showExplicitDemo = params?.get('demo') === '1';
  const visibleSources = liveSources.length ? liveSources : showExplicitDemo ? demoSources : [];
  const liveComposition = liveSources
    .flatMap((source) => source.modules)
    .filter((item) => item.checked);
  const composition = liveSources.length
    ? liveComposition
    : showExplicitDemo
      ? demoComposition
      : [];
  const activeModule =
    visibleSources.flatMap((source) => source.modules).find((item) => item.id === activeModuleId) ??
    composition[1] ??
    composition[0];
  const selectedWorkspaceTitle =
    target?.title ??
    (workspaceId
      ? 'Workspace unavailable'
      : (workspaces.workspaces[0]?.title ?? 'Select a workspace'));

  function choose(module: StudioModule) {
    setActiveModuleId(module.id);
    if (!module.candidate) return;
    const candidate = module.candidate;
    setSelection((current) =>
      current.includes(candidate.id)
        ? current.filter((value) => value !== candidate.id)
        : candidate.kind === 'schema'
          ? [candidate.id]
          : [
              ...current.filter(
                (value) => candidates.items.find((item) => item.id === value)?.kind !== 'schema'
              ),
              candidate.id,
            ]
    );
  }

  async function apply() {
    if (!review?.workspace || !target || review.workspace.id !== target.id || applying) return;
    setApplying(true);
    setError(undefined);
    try {
      await applySelection({
        candidateIds: [...selection],
        workspaceId: review.workspace.id,
        ifRevision: review.workspace.revision,
        reviewHash: review.reviewHash,
      });
      if (!mounted.current) return;
      setReview(undefined);
      setApplied(true);
      await workspaces.refresh();
      if (mounted.current) preview.refresh();
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'Apply failed');
        setReview(undefined);
        preview.refresh();
      }
    } finally {
      if (mounted.current) setApplying(false);
    }
  }

  function openReview() {
    if (target && data?.workspace?.id === target.id && data?.report.valid && data?.adoption.allowed)
      setReview(data);
  }

  function downloadDefinition() {
    if (!data?.schema) return;
    const blob = new Blob([JSON.stringify(data.schema, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'schema-studio-definition.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const canReview =
    !!target &&
    data?.workspace?.id === target.id &&
    !!data?.report.valid &&
    !!data?.adoption.allowed &&
    !applying;
  const repoPath = getProjectIdRepoPath(projectId);
  const browseParams = new URLSearchParams({ tab: 'schemas', schemaView: 'browse' });
  const routeBranch = params?.get('branch');
  if (routeBranch) browseParams.set('branch', routeBranch);
  if (workspaceId) browseParams.set('workspace', workspaceId);
  const browseHref = `${repoPath}?${browseParams.toString()}`;
  const workspaceLink = target
    ? `${getProjectIdWorkspacePath(projectId, { branch: target.targetBranch })}&workspace=${encodeURIComponent(target.id)}`
    : getProjectIdWorkspacePath(projectId);

  return (
    <section
      aria-label="Schema Studio"
      className={`${styles.root} flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[var(--surface-card)] text-[var(--text-primary)]`}
    >
      <link
        href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css"
        rel="stylesheet"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {!workspaces.loading && !workspaces.error && workspaceId && !target ? (
        <p
          className="mx-4 mt-3 rounded-lg border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] p-2 text-sm text-[var(--status-error)]"
          role="alert"
        >
          Workspace {workspaceId} was not found in this project. Select a valid Workspace before
          applying.
        </p>
      ) : null}

      {preview.error || (data?.adoption.allowed === false && data.adoption.reason) ? (
        <p
          className="mx-4 mt-3 rounded-lg border border-[var(--status-error-muted)] bg-[var(--status-error-muted)] p-2 text-sm text-[var(--status-error)]"
          role="alert"
        >
          {preview.error || data?.adoption.reason}
        </p>
      ) : null}

      {error ? (
        <p
          className="mx-4 mt-3 rounded-lg border border-[var(--status-error-muted)] bg-[var(--status-error-muted)] p-2 text-sm text-[var(--status-error)]"
          role="alert"
        >
          {error} Review the refreshed selection before trying again.
        </p>
      ) : null}

      <main
        aria-label="Studio composition"
        className="relative grid flex-1 grid-cols-[280px_minmax(500px,1fr)_320px] grid-rows-[48px_minmax(0,1fr)] gap-x-3 gap-y-2 overflow-hidden p-3"
      >
        <aside
          aria-label="Studio sources"
          className="col-start-1 row-span-2 row-start-1 flex min-h-0 flex-col rounded-[12px] border border-[var(--color-brand-muted)] bg-[var(--surface-panel)] shadow-sm"
        >
          <div className="shrink-0 px-4 pb-1.5 pt-3">
            <h2 className="text-base font-bold text-[var(--color-brand-hover)]">Sources</h2>
          </div>
          <div className="flex-1 overflow-y-auto pb-2">
            {candidates.loading ? (
              <output className="block px-5 py-3 text-sm text-[var(--color-brand-hover)]">
                Loading candidates…
              </output>
            ) : null}
            {candidates.error ? (
              <p className="px-5 py-3 text-sm text-[var(--status-error)]" role="alert">
                {candidates.error}
              </p>
            ) : null}
            {!candidates.loading && !candidates.error && visibleSources.length === 0 ? (
              <div className="px-5 py-4 text-sm text-[var(--color-brand-hover)]">
                <p>No Studio candidates in this project.</p>
                <Link className="mt-2 inline-block font-semibold underline" href={browseHref}>
                  Browse schemas to add one
                </Link>
              </div>
            ) : null}
            {visibleSources.map((source) => {
              const collapsed = collapsedSources.has(source.name);
              return (
                <div className="mb-1" key={source.name}>
                  <button
                    className="group flex w-full items-center justify-between px-4 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                    onClick={() =>
                      setCollapsedSources((current) => {
                        const next = new Set(current);
                        if (next.has(source.name)) next.delete(source.name);
                        else next.add(source.name);
                        return next;
                      })
                    }
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <SourceIcon icon={source.icon} tone={source.tone} />
                      <span className="truncate font-semibold text-[var(--color-brand-hover)]">
                        {source.name}
                      </span>
                      <span className="shrink-0 rounded-full border border-[var(--color-brand-muted)] bg-[var(--color-brand-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand)]">
                        Pinned source
                      </span>
                    </span>
                    <i
                      className={`${collapsed ? 'ri-arrow-down-s-line' : 'ri-arrow-up-s-line'} text-xl text-[var(--color-brand)] group-hover:text-[var(--color-brand-hover)]`}
                    />
                  </button>
                  {!collapsed ? (
                    <div className="flex flex-col px-4 py-0.5">
                      {source.modules.map((module) => {
                        const isLocked = module.candidate ? locked.has(module.candidate.id) : false;
                        const disabled =
                          !!module.candidate &&
                          (!module.candidate.available || applying || preview.loading || isLocked);
                        return (
                          <div className="contents" key={module.id}>
                            <label
                              className="group flex items-center gap-2 py-1 text-left"
                              onClick={() => setActiveModuleId(module.id)}
                            >
                              <input
                                aria-label={
                                  module.candidate
                                    ? `Select ${module.title} ${module.candidate.source?.version ?? ''}`
                                    : module.title
                                }
                                checked={module.checked}
                                className="sr-only"
                                disabled={disabled}
                                onChange={() => choose(module)}
                                readOnly={!module.candidate}
                                type="checkbox"
                              />
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${module.checked ? 'bg-[var(--color-brand)]' : 'border border-[var(--stroke-default)] bg-[var(--surface-panel)]'}`}
                              >
                                {module.checked ? (
                                  <i className="ri-check-line text-[11px] font-bold text-[var(--on-accent)]" />
                                ) : null}
                              </span>
                              <ModuleIcon icon={module.icon} tone={module.tone} />
                              <span
                                className={`text-[13px] ${module.checked ? 'font-semibold text-[var(--color-brand-hover)]' : 'font-medium text-[var(--text-secondary)]'} group-hover:text-[var(--color-brand-hover)]`}
                              >
                                {module.title}
                              </span>
                            </label>
                            {module.candidate ? (
                              <button
                                aria-label={`Remove ${module.title}`}
                                className="sr-only"
                                disabled={
                                  candidates.pending || applying || preview.loading || isLocked
                                }
                                onClick={() => {
                                  setSelection((current) =>
                                    current.filter((id) => id !== module.id)
                                  );
                                  void candidates
                                    .remove(module.id)
                                    .catch((cause) => setError(cause.message));
                                }}
                                type="button"
                              >
                                Remove {module.title}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>

        <div
          aria-label="Studio controls"
          className="col-span-2 col-start-2 row-start-1 flex min-w-0 items-center justify-between gap-4 rounded-[12px] border border-[var(--color-brand-muted)] bg-[var(--surface-panel)] px-3 shadow-sm"
          role="toolbar"
        >
          <div className="flex min-w-0 items-center gap-5">
            <SegmentedControl
              ariaLabel="Studio view"
              items={[
                { label: 'Structure', value: 'structure' },
                { label: 'YAML', value: 'yaml' },
              ]}
              onValueChange={setMode}
              value={mode}
            />
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--color-brand-hover)]">
              <span className="truncate">{selectedWorkspaceTitle.toLowerCase()}</span>
              <span className="text-[var(--color-brand)]">•</span>
              <span>{applied ? 'Applied' : 'Draft'}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label="Advanced definition workbench"
              className="flex h-[34px] items-center gap-1.5 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-xs font-semibold text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--hover-bg)]"
              onClick={() => setAdvanced(true)}
              type="button"
            >
              <i className="ri-add-line text-lg" />
              Add modules
            </button>
            <button
              aria-disabled={!canReview}
              className="h-[34px] rounded-[5px] bg-[var(--accent-commit)] px-3 text-xs font-semibold text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--accent-commit)]/90"
              onClick={openReview}
              type="button"
            >
              Review changes
            </button>
          </div>
        </div>

        <section
          aria-label="Composed structure"
          className="col-start-2 row-start-2 flex min-h-0 min-w-[500px] flex-col overflow-hidden rounded-[12px] border border-[var(--color-brand-muted)] bg-[var(--surface-panel)] shadow-sm"
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-brand-muted)] px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand)] text-[var(--on-accent)] shadow-sm">
              <i className="ri-box-3-fill text-lg" />
            </div>
            <h2 className="text-lg font-bold text-[var(--color-brand-hover)]">
              Composed structure
            </h2>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {mode === 'yaml' ? (
              <pre className="min-h-full whitespace-pre-wrap rounded-[12px] bg-[var(--text-primary)] p-5 font-mono text-xs leading-6 text-[var(--color-brand-muted)]">
                {data?.schema
                  ? JSON.stringify(data.schema, null, 2)
                  : 'No preview for this selection.'}
              </pre>
            ) : composition.length ? (
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
                <div className="flex flex-col gap-2">
                  {composition.map((module, index) => (
                    <CompositionModule
                      active={module.id === activeModule?.id}
                      index={index}
                      key={module.id}
                      module={module}
                      onOpen={() => setActiveModuleId(module.id)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-[var(--color-brand-hover)]">
                <i className="ri-box-3-line text-3xl text-[var(--color-brand)]" />
                <h3 className="text-lg font-semibold">Shape your next piece of work</h3>
                <p className="text-sm text-[var(--color-brand)]">
                  Add a release from Browse, then select it to compose its exact definition.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside
          aria-label="Module details"
          className="col-start-3 row-start-2 flex min-h-0 w-[320px] flex-col overflow-y-auto rounded-[12px] border border-[var(--color-brand-muted)] bg-[var(--surface-panel)] p-4 shadow-sm"
        >
          <div className="mb-5 flex items-center gap-3">
            <ModuleIcon
              icon={activeModule?.icon ?? 'ri-file-list-3-fill'}
              large
              tone={activeModule?.tone ?? 'purple'}
            />
            <h2 className="text-lg font-bold text-[var(--color-brand-hover)]">
              {activeModule?.title ?? 'No module selected'}
            </h2>
          </div>
          <div className="mb-5">
            <h3 className="mb-3 text-[15px] font-bold text-[var(--color-brand-hover)]">Source</h3>
            <InfoRow label="Source project">
              <span className="flex items-center gap-2">
                <SourceIcon
                  icon={
                    activeModule?.sourceTone === 'black'
                      ? 'ri-checkbox-blank-circle-line'
                      : (activeModule?.icon ?? 'ri-box-3-fill')
                  }
                  small
                  tone={activeModule?.sourceTone ?? 'black'}
                />
                <b className="text-sm text-[var(--color-brand-hover)]">
                  {activeModule?.source ?? '—'}
                </b>
              </span>
            </InfoRow>
            <InfoRow label="Module path">
              <span className="rounded-full border border-[var(--color-brand-muted)] bg-[var(--color-brand-muted)]/50 px-3 py-1 text-sm font-semibold text-[var(--color-brand)]">
                {activeModule?.title ?? '—'}
              </span>
            </InfoRow>
            <InfoRow label="Pinned commit">
              <span className="rounded-full border border-[var(--color-brand-muted)] bg-[var(--color-brand-muted)] px-3 py-1 text-[13px] font-semibold text-[var(--color-brand)]">
                {activeModule?.candidate?.source?.hash ?? 'No source selected'}
              </span>
            </InfoRow>
            <Link
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand)] hover:text-[var(--color-brand-hover)]"
              href={browseHref}
              style={{ color: 'var(--color-brand)' }}
            >
              <i className="ri-external-link-line text-lg" />
              Browse source releases
            </Link>
          </div>
          <hr className="mb-5 border-t border-[var(--color-brand-muted)]" />
          <div className="mb-5">
            <h3 className="mb-3 text-[15px] font-bold text-[var(--color-brand-hover)]">
              Module settings
            </h3>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-[var(--color-brand)]">
                Select a candidate to inspect its definition.
              </span>
            </div>
          </div>
          <hr className="mb-5 border-t border-[var(--color-brand-muted)]" />
          <div>
            <h3 className="mb-1.5 text-[15px] font-bold text-[var(--color-brand-hover)]">
              Dependencies
            </h3>
            <p className="text-xs font-medium text-[var(--color-brand)]">
              See the exact selection preview for dependencies.
            </p>
          </div>
          {!workspaces.loading &&
          !workspaces.error &&
          !workspaces.workspaces.some((item) => item.status !== 'committed') ? (
            <div className="mt-6 border-t border-[var(--color-brand-muted)] pt-4 text-xs text-[var(--color-brand-hover)]">
              Create a Workspace to review and apply this definition.
            </div>
          ) : null}
        </aside>
      </main>

      <footer className="z-10 flex shrink-0 items-center justify-between border-t border-[var(--color-brand-muted)] bg-[var(--surface-panel)] px-6 py-3 shadow-[var(--fx-shadow-sm)]">
        <div className="flex items-center gap-4 text-[var(--color-brand-hover)]">
          <label className="relative flex h-[34px] items-center gap-2 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-xs font-medium text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)] transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)]">
            <i className="ri-focus-3-line text-lg" />
            <span>{selectedWorkspaceTitle}</span>
            <i className="ri-arrow-down-s-line" />
            <select
              aria-label="Target Workspace"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(event) => setWorkspaceId(event.target.value)}
              value={workspaceId}
            >
              <option value="">Main workspace</option>
              {workspaces.workspaces
                .filter((item) => item.status !== 'committed')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
          <div className="h-4 w-px bg-[var(--color-brand-muted)]" />
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-brand-hover)]">
            <i className="ri-node-tree text-lg text-[var(--color-brand)]" />
            <span>{composition.length} modules</span>
            <span className="text-[var(--color-brand)]">•</span>
            <span>{visibleSources.length} source projects</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button
            className="flex h-[34px] items-center gap-2 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-xs font-medium text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)] transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)]"
            onClick={() => {
              preview.refresh();
              void workspaces.refresh();
            }}
            type="button"
          >
            <span
              className={`h-5 w-5 rounded-full ${data?.report.valid ? 'bg-[var(--status-success)]' : 'bg-[var(--text-tertiary)]'}`}
            />
            Check schema
          </button>
          <button
            aria-label="Review & apply"
            className="h-[34px] rounded-[5px] bg-[var(--accent-commit)] px-3 text-xs font-semibold text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--accent-commit)]/90"
            disabled={!canReview}
            onClick={openReview}
            type="button"
          >
            Review changes
          </button>
        </div>
      </footer>

      <div className="fixed bottom-4 left-1/2 z-20 flex h-[34px] -translate-x-1/2 items-center gap-1 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-1 shadow-[var(--fx-shadow-sm)]">
        <ToolButton
          icon="ri-subtract-line"
          label="Zoom out"
          onClick={() => setZoom((value) => Math.max(0.8, value - 0.05))}
        />
        <ToolButton
          icon="ri-add-line"
          label="Zoom in"
          onClick={() => setZoom((value) => Math.min(1.2, value + 0.05))}
        />
        <span className="mx-1 h-5 w-px bg-[var(--surface-card)]" />
        <ToolButton icon="ri-aspect-ratio-line" label="Fit view" onClick={() => setZoom(1)} />
        <span className="mx-1 h-5 w-px bg-[var(--surface-card)]" />
        <ToolButton
          icon="ri-download-2-line"
          label="Download definition"
          onClick={downloadDefinition}
          disabled={!data?.schema}
        />
      </div>

      <Dialog open={advanced} onOpenChange={setAdvanced}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-[min(1100px,calc(100%-2rem))]">
          <DialogHeader className="shrink-0 pr-6">
            <DialogTitle>Add modules</DialogTitle>
            <DialogDescription>
              Browse and manage the existing Studio definition sources.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 min-w-0 overflow-auto">{children}</div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !applying) setReview(undefined);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply exact definition</DialogTitle>
            <DialogDescription>
              {target?.title} · revision {review?.workspace?.revision}. Previous checks and proposed
              operations will be invalidated.
            </DialogDescription>
          </DialogHeader>
          {review ? (
            <>
              <div className="space-y-1 text-xs">
                {review.sources.map((source) => (
                  <p className="font-mono" key={source.artifactVersionId}>
                    {source.canonicalName} · {source.version}
                  </p>
                ))}
              </div>
              <StudioChanges changes={review.workspace?.changes ?? []} />
              <details className="text-xs">
                <summary className="cursor-pointer">Reviewed definition hash</summary>
                <p className="mt-2 break-all font-mono">{review.schemaHash}</p>
              </details>
              <div className="flex justify-end gap-3">
                <Button disabled={applying} onClick={() => setReview(undefined)} variant="outline">
                  Cancel
                </Button>
                <Button
                  disabled={applying || review.reviewHash !== data?.reviewHash}
                  onClick={() => void apply()}
                >
                  {applying ? 'Applying…' : 'Confirm & apply'}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {target ? (
        <Link className="sr-only" href={workspaceLink}>
          Review in Workspace <ArrowRight />
        </Link>
      ) : null}
      <button
        className="sr-only"
        disabled={!selection.length}
        onClick={() => setSelection([])}
        type="button"
      >
        Clear selection
      </button>
      <span className="sr-only">Not run</span>
      {data?.report.issues.map((issue) => (
        <span className="sr-only" key={issue.code}>
          {issue.message}
        </span>
      ))}
    </section>
  );
}

function SourceIcon({
  icon,
  tone,
  small = false,
}: {
  icon: string;
  tone: ModuleTone | 'black';
  small?: boolean;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center shadow-sm ${small ? 'h-6 w-6 rounded' : 'h-7 w-7 rounded-lg'} ${toneClasses[tone]}`}
    >
      <i className={`${icon} ${small ? 'text-sm' : 'text-sm'}`} />
    </span>
  );
}

function ModuleIcon({
  icon,
  tone,
  large = false,
}: {
  icon: string;
  tone: ModuleTone;
  large?: boolean;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center text-[var(--on-accent)] shadow-sm ${large ? 'h-8 w-8 rounded-lg' : 'h-7 w-7 rounded'} ${toneClasses[tone]}`}
    >
      <i className={`${icon} ${large ? 'text-lg' : 'text-sm'}`} />
    </span>
  );
}

function InfoRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-[13px] font-medium text-[var(--color-brand-hover)]">{label}</span>
      {children}
    </div>
  );
}

function CompositionModule({
  active,
  index,
  module,
  onOpen,
}: {
  active: boolean;
  index: number;
  module: StudioModule;
  onOpen: () => void;
}) {
  return (
    <article
      className={`group rounded-[12px] border bg-[var(--surface-panel)] p-2 ${active ? 'border-[var(--color-brand)] shadow-[var(--fx-shadow-sm)]' : 'border-[var(--color-brand-muted)] transition-colors hover:border-[var(--color-brand)]'}`}
    >
      <button
        className="flex w-full cursor-pointer items-center text-left"
        onClick={onOpen}
        type="button"
      >
        <i
          className={`ri-draggable mr-2 cursor-grab text-xl text-[var(--color-brand)] ${active ? 'opacity-100' : 'opacity-50 group-hover:opacity-100'}`}
        />
        <span className="mr-2 w-5 text-center font-mono text-xs font-semibold text-[var(--color-brand)]">
          {index + 1}
        </span>
        <span
          className={`mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--on-accent)] shadow-sm ${toneClasses[module.tone]}`}
        >
          <i className={`${module.icon} text-base`} />
        </span>
        <span className="flex-1 text-sm font-bold text-[var(--color-brand-hover)]">
          {module.title}
        </span>
        <span className="mr-3 flex items-center gap-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-hover)]/50 px-2 py-1">
          <SourceIcon
            icon={module.sourceTone === 'black' ? 'ri-checkbox-blank-circle-line' : module.icon}
            small
            tone={module.sourceTone}
          />
          <span className="text-xs font-semibold text-[var(--color-brand-hover)]">
            {module.source}
          </span>
        </span>
        <i
          className={`${active ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} mr-1 text-xl text-[var(--color-brand)]`}
        />
      </button>
      {active ? <ItemShape /> : null}
    </article>
  );
}

function ItemShape() {
  const rows = [
    ['Title', 'String', 'Required', 'Max 24 words'],
    ['Priority', 'Enum', 'Must / should / could', 'Default: should'],
    ['Acceptance', 'Array', 'Required', 'Provenance required'],
  ];
  return (
    <div className="mr-1 mb-1 ml-12 mt-2">
      <h4 className="mb-1 ml-1 text-[11px] font-semibold text-[var(--color-brand)]">Item shape</h4>
      <div className="overflow-hidden rounded-[12px] border border-dashed border-[var(--color-brand-muted)] bg-[var(--color-brand-muted)]">
        {rows.map((row, index) => (
          <div
            className={`flex items-center px-3 py-1.5 ${index < rows.length - 1 ? 'border-b border-dashed border-[var(--color-brand-muted)]/60' : ''}`}
            key={row[0]}
          >
            <b className="w-28 text-xs text-[var(--color-brand-hover)]">{row[0]}</b>
            <div className="flex flex-1 items-center gap-2">
              {row.slice(1).map((value, chipIndex) => (
                <span
                  className={`rounded-full border border-[var(--color-brand-muted)] bg-[var(--surface-panel)] px-2.5 py-0.5 text-center text-[11px] shadow-sm ${chipIndex < 2 ? 'font-semibold text-[var(--color-brand)]' : 'font-medium text-[var(--color-brand)]'} ${chipIndex === 0 ? 'w-16' : ''} ${value === 'Required' ? 'w-20' : ''}`}
                  key={value}
                >
                  {value}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-[5px] text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)]"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <i className={`${icon} text-lg`} />
    </button>
  );
}
