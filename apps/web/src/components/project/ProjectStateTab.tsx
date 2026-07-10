'use client';

import { Code2, FileText, History, RotateCw, Search, TableProperties } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { commitHashLabel, shortHash } from '@/domain/format/formatters';
import {
  buildCanonicalStateYaml,
  buildStatePointRows,
  type PrdRenderModel,
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
import { useCommitOperations } from '@/hooks/commits/useCommitOperations';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useLeavesByCommit } from '@/hooks/commits/useLeavesByCommit';
import { useBranches } from '@/hooks/shared/useBranches';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import type { ApiCommit, Leaf } from '@/types/api';
import type { CanvasNodeData } from '@/types/nodes';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';

export type ProjectStateView = 'points' | 'render' | 'code';
type BranchFocus = string;

interface ProjectStateTabProps {
  children: ReactNode;
  initialView?: ProjectStateView;
  onRunValidation?: () => Promise<void> | void;
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
  leaves: Leaf[];
  loading: boolean;
  operations: StateOperationEntry[];
  primaryError: string | null;
}

interface StateCommitFallback {
  branch: string;
  hash: string;
  id: string;
  leafCount: number;
  summary: string;
  timestamp: string;
  title: string;
}

const STATE_VIEWS: Array<{
  id: ProjectStateView;
  label: string;
  subtitle: string;
  icon: typeof TableProperties;
}> = [
  { id: 'points', label: 'Points', subtitle: 'YAML nodes', icon: TableProperties },
  { id: 'render', label: 'Render', subtitle: 'schema reader', icon: FileText },
  { id: 'code', label: 'Code', subtitle: 'canonical code', icon: Code2 },
];

