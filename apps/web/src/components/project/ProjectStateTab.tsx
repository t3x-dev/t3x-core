'use client';

import {
  Code2,
  FileText,
  GitCommit,
  GitCompare,
  History,
  Network,
  RotateCw,
  Search,
  TableProperties,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasWorkspace } from '@/components/canvas';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { StateBranchControls } from '@/components/project/StateBranchControls';
import { StatePrdReader } from '@/components/project/StatePrdReader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { commitHashLabel, shortHash } from '@/domain/format/formatters';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import {
  buildCanonicalStateYaml,
  buildStatePointRows,
  type StateOperationEntry,
  type StatePointRow,
  type StateValidationGapLike,
  selectPrdRenderModel,
  workspaceDraftOperationsToStateOperations,
} from '@/domain/project/stateViewModel';
import {
  getYSchemaValidationPrimaryLabel,
  type YSchemaValidationSummary,
} from '@/domain/project/yschemaValidation';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { useCommitByHash } from '@/hooks/commits/useCommitByHash';
import { useCommitOperations } from '@/hooks/commits/useCommitOperations';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useBranches } from '@/hooks/shared/useBranches';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { useCanvasStore } from '@/store/canvasStore';
import type { ApiCommit } from '@/types/api';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';
import { buildReturnTo, withReturnTo } from '@/utils/navigationReturn';

export type ProjectSnapshotView = 'structure' | 'render' | 'code';
export type ProjectStateView = ProjectSnapshotView | 'canvas';
type ProjectStateMode = 'snapshot' | 'canvas';
type BranchFocus = string;

interface ProjectStateTabProps {
  initialView?: ProjectStateView;
  onRunValidation?: (commitHash: string) => Promise<void> | void;
  projectId: string;
  projectName: string;
  validation?: YSchemaValidationSummary | null;
  validationError?: string | null;
  validationRunning?: boolean;
}

interface StateSnapshot {
  auxiliaryError: string | null;
  commits: ApiCommit[];
  headCommit: ApiCommit | null;
  loading: boolean;
  operations: StateOperationEntry[];
  primaryError: string | null;
}

const SNAPSHOT_VIEWS: Array<{
  id: ProjectSnapshotView;
  label: string;
  subtitle: string;
  icon: typeof TableProperties;
}> = [
  { id: 'structure', label: 'Structure', subtitle: 'state tree', icon: TableProperties },
  { id: 'render', label: 'Render', subtitle: 'schema reader', icon: FileText },
  { id: 'code', label: 'Code', subtitle: 'canonical code', icon: Code2 },
];

const EMPTY_BRANCH_HEADS: Readonly<Record<string, string | null>> = {};

function parseStateView(value: string | null, fallback: ProjectStateView): ProjectStateView {
  if (value === 'canvas') return 'canvas';
  if (value === 'points') return 'structure';
  return SNAPSHOT_VIEWS.some((view) => view.id === value)
    ? (value as ProjectSnapshotView)
    : fallback;
}