export function ProjectStateTab({
  initialView = 'points',
  onRunValidation,
  projectId,
  projectName,
  validation,
  validationError,
  validationRunning = false,
}: ProjectStateTabProps) {
  const activeChatBranch = useChatStore((state) => state.activeBranch);
  const setActiveBranch = useChatStore((state) => state.setActiveBranch);
  const commitBranch = useCommitStore((state) => state.commitBranch);
  const setCommitBranch = useCommitStore((state) => state.setCommitBranch);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const fallbackBranch = activeChatBranch || commitBranch || 'main';
  const [activeView, setActiveView] = useState<ProjectStateView>(initialView);
  const [branchFocus, setBranchFocus] = useState<BranchFocus>(fallbackBranch);
  const [pathQuery, setPathQuery] = useState('');
  const { branches, loading: branchesLoading, refresh } = useBranches(projectId, true);
  const projectWorkspaces = useProjectWorkspaces(projectId, true);
  const { loadCommits } = useCommitsList();
  const { loadLeaves } = useLeavesByCommit();
  const { loadOperations } = useCommitOperations();
  const [snapshot, setSnapshot] = useState<StateSnapshot>({
    auxiliaryError: null,
    commits: [],
    headCommit: null,
    leaves: [],
    loading: true,
    operations: [],
    primaryError: null,
  });

  const canvasCommits = useMemo(() => collectStateCommits(nodes), [nodes]);
  const branchOptions = useMemo(
    () =>
      mergeBranchNames([
        'main',
        fallbackBranch,
        branchFocus,
        ...branches,
        ...canvasCommits.map((commit) => commit.branch),
        ...snapshot.commits.map((commit) => commit.branch),
      ]),
    [branchFocus, branches, canvasCommits, fallbackBranch, snapshot.commits]
  );

  useEffect(() => {
    if (!branchFocus && fallbackBranch) setBranchFocus(fallbackBranch);
  }, [branchFocus, fallbackBranch]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSnapshot((current) => ({ ...current, loading: true, primaryError: null }));
      try {
        const requestedBranch = branchFocus || fallbackBranch;
        let commits = await loadCommits(projectId, requestedBranch, 100);
        if (commits.length === 0 && requestedBranch === 'main') {
          const latestCommits = await loadCommits(projectId, undefined, 100);
          const latestBranch = latestCommits[0]?.branch;
          if (latestBranch) {
            commits = latestCommits.filter((commit) => commit.branch === latestBranch);
            if (latestBranch !== requestedBranch) {
              setBranchFocus(latestBranch);
              setActiveBranch(latestBranch);
              setCommitBranch(latestBranch);
            }
          }
        }
        const headCommit = commits[0] ?? null;
        let leaves: Leaf[] = [];
        let operations: StateOperationEntry[] = [];
        const auxiliaryErrors: string[] = [];

        if (headCommit) {
          const [leafResult, operationsResult] = await Promise.allSettled([
            loadLeaves(headCommit.hash),
            loadOperations(headCommit.hash),
          ]);
          if (leafResult.status === 'fulfilled') {
            leaves = leafResult.value;
          } else {
            auxiliaryErrors.push('Leaf outputs unavailable.');
          }
          if (operationsResult.status === 'fulfilled') {
            operations = operationsResult.value.operations;
          } else {
            auxiliaryErrors.push('YOps log unavailable.');
          }
        }

        if (!cancelled) {
          setSnapshot({
            auxiliaryError: auxiliaryErrors.join(' ') || null,
            commits,
            headCommit,
            leaves,
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
            leaves: [],
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
  }, [branchFocus, fallbackBranch, loadCommits, loadLeaves, loadOperations, projectId]);

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
  const validationGaps = validation?.gaps?.length ? validation.gaps : workspaceGaps;
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
    () => (headCommit ? selectPrdRenderModel(headCommit.content, { gaps: validationGaps }) : null),
    [headCommit, validationGaps]
  );
  const schemaName = validation?.schemaName ?? inferSchemaName(headCommit);
  const validationReady = validation?.status === 'verified';
  const validationGapCount = validation?.gapCount ?? validationGaps.length;
  const rootKey = headCommit?.content.trees?.[0]?.key ?? 'state';
  const commitTitle = commitTitleFor(headCommit);
  const commitCount = snapshot.commits.length || canvasCommits.length;
  const yopsCount = visibleYOpsCount(headCommit, effectiveOperations);
  const commitSummary = commitSummaryFor(headCommit, yopsCount);
  const branchCount = branchOptions.length;
  const stateWarning = joinWarnings(snapshot.auxiliaryError, projectWorkspaces.error);

  const handleBranchFocusChange = (focus: BranchFocus) => {
    setBranchFocus(focus);
    setActiveBranch(focus);
    setCommitBranch(focus);
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-auto bg-[var(--surface-app)] p-4"
      data-state-view={activeView}
    >
      <StateOverviewHeader
        branch={branchFocus || fallbackBranch}
        headCommit={headCommit}
        onOpenWorkspace={() => undefined}
        onRunValidation={onRunValidation}
        schemaLabel={schemaLabel(schemaName)}
        validation={validation}
        validationError={validationError}
        validationGapCount={validationGapCount}
        validationReady={validationReady}
        validationRunning={validationRunning}
      />

      <div className="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <main className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm">
          <StateRepositoryToolbar
            branch={branchFocus || fallbackBranch}
            branchCount={branchCount}
            branchOptions={branchOptions}
            commitCount={commitCount}
            loading={branchesLoading || projectWorkspaces.loading || snapshot.loading}
            onBranchChange={handleBranchFocusChange}
            onCompare={() => setActiveView('points')}
            onRefresh={() => {
              void refresh();
              void projectWorkspaces.refresh();
            }}
            schemaName={schemaName}
          />
          <StateCommitRow
            commitCount={commitCount}
            hash={headCommit?.hash ?? canvasCommits[0]?.hash ?? null}
            relativeTime={formatRelativeTime(
              headCommit?.committed_at ?? canvasCommits[0]?.timestamp
            )}
            summary={commitSummary}
            title={commitTitle}
            yopsCount={yopsCount}
          />
          <StateObjectLine
            activeView={activeView}
            headCommit={headCommit}
            rootKey={rootKey}
            validationGapCount={validationGapCount}
          />
          <StateViewTabs activeView={activeView} onViewChange={setActiveView} />

          {snapshot.primaryError ? (
            <StateEmpty message={snapshot.primaryError} title="No committed state loaded" />
          ) : null}
          {!snapshot.primaryError && !snapshot.loading && !headCommit ? (
            <StateEmpty
              message="Create or select a committed branch to inspect state as Points, Render, or Code."
              title="No commit on this branch"
            />
          ) : null}
          {!snapshot.primaryError && snapshot.loading ? (
            <StateEmpty
              message="Loading commit, YOps, leaves, and validation context."
              title="Loading state"
            />
          ) : null}
          {!snapshot.primaryError && !snapshot.loading && headCommit ? (
            <>
              {activeView === 'points' ? (
                <StatePointsView
                  onPathQueryChange={setPathQuery}
                  pathQuery={pathQuery}
                  rows={filteredRows}
                />
              ) : null}
              {activeView === 'render' && renderModel ? (
                <StateRenderView model={renderModel} />
              ) : null}
              {activeView === 'code' ? <StateCodeView yamlText={yamlText} /> : null}
            </>
          ) : null}
        </main>

        <StateContextRail
          branch={branchFocus || fallbackBranch}
          commitCount={commitCount}
          edgeCount={edges.length}
          headCommit={headCommit}
          leaves={snapshot.leaves}
          operations={effectiveOperations}
          projectName={projectName}
          schemaName={schemaName}
          validation={validation}
          validationGapCount={validationGapCount}
          validationReady={validationReady}
          warning={stateWarning}
        />
      </div>
    </section>
  );
}

function StateOverviewHeader({
  branch,
  headCommit,
  onOpenWorkspace,
  onRunValidation,
  schemaLabel,
  validation,
  validationError,
  validationGapCount,
  validationReady,
  validationRunning,
}: {
  branch: string;
  headCommit: ApiCommit | null;
  onOpenWorkspace: () => void;
  onRunValidation?: () => Promise<void> | void;
  schemaLabel: string;
  validation?: YSchemaValidationSummary | null;
  validationError?: string | null;
  validationGapCount: number;
  validationReady: boolean;
  validationRunning: boolean;
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
          <Button onClick={onOpenWorkspace} size="sm" type="button" variant="canvas-outline">
            Open workspace
          </Button>
          <Button size="sm" type="button">
            Change review dock
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
            <Badge variant="success">Up to date</Badge>
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
  commitCount,
  loading,
  onBranchChange,
  onCompare,
  onRefresh,
  schemaName,
}: {
  branch: string;
  branchCount: number;
  branchOptions: string[];
  commitCount: number;
  loading: boolean;
  onBranchChange: (branch: string) => void;
  onCompare: () => void;
  onRefresh: () => void;
  schemaName: string;
}) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="inline-flex h-9 min-w-0 items-center gap-2 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 text-sm font-bold text-[var(--text-primary)]">
          <span className="font-mono text-xs text-[var(--text-tertiary)]">branch</span>
          <select
            aria-label="Branch focus"
            className="min-w-0 bg-transparent font-mono text-sm font-bold outline-none"
            onChange={(event) => onBranchChange(event.target.value)}
            value={branch}
          >
            {branchOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <Badge variant="branch">{branchCount} branches</Badge>
        <Badge variant="outline">{schemaName}</Badge>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="relative h-9 min-w-[220px] flex-1 md:flex-none">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <input
            className="h-full w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            placeholder="Find path"
            readOnly
          />
        </label>
        <Button size="sm" type="button" variant="canvas-outline">
          Open workspace
        </Button>
        <Button size="sm" type="button" variant="canvas-outline">
          Graph
        </Button>
        <Button onClick={onCompare} size="sm" type="button">
          Compare
        </Button>
        <Button
          disabled={loading}
          onClick={onRefresh}
          size="sm"
          type="button"
          variant="canvas-outline"
        >
          {loading ? 'Loading' : String(commitCount) + ' commits'}
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
  headCommit,
  rootKey,
  validationGapCount,
}: {
  activeView: ProjectStateView;
  headCommit: ApiCommit | null;
  rootKey: string;
  validationGapCount: number;
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
        <Badge variant={validationGapCount > 0 ? 'warning' : 'success'}>
          {validationGapCount > 0 ? String(validationGapCount) + ' validation gap' : 'validated'}
        </Badge>
        <Badge variant="outline">{activeView}</Badge>
        <Button size="sm" type="button" variant="canvas-outline">
          <History className="size-4" />
          History
        </Button>
        <Button size="sm" type="button" variant="canvas-outline">
          Copy path
        </Button>
      </div>
    </div>
  );
}

function StateViewTabs({
  activeView,
  onViewChange,
}: {
  activeView: ProjectStateView;
  onViewChange: (view: ProjectStateView) => void;
}) {
  return (
    <div
      aria-label="State views"
      className="flex min-h-14 items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4"
      role="tablist"
    >
      <div className="flex min-w-0 items-stretch gap-0">
        {STATE_VIEWS.map((view) => {
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

function StatePointsView({
  onPathQueryChange,
  pathQuery,
  rows,
}: {
  onPathQueryChange: (query: string) => void;
  pathQuery: string;
  rows: StatePointRow[];
}) {
  return (
    <section aria-label="YAML node points" className="min-h-[460px]">
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
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" type="button" variant="canvas-outline">
            All statuses
          </Button>
          <Button size="sm" type="button" variant="canvas-outline">
            Schema issues
          </Button>
          <Button size="sm" type="button" variant="canvas-outline">
            Source mapped
          </Button>
        </div>
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

function StateRenderView({ model }: { model: PrdRenderModel }) {
  return (
    <section
      aria-label="Schema render"
      className="min-h-[560px] bg-[var(--surface-card)] px-6 py-6"
    >
      <article className="mx-auto max-w-3xl rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{model.title}</h1>
        <div className="mt-4 border-t border-[var(--stroke-divider)] pt-5">
          <RenderSection title="1. Problem">
            <RenderValue>{model.problem || 'No problem statement'}</RenderValue>
          </RenderSection>
          <RenderSection title="2. Audience">
            {model.audienceMissing ? (
              <div className="rounded-md border border-dashed border-[var(--status-warning)] bg-[var(--status-warning-muted)] px-4 py-3">
                <div className="text-sm font-bold text-[var(--status-warning)]">Missing</div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  This field is required by the schema.
                </p>
              </div>
            ) : (
              <RenderValue>{model.audience}</RenderValue>
            )}
          </RenderSection>
          <RenderSection title="3. Outcome">
            <RenderValue>{model.outcome || 'No outcome yet'}</RenderValue>
          </RenderSection>
          <RenderSection title="4. Requirements">
            <div className="grid gap-3">
              {model.requirements.map((requirement, index) => (
                <div
                  className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
                  key={requirement.title + String(index)}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--accent-commit)] text-xs font-bold text-[var(--on-accent)]">
                      {index + 1}
                    </span>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      {requirement.title}
                    </h3>
                  </div>
                  <dl className="mt-3 grid grid-cols-[90px_minmax(0,1fr)] gap-2 text-sm">
                    <dt className="text-xs font-bold text-[var(--text-tertiary)]">Priority</dt>
                    <dd>
                      <Badge variant="pending-subtle">{requirement.priority || 'P?'}</Badge>
                    </dd>
                    <dt className="text-xs font-bold text-[var(--text-tertiary)]">Acceptance</dt>
                    <dd className="text-[var(--text-secondary)]">
                      {requirement.acceptance || 'Not specified'}
                    </dd>
                  </dl>
                </div>
              ))}
            </div>
          </RenderSection>
          <section className="mt-5 rounded-md bg-[var(--surface-card)] p-4">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Meta</h2>
            <dl className="mt-2 grid gap-1 font-mono text-xs text-[var(--text-secondary)]">
              {Object.entries(model.metadata).map(([key, value]) => (
                <div className="grid grid-cols-[110px_minmax(0,1fr)]" key={key}>
                  <dt className="font-bold text-[var(--text-primary)]">{key}:</dt>
                  <dd className="truncate">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </article>
    </section>
  );
}

function RenderSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-lg font-bold text-[var(--text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function RenderValue({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--status-success)]/20 bg-[var(--status-success-muted)] px-4 py-3 text-sm font-semibold text-[var(--status-success)]">
      {children}
    </div>
  );
}

function StateCodeView({ yamlText }: { yamlText: string }) {
  const lines = yamlText.split('\n');
  return (
    <section
      aria-label="YAML code view"
      className="min-h-[560px] bg-[var(--surface-card)] px-6 py-5"
    >
      <div className="mb-3 flex items-center justify-end gap-2">
        <Button size="sm" type="button" variant="canvas-outline">
          YAML
        </Button>
        <Button size="sm" type="button" variant="canvas-outline">
          Copy
        </Button>
        <Button size="sm" type="button" variant="canvas-outline">
          Download
        </Button>
      </div>
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
  branch,
  commitCount,
  edgeCount,
  headCommit,
  leaves,
  operations,
  projectName,
  schemaName,
  validation,
  validationGapCount,
  validationReady,
  warning,
}: {
  branch: string;
  commitCount: number;
  edgeCount: number;
  headCommit: ApiCommit | null;
  leaves: Leaf[];
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
          <RailRow label="Points" value="YAML-shaped node browser" />
          <RailRow label="Render" value="Schema-selected reader" />
          <RailRow label="Code" value="Canonical committed state" />
        </dl>
        <p className="mt-3">
          Points keep the YAML form intact as nodes. Render is a schema projection, not a new
          authoring surface.
        </p>
      </RailCard>
      <RailCard title="Commit graph">
        <div className="grid gap-2 text-sm font-bold text-[var(--text-primary)]">
          <GraphLine label="main" meta="base" tone="commit" />
          <GraphLine
            label={branch}
            meta={headCommit?.hash ? commitHashLabel(headCommit.hash) : 'empty'}
            tone="commit"
          />
          <GraphLine
            label="output leaf"
            meta={
              leaves.length > 0
                ? String(leaves.length) + ' leaves'
                : validationReady
                  ? 'ready'
                  : 'blocked'
            }
            tone="leaf"
          />
        </div>
        <Button className="mt-3 w-full" size="sm" type="button" variant="canvas-outline">
          Open graph
        </Button>
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
        <div className="mt-3 flex gap-2">
          <Button size="sm" type="button">
            Open commit
          </Button>
          <Button size="sm" type="button" variant="canvas-outline">
            Parent diff
          </Button>
        </div>
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

function GraphLine({
  label,
  meta,
  tone,
}: {
  label: string;
  meta: string;
  tone: 'commit' | 'leaf';
}) {
  return (
    <div className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2">
      <span
        className={cn(
          'size-3 rounded-full border-2',
          tone === 'leaf' ? 'border-[var(--accent-leaf)]' : 'border-[var(--accent-commit)]'
        )}
      />
      <span className="truncate">{label}</span>
      <span className="font-mono text-xs font-medium text-[var(--text-tertiary)]">{meta}</span>
    </div>
  );
}

function collectStateCommits(
  nodes: Array<{ id: string; data: CanvasNodeData }>
): StateCommitFallback[] {
  return nodes
    .filter((node) => node.data.kind === 'unit' && node.data.commitStatus === 'committed')
    .map((node) => ({
      branch: branchNameForNode(node.data),
      hash: node.data.commitHash ?? node.data.commit?.hash ?? node.id,
      id: node.id,
      leafCount: node.data.leaves?.length ?? 0,
      summary: node.data.summary || node.data.commit?.message || 'Committed state update',
      timestamp: String(node.data.commit?.committed_at ?? node.data.timestamp ?? ''),
      title: node.data.title || node.data.commit?.message || 'State commit',
    }))
    .sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp));
}

function branchNameForNode(data: CanvasNodeData): string {
  if (data.branchType === 'branch') return data.branchName?.trim() || 'branch';
  return 'main';
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

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