export function ProjectStateTab({
  initialView = 'structure',
  onRunValidation,
  projectId,
  projectName,
  validation,
  validationError,
  validationRunning = false,
}: ProjectStateTabProps) {
  const pathname = usePathname();
  const { replace: replaceRoute } = useRouter();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const routeQueryRef = useRef(routeQuery);
  routeQueryRef.current = routeQuery;
  const routeView = parseStateView(searchParams.get('view'), initialView);
  const [activeView, setActiveView] = useState<ProjectStateView>(routeView);
  const [lastSnapshotView, setLastSnapshotView] = useState<ProjectSnapshotView>(
    routeView === 'canvas' ? 'structure' : routeView
  );
  const branchFocus: BranchFocus = searchParams.get('branch')?.trim() || 'main';
  const [pathQuery, setPathQuery] = useState('');
  const [snapshotRefreshVersion, setSnapshotRefreshVersion] = useState(0);
  const {
    branchHeads = EMPTY_BRANCH_HEADS,
    branches,
    create: createBranch,
    loading: branchesLoading,
    refresh,
  } = useBranches(projectId, true);
  const projectWorkspaces = useProjectWorkspaces(projectId, true);
  const { loadCommit } = useCommitByHash();
  const { loadCommits } = useCommitsList();
  const { loadOperations } = useCommitOperations();
  const [snapshot, setSnapshot] = useState<StateSnapshot>({
    auxiliaryError: null,
    commits: [],
    headCommit: null,
    loading: true,
    operations: [],
    primaryError: null,
  });

  useEffect(() => {
    setActiveView(routeView);
    if (routeView !== 'canvas') setLastSnapshotView(routeView);
  }, [routeView]);

  const updateActiveView = useCallback(
    (view: ProjectStateView) => {
      setActiveView(view);
      if (view !== 'canvas') setLastSnapshotView(view);
      const params = new URLSearchParams(routeQueryRef.current);
      if (view === 'structure') params.delete('view');
      else params.set('view', view);
      const query = params.toString();
      replaceRoute(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, replaceRoute]
  );

  const branchOptions = useMemo(
    () =>
      mergeBranchNames([
        'main',
        branchFocus,
        ...branches,
        ...snapshot.commits.map((commit) => commit.branch),
      ]),
    [branchFocus, branches, snapshot.commits]
  );

  const updateBranchFocus = useCallback(
    (focus: BranchFocus) => {
      const params = new URLSearchParams(routeQueryRef.current);
      if (focus === 'main') params.delete('branch');
      else params.set('branch', focus);
      const query = params.toString();
      replaceRoute(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, replaceRoute]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSnapshot({
        auxiliaryError: null,
        commits: [],
        headCommit: null,
        loading: true,
        operations: [],
        primaryError: null,
      });
      try {
        const requestedBranch = branchFocus || 'main';
        const branchHeadHash = branchHeads[requestedBranch];
        let commits = await loadCommits(projectId, requestedBranch, 100);
        let headCommit = selectVisibleBranchHead(commits);
        if (branchHeadHash) {
          headCommit = await loadCommit(branchHeadHash);
          if (headCommit.hash !== branchHeadHash) {
            throw new Error('Branch HEAD response does not match the registered branch pointer.');
          }
          commits = [headCommit, ...commits.filter((commit) => commit.hash !== headCommit?.hash)];
        }
        if (commits.some((commit) => commit.project_id !== projectId)) {
          throw new Error('Commit response does not match the selected project.');
        }
        if (
          commits.some(
            (commit) => commit.hash !== branchHeadHash && commit.branch !== requestedBranch
          )
        ) {
          throw new Error('Commit response does not match the selected project and branch.');
        }
        let operations: StateOperationEntry[] = [];
        const auxiliaryErrors: string[] = [];

        if (headCommit) {
          try {
            operations = (await loadOperations(headCommit.hash)).operations;
          } catch {
            auxiliaryErrors.push('YOps log unavailable.');
          }
        }

        if (!cancelled) {
          setSnapshot({
            auxiliaryError: auxiliaryErrors.join(' ') || null,
            commits,
            headCommit,
            loading: false,
            operations,
            primaryError: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setSnapshot({
            auxiliaryError: null,
            commits: [],
            headCommit: null,
            loading: false,
            operations: [],
            primaryError: formatError(error, 'Committed state is unavailable.'),
          });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    branchFocus,
    branchHeads,
    loadCommit,
    loadCommits,
    loadOperations,
    projectId,
    snapshotRefreshVersion,
  ]);

  const headCommit = snapshot.headCommit;
  const committedWorkspace = useMemo(
    () => findCommittedWorkspaceForCommit(projectWorkspaces.workspaces, headCommit),
    [headCommit, projectWorkspaces.workspaces]
  );
  const workspaceOperations = useMemo(
    () => workspaceDraftOperationsToStateOperations(committedWorkspace?.yopsDraft.operations ?? []),
    [committedWorkspace]
  );
  const effectiveOperations =
    snapshot.operations.length > 0 ? snapshot.operations : workspaceOperations;
  const workspaceGaps = useMemo(
    () => workspaceValidationGaps(committedWorkspace),
    [committedWorkspace]
  );
  const currentValidation =
    validation && validation.commitHash === headCommit?.hash ? validation : null;
  const validationGaps = currentValidation ? currentValidation.gaps : workspaceGaps;
  const pointRows = useMemo(
    () =>
      headCommit
        ? buildStatePointRows(headCommit.content, {
            gaps: validationGaps,
            operations: effectiveOperations,
          })
        : [],
    [effectiveOperations, headCommit, validationGaps]
  );
  const filteredRows = useMemo(() => filterRows(pointRows, pathQuery), [pathQuery, pointRows]);
  const yamlText = useMemo(
    () => (headCommit ? buildCanonicalStateYaml(headCommit.content) : ''),
    [headCommit]
  );
  const renderModel = useMemo(
    () =>
      headCommit
        ? selectPrdRenderModel(headCommit.content, {
            gaps: validationGaps,
            operations: effectiveOperations,
          })
        : null,
    [effectiveOperations, headCommit, validationGaps]
  );
  const schemaName = currentValidation?.schemaName ?? inferSchemaName(headCommit);
  const validationReady = currentValidation?.status === 'verified';
  const validationGapCount = currentValidation?.gapCount ?? validationGaps.length;
  const rootKey = headCommit?.content.trees?.[0]?.key ?? 'state';
  const commitTitle = commitTitleFor(headCommit);
  const commitCount = snapshot.commits.length;
  const yopsCount = visibleYOpsCount(headCommit, effectiveOperations);
  const commitSummary = commitSummaryFor(headCommit, yopsCount);
  const branchCount = branchOptions.length;
  const stateWarning = joinWarnings(snapshot.auxiliaryError, projectWorkspaces.error);
  const currentReturnTo = buildReturnTo(pathname, routeQuery);
  const historyHref = withReturnTo(
    `/project/${encodeURIComponent(projectId)}/history?branch=${encodeURIComponent(branchFocus || 'main')}`,
    currentReturnTo
  );
  const commitHref = headCommit
    ? withReturnTo(
        `/project/${encodeURIComponent(projectId)}/commit/${encodeURIComponent(headCommit.hash)}`,
        currentReturnTo
      )
    : null;
  const parentDiffHref = headCommit?.parents[0]
    ? withReturnTo(
        `/project/${encodeURIComponent(projectId)}/diff?base=${encodeURIComponent(headCommit.parents[0])}&target=${encodeURIComponent(headCommit.hash)}`,
        currentReturnTo
      )
    : null;
  const workspaceHref = `${getProjectRepoPath({ id: projectId, name: projectName })}/workspaces`;
  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--surface-app)] p-4"
      data-state-view={activeView}
    >
      <StateModeTabs
        activeMode={activeView === 'canvas' ? 'canvas' : 'snapshot'}
        onModeChange={(mode) => updateActiveView(mode === 'canvas' ? 'canvas' : lastSnapshotView)}
      />

      {activeView !== 'canvas' ? (
        <div className="mt-4">
          <StateOverviewHeader
            branch={branchFocus || 'main'}
            headCommit={headCommit}
            onRunValidation={
              headCommit && onRunValidation ? () => onRunValidation(headCommit.hash) : undefined
            }
            schemaLabel={schemaLabel(schemaName)}
            validation={currentValidation}
            validationError={validationError}
            validationGapCount={validationGapCount}
            validationReady={validationReady}
            validationRunning={validationRunning}
            workspaceHref={workspaceHref}
          />
        </div>
      ) : null}

      <div
        className={cn(
          'mt-4 grid min-h-0 flex-1 gap-4',
          activeView !== 'render' && activeView !== 'canvas' && 'xl:grid-cols-[minmax(0,1fr)_330px]'
        )}
      >
        <main className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm">
          <StateRepositoryToolbar
            branch={branchFocus || 'main'}
            branchCount={branchCount}
            branchOptions={branchOptions}
            headCommitHash={headCommit?.hash ?? null}
            historyHref={historyHref}
            loading={branchesLoading || projectWorkspaces.loading || snapshot.loading}
            onBranchChange={updateBranchFocus}
            onCreateBranch={createBranch}
            onRefresh={() => {
              setSnapshotRefreshVersion((version) => version + 1);
              void refresh();
              void projectWorkspaces.refresh();
            }}
            schemaName={schemaName}
          />
          {activeView !== 'canvas' ? (
            <>
              <StateCommitRow
                commitCount={commitCount}
                hash={headCommit?.hash ?? null}
                relativeTime={formatRelativeTime(headCommit?.committed_at)}
                summary={commitSummary}
                title={commitTitle}
                yopsCount={yopsCount}
              />
              <StateObjectLine
                activeView={activeView}
                commitHref={commitHref}
                headCommit={headCommit}
                parentDiffHref={parentDiffHref}
                rootKey={rootKey}
                validationGapCount={validationGapCount}
                validationKnown={Boolean(currentValidation)}
              />
              <StateViewTabs activeView={activeView} onViewChange={updateActiveView} />

              {snapshot.primaryError ? (
                <StateEmpty message={snapshot.primaryError} title="No committed state loaded" />
              ) : null}
              {!snapshot.primaryError && !snapshot.loading && !headCommit ? (
                <StateEmpty
                  message="Create or select a committed branch to inspect state as Structure, Render, or Code."
                  title="No commit on this branch"
                />
              ) : null}
              {!snapshot.primaryError && snapshot.loading ? (
                <StateEmpty
                  message="Loading commit, YOps, and validation context."
                  title="Loading state"
                />
              ) : null}
              {!snapshot.primaryError && !snapshot.loading && headCommit ? (
                <>
                  {activeView === 'structure' ? (
                    <StateStructureView
                      onPathQueryChange={setPathQuery}
                      pathQuery={pathQuery}
                      rows={filteredRows}
                    />
                  ) : null}
                  {activeView === 'render' && renderModel ? (
                    <StatePrdReader
                      model={renderModel}
                      schemaName={schemaName}
                      validationGapCount={validationGapCount}
                      validationReady={validationReady}
                      yamlText={yamlText}
                    />
                  ) : null}
                  {activeView === 'code' ? <StateCodeView yamlText={yamlText} /> : null}
                </>
              ) : null}
            </>
          ) : (
            <StateCanvasView
              branch={branchFocus || 'main'}
              projectId={projectId}
              projectName={projectName}
            />
          )}
        </main>

        {activeView !== 'render' && activeView !== 'canvas' ? (
          <StateContextRail
            commitCount={commitCount}
            edgeCount={headCommit?.content.relations.length ?? 0}
            headCommit={headCommit}
            operations={effectiveOperations}
            projectName={projectName}
            schemaName={schemaName}
            validation={currentValidation}
            validationGapCount={validationGapCount}
            validationReady={validationReady}
            warning={stateWarning}
          />
        ) : null}
      </div>
    </section>
  );
}

function StateOverviewHeader({
  branch,
  headCommit,
  onRunValidation,
  schemaLabel,
  validation,
  validationError,
  validationGapCount,
  validationReady,
  validationRunning,
  workspaceHref,
}: {
  branch: string;
  headCommit: ApiCommit | null;
  onRunValidation?: () => Promise<void> | void;
  schemaLabel: string;
  validation?: YSchemaValidationSummary | null;
  validationError?: string | null;
  validationGapCount: number;
  validationReady: boolean;
  validationRunning: boolean;
  workspaceHref: string;
}) {
  return (
    <section
      aria-label="State overview"
      className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight text-[var(--text-primary)]">State</h1>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Current state from latest successful commit
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="canvas-outline">
            <Link href={workspaceHref}>Open workspace</Link>
          </Button>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
        <StateFact label="Schema" value={schemaLabel} />
        <StateFact label="Branch" value={branch} />
        <StateFact
          label="State"
          mono
          value={headCommit?.hash ? 'sha256:' + shortHash(headCommit.hash) : 'empty'}
        />
        <div className="min-w-0">
          <dt className="text-xs font-bold uppercase text-[var(--text-tertiary)]">Validation</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2">
            <Badge
              variant={validationReady ? 'success' : validationGapCount > 0 ? 'warning' : 'outline'}
            >
              {validationLabel(validation, validationGapCount)}
            </Badge>
            {validation ? (
              <Badge variant="success">Up to date</Badge>
            ) : headCommit ? (
              <Badge variant="outline">Not validated at HEAD</Badge>
            ) : null}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {validationError ? (
          <p className="text-xs font-semibold text-[var(--status-warning)]">{validationError}</p>
        ) : null}
        {!validationReady && onRunValidation ? (
          <Button
            disabled={validationRunning}
            onClick={onRunValidation}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <RotateCw className={cn('size-4', validationRunning && 'animate-spin')} />
            {validationRunning ? 'Running...' : 'Run validation'}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function StateFact({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={cn(
          'mt-1 inline-flex max-w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 py-1 text-xs font-bold text-[var(--text-primary)]',
          mono && 'font-mono'
        )}
      >
        <span className="truncate">{value}</span>
      </dd>
    </div>
  );
}

function StateRepositoryToolbar({
  branch,
  branchCount,
  branchOptions,
  headCommitHash,
  historyHref,
  loading,
  onBranchChange,
  onCreateBranch,
  onRefresh,
  schemaName,
}: {
  branch: string;
  branchCount: number;
  branchOptions: string[];
  headCommitHash: string | null;
  historyHref: string;
  loading: boolean;
  onBranchChange: (branch: string) => void;
  onCreateBranch: (name: string, parentBranch: string) => Promise<void>;
  onRefresh: () => void;
  schemaName: string;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <StateBranchControls
          branch={branch}
          branchOptions={branchOptions}
          headCommitHash={headCommitHash}
          onBranchChange={onBranchChange}
          onCreateBranch={onCreateBranch}
        />
        <Badge variant="branch">{branchCount} branches</Badge>
        <Badge variant="outline">{schemaName}</Badge>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="canvas-outline">
          <Link href={historyHref}>
            <History className="size-4" />
            History
          </Link>
        </Button>
        <Button
          disabled={loading}
          onClick={onRefresh}
          size="sm"
          type="button"
          variant="canvas-outline"
        >
          <RotateCw className={cn('size-4', loading && 'animate-spin')} />
          {loading ? 'Refreshing' : 'Refresh'}
        </Button>
      </div>
    </div>
  );
}

function StateCommitRow({
  commitCount,
  hash,
  relativeTime,
  summary,
  title,
  yopsCount,
}: {
  commitCount: number;
  hash: string | null;
  relativeTime: string;
  summary: string;
  title: string;
  yopsCount: number;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-branch)]/15 text-sm font-bold text-[var(--accent-branch)]">
          W
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-bold text-[var(--text-primary)]">{title}</h2>
            <Badge variant="outline">{yopsCount} YOps</Badge>
          </div>
          <p className="truncate text-xs text-[var(--text-secondary)]">{summary}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--text-secondary)]">
        <span className="font-mono">{hash ? commitHashLabel(hash) : 'empty'}</span>
        <span>{relativeTime}</span>
        <Badge variant="outline">{commitCount} commits</Badge>
      </div>
    </div>
  );
}

function StateObjectLine({
  activeView,
  commitHref,
  headCommit,
  parentDiffHref,
  rootKey,
  validationGapCount,
  validationKnown,
}: {
  activeView: ProjectStateView;
  commitHref: string | null;
  headCommit: ApiCommit | null;
  parentDiffHref: string | null;
  rootKey: string;
  validationGapCount: number;
  validationKnown: boolean;
}) {
  return (
    <div className="flex min-h-13 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 py-2.5">
      <div className="min-w-0 truncate font-mono text-sm text-[var(--text-secondary)]">
        state <span className="font-bold text-[var(--text-primary)]">prd-state.yaml</span> /{' '}
        <span className="font-bold text-[var(--text-primary)]">{rootKey}</span>
        <Badge className="ml-2 font-mono" variant="commit">
          HEAD {headCommit?.hash ? commitHashLabel(headCommit.hash) : 'empty'}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="pending-subtle">adapter prd.document</Badge>
        <Badge
          variant={validationGapCount > 0 ? 'warning' : validationKnown ? 'success' : 'outline'}
        >
          {validationGapCount > 0
            ? String(validationGapCount) + ' validation gap'
            : validationKnown
              ? 'validated'
              : 'not validated'}
        </Badge>
        <Badge variant="outline">{activeView}</Badge>
        {commitHref ? (
          <Button asChild size="sm" variant="canvas-outline">
            <Link href={commitHref}>Open commit</Link>
          </Button>
        ) : null}
        {parentDiffHref ? (
          <Button asChild size="sm" variant="canvas-outline">
            <Link href={parentDiffHref}>
              <GitCompare className="size-4" />
              Parent diff
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StateModeTabs({
  activeMode,
  onModeChange,
}: {
  activeMode: ProjectStateMode;
  onModeChange: (mode: ProjectStateMode) => void;
}) {
  const modes: Array<{
    id: ProjectStateMode;
    icon: typeof GitCommit;
    label: string;
    subtitle: string;
  }> = [
    {
      id: 'snapshot',
      icon: GitCommit,
      label: 'Snapshot',
      subtitle: 'one committed state',
    },
    {
      id: 'canvas',
      icon: Network,
      label: 'Canvas',
      subtitle: 'multi-commit evolution',
    },
  ];

  return (
    <div
      aria-label="State modes"
      className="flex min-h-16 items-stretch rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 shadow-sm"
      role="tablist"
    >
      {modes.map((mode) => {
        const Icon = mode.icon;
        const selected = activeMode === mode.id;
        return (
          <button
            aria-selected={selected}
            className={cn(
              'min-w-36 border-b-2 px-3 py-2 text-left transition-colors',
              selected
                ? 'border-[var(--accent-commit)] text-[var(--accent-commit)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            role="tab"
            type="button"
          >
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <Icon aria-hidden="true" className="size-4" />
              {mode.label}
            </span>
            <span className="mt-0.5 block text-xs font-bold text-[var(--text-tertiary)]">
              {mode.subtitle}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StateViewTabs({
  activeView,
  onViewChange,
}: {
  activeView: ProjectSnapshotView;
  onViewChange: (view: ProjectSnapshotView) => void;
}) {
  return (
    <div
      aria-label="State views"
      className="flex min-h-14 items-center justify-between gap-2 overflow-x-auto border-b border-[var(--stroke-divider)] px-4"
      role="tablist"
    >
      <div className="flex shrink-0 items-stretch gap-0">
        {SNAPSHOT_VIEWS.map((view) => {
          const Icon = view.icon;
          const selected = activeView === view.id;
          return (
            <button
              aria-selected={selected}
              className={cn(
                'min-w-28 border-b-2 px-3 py-2 text-left transition-colors',
                selected
                  ? 'border-[var(--accent-commit)] text-[var(--accent-commit)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
              key={view.id}
              onClick={() => onViewChange(view.id)}
              role="tab"
              type="button"
            >
              <span className="flex items-center gap-1.5 text-sm font-bold">
                <Icon aria-hidden="true" className="size-4" />
                {view.label}
              </span>
              <span className="mt-0.5 block text-xs font-bold text-[var(--text-tertiary)]">
                {view.subtitle}
              </span>
            </button>
          );
        })}
      </div>
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <Badge variant="pending-subtle">adapter prd.document</Badge>
        <Badge variant="commit-subtle">canonical YAML</Badge>
      </div>
    </div>
  );
}

function StateCanvasView({
  branch,
  projectId,
  projectName,
}: {
  branch: string;
  projectId: string;
  projectName: string;
}) {
  const canvasProjectId = useCanvasStore((state) => state.projectId);
  const canvasLoading = useCanvasStore((state) => state.loading);
  const canvasError = useCanvasStore((state) => state.loadError);
  const { load: loadCanvas } = useCanvasNodeActions();

  if (canvasLoading || canvasProjectId !== projectId) {
    return (
      <section
        aria-label="Multi-commit state canvas"
        className="flex min-h-[560px] items-center justify-center"
      >
        <LoadingSpinner message="Loading state evolution..." />
      </section>
    );
  }

  if (canvasError) {
    return (
      <section
        aria-label="Multi-commit state canvas"
        className="flex min-h-[560px] items-center justify-center p-6"
      >
        <ErrorMessage error={canvasError} onRetry={() => void loadCanvas(projectId)} />
      </section>
    );
  }

  return (
    <section
      aria-label="Multi-commit state canvas"
      className="h-[680px] min-h-[560px] overflow-hidden xl:h-[calc(100vh-21rem)]"
    >
      <CanvasWorkspace embedded focusedBranch={branch} projectName={projectName} />
    </section>
  );
}

function StateStructureView({
  onPathQueryChange,
  pathQuery,
  rows,
}: {
  onPathQueryChange: (query: string) => void;
  pathQuery: string;
  rows: StatePointRow[];
}) {
  return (
    <section aria-label="Structured state tree" className="min-h-[460px]">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 py-2">
        <label className="relative h-9 w-full max-w-[260px]">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <input
            className="h-full w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            onChange={(event) => onPathQueryChange(event.target.value)}
            placeholder="Search paths, titles, types..."
            value={pathQuery}
          />
        </label>
      </div>
      <div className="overflow-auto">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="bg-[var(--surface-card)] text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            <tr>
              <th className="w-[34%] border-b border-[var(--stroke-divider)] px-4 py-3">
                Path / Key
              </th>
              <th className="w-[12%] border-b border-[var(--stroke-divider)] px-3 py-3">Type</th>
              <th className="w-[25%] border-b border-[var(--stroke-divider)] px-3 py-3">Value</th>
              <th className="w-[12%] border-b border-[var(--stroke-divider)] px-3 py-3">Status</th>
              <th className="w-[12%] border-b border-[var(--stroke-divider)] px-3 py-3">
                Source / Op
              </th>
              <th className="w-[5%] border-b border-[var(--stroke-divider)] px-3 py-3">Issues</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <StatePointTableRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatePointTableRow({ row }: { row: StatePointRow }) {
  return (
    <tr
      className={cn(
        'border-b border-[var(--stroke-divider)] text-[var(--text-primary)]',
        row.status === 'missing' && 'bg-[var(--status-warning-muted)]/25'
      )}
    >
      <td className="px-4 py-2.5 font-bold">
        <span
          className="flex min-w-0 items-center gap-2"
          style={{ paddingLeft: 4 + row.depth * 18 }}
        >
          <span className="w-3 shrink-0 font-mono text-xs text-[var(--text-tertiary)]">
            {row.expandable ? '›' : ''}
          </span>
          <span className="truncate">{row.key}</span>
        </span>
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-[var(--text-secondary)]">{row.type}</td>
      <td className="truncate px-3 py-2.5 text-xs text-[var(--text-secondary)]">{row.value}</td>
      <td className="px-3 py-2.5">
        <StatusPill row={row} />
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-[var(--text-secondary)]">{row.sourceOp}</td>
      <td className="px-3 py-2.5 text-center">
        {row.issueCount > 0 ? (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--status-danger)] text-xs font-bold text-[var(--on-status)]">
            {row.issueCount}
          </span>
        ) : (
          <span className="text-[var(--text-tertiary)]">-</span>
        )}
      </td>
    </tr>
  );
}

function StatusPill({ row }: { row: StatePointRow }) {
  const tone =
    row.status === 'missing'
      ? 'border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
      : row.status === 'set' || row.status === 'created'
        ? 'border-[var(--status-success)]/30 bg-[var(--status-success-muted)] text-[var(--status-success)]'
        : row.status === 'changed'
          ? 'border-[var(--accent-pending)]/30 bg-[var(--accent-pending)]/10 text-[var(--accent-pending)]'
          : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-tertiary)]';
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-bold', tone)}>
      {row.statusLabel}
    </span>
  );
}

function StateCodeView({ yamlText }: { yamlText: string }) {
  const lines = yamlText.split('\n');
  return (
    <section
      aria-label="YAML code view"
      className="min-h-[560px] bg-[var(--surface-card)] px-6 py-5"
    >
      <pre className="overflow-auto rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 font-mono text-sm leading-6 text-[var(--text-primary)]">
        {lines.map((line, index) => (
          <div className="grid grid-cols-[44px_minmax(0,1fr)]" key={String(index)}>
            <span className="select-none pr-4 text-right text-[var(--text-tertiary)]">
              {index + 1}
            </span>
            <code className="whitespace-pre-wrap">{line}</code>
          </div>
        ))}
      </pre>
    </section>
  );
}

function StateEmpty({ message, title }: { message: string; title: string }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center p-8 text-center">
      <div>
        <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">{message}</p>
      </div>
    </div>
  );
}

function StateContextRail({
  commitCount,
  edgeCount,
  headCommit,
  operations,
  projectName,
  schemaName,
  validation,
  validationGapCount,
  validationReady,
  warning,
}: {
  commitCount: number;
  edgeCount: number;
  headCommit: ApiCommit | null;
  operations: StateOperationEntry[];
  projectName: string;
  schemaName: string;
  validation?: YSchemaValidationSummary | null;
  validationGapCount: number;
  validationReady: boolean;
  warning: string | null;
}) {
  return (
    <aside className="grid content-start gap-4">
      <RailCard title="About this state">
        <p>
          Structured state extracted from source evidence and changed through YOps. The current HEAD
          is readable, but output readiness depends on YSchema.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="pending-subtle">prd</Badge>
          <Badge variant="outline">yaml</Badge>
          <Badge variant="branch">branch</Badge>
          <Badge variant={validationReady ? 'success' : 'warning'}>
            {validationReady ? 'output-ready' : 'output blocked'}
          </Badge>
        </div>
      </RailCard>
      <RailCard title="View model">
        <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-sm">
          <RailRow label="Structure" value="YAML-shaped state tree" />
          <RailRow label="Render" value="Schema-selected reader" />
          <RailRow label="Code" value="Canonical committed state" />
        </dl>
        <p className="mt-3">
          Structure keeps the YAML form intact as nodes. Render is a schema projection, not a new
          authoring surface.
        </p>
      </RailCard>
      <RailCard title="State metadata">
        <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-sm">
          <RailRow label="Project" value={projectName} />
          <RailRow label="HEAD" mono value={headCommit?.hash ?? 'empty'} />
          <RailRow label="Parent" mono value={headCommit?.parents?.[0] ?? 'none'} />
          <RailRow label="Schema" value={schemaName} />
          <RailRow label="Readiness" value={validationLabel(validation, validationGapCount)} />
          <RailRow label="Commits" value={String(commitCount)} />
          <RailRow label="YOps" value={String(operations.length)} />
          <RailRow label="Edges" value={String(edgeCount)} />
        </dl>
        {warning ? (
          <p className="mt-3 text-xs font-semibold text-[var(--status-warning)]">{warning}</p>
        ) : null}
      </RailCard>
    </aside>
  );
}

function RailCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-bold text-[var(--text-primary)]">{title}</h2>
      <div className="text-sm leading-5 text-[var(--text-secondary)]">{children}</div>
    </section>
  );
}

function RailRow({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <>
      <dt className="font-bold text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate font-bold text-[var(--text-primary)]',
          mono && 'font-mono text-xs'
        )}
      >
        {value}
      </dd>
    </>
  );
}

function selectVisibleBranchHead(commits: ApiCommit[]): ApiCommit | null {
  if (commits.length === 0) return null;
  const firstParentHashes = new Set(commits.map((commit) => commit.parents[0]).filter(Boolean));
  const tips = commits.filter((commit) => !firstParentHashes.has(commit.hash));
  return [...(tips.length > 0 ? tips : commits)].sort(
    (a, b) =>
      Date.parse(b.committed_at) - Date.parse(a.committed_at) || b.hash.localeCompare(a.hash)
  )[0]!;
}

function mergeBranchNames(names: string[]): string[] {
  return Array.from(new Set(names.filter(Boolean))).sort((a, b) => {
    if (a === 'main') return -1;
    if (b === 'main') return 1;
    return a.localeCompare(b);
  });
}

function findCommittedWorkspaceForCommit(
  workspaces: WorkspaceCandidate[],
  commit: ApiCommit | null
): WorkspaceCandidate | null {
  if (!commit) return null;
  return (
    workspaces.find(
      (workspace) => workspace.status === 'committed' && workspace.lastCommitHash === commit.hash
    ) ?? null
  );
}

function workspaceValidationGaps(workspace: WorkspaceCandidate | null): StateValidationGapLike[] {
  return workspace?.schemaReview.gaps.map((path) => ({ path })) ?? [];
}

function visibleYOpsCount(commit: ApiCommit | null, operations: StateOperationEntry[]): number {
  const committedCount = commit?.yops_log_ids?.length ?? 0;
  return committedCount > 0 ? committedCount : operations.length;
}

function joinWarnings(...warnings: Array<string | null | undefined>): string | null {
  const message = warnings.filter(Boolean).join(' ');
  return message || null;
}

function filterRows(rows: StatePointRow[], query: string): StatePointRow[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;
  return rows.filter((row) =>
    [row.path, row.key, row.type, row.value, row.statusLabel].some((value) =>
      value.toLowerCase().includes(normalized)
    )
  );
}

function commitTitleFor(commit: ApiCommit | null): string {
  if (!commit) return 'No committed state';
  const title = commit.content.trees?.[0]?.slots?.title;
  return commit.message || (typeof title === 'string' && title.trim() ? title : 'State committed');
}

function commitSummaryFor(commit: ApiCommit | null, yopsCount: number): string {
  if (!commit) return 'Select a branch with committed state.';
  return (
    commitHashLabel(commit.hash) +
    ' from workspace source and ' +
    String(yopsCount) +
    ' deterministic YOps'
  );
}

function validationLabel(
  validation: YSchemaValidationSummary | null | undefined,
  gapCount: number
): string {
  if (!validation && gapCount > 0) return String(gapCount) + ' required field missing';
  if (!validation) return 'YSchema pending';
  if (gapCount === 1) return '1 required field missing';
  if (gapCount > 1) return String(gapCount) + ' required fields missing';
  return getYSchemaValidationPrimaryLabel(validation);
}

function inferSchemaName(commit: ApiCommit | null): string {
  const rootKey = commit?.content.trees?.[0]?.key;
  return rootKey === 'prd' ? 't3x/prd' : 't3x/state';
}

function schemaLabel(schemaName: string): string {
  if (schemaName === 't3x/prd') return 'PRD Schema v2';
  return schemaName;
}

function formatRelativeTime(value: string | undefined): string {
  if (!value) return 'not committed';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'recently';
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return String(diffMinutes) + ' min ago';
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) return String(diffHours) + ' hours ago';
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 14) return String(diffDays) + ' days ago';
  return new Date(timestamp).toLocaleDateString();
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
