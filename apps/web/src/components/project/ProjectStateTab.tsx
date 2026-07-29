'use client';

import {
  ChevronDown,
  ChevronRight,
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
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CanvasWorkspace } from '@/components/canvas';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { StateBranchControls } from '@/components/project/StateBranchControls';
import { StatePaneResizeHandle } from '@/components/project/StatePaneResizeHandle';
import { StatePrdReader } from '@/components/project/StatePrdReader';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { StateSkillReader } from '@/components/project/StateSkillReader';
import { T3XDiff } from '@/components/shared/T3XDiff';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import { commitHashLabel, shortHash } from '@/domain/format/formatters';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import {
  buildCanonicalStateYaml,
  buildStatePointRows,
  countStateYOps,
  type StateOperationEntry,
  type StatePointRow,
  type StateValidationGapLike,
  selectPrdRenderModel,
  selectSkillRenderModel,
  workspaceDraftOperationsToStateOperations,
} from '@/domain/project/stateViewModel';
import {
  getYSchemaValidationPrimaryLabel,
  type YSchemaValidationSummary,
} from '@/domain/project/yschemaValidation';
import { selectWorkspaceForBranch } from '@/domain/workspaces/navigation';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { useCommitByHash } from '@/hooks/commits/useCommitByHash';
import { useCommitOperations } from '@/hooks/commits/useCommitOperations';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useSkillArtifact } from '@/hooks/projects/useSkillArtifact';
import { useBranches } from '@/hooks/shared/useBranches';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
import { useCanvasStore } from '@/store/canvasStore';
import type { ApiCommit } from '@/types/api';
import type { WorkspaceCandidate } from '@/types/workspaces';
import { cn } from '@/utils/cn';

export type ProjectSnapshotView = 'structure' | 'render' | 'code';
export type ProjectStateView = ProjectSnapshotView | 'canvas';
type ProjectStateMode = 'snapshot' | 'canvas';
type BranchFocus = string;

interface ProjectStateTabProps {
  initialView?: ProjectStateView;
  onRunValidation?: (commitHash: string, schemaName: string) => Promise<void> | void;
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
  parentCommit: ApiCommit | null;
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
const STATE_CONTEXT_RAIL_DEFAULT_WIDTH = 330;
const STATE_CONTEXT_RAIL_MIN_WIDTH = 260;
const STATE_CONTEXT_RAIL_MAX_WIDTH = 560;
const STATE_CONTENT_MIN_WIDTH = 640;

function clampStatePaneWidth(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function parseStateView(value: string | null, fallback: ProjectStateView): ProjectStateView {
  if (value === 'canvas') return 'canvas';
  if (value === 'points') return 'structure';
  return SNAPSHOT_VIEWS.some((view) => view.id === value)
    ? (value as ProjectSnapshotView)
    : fallback;
}

function buildCanvasHref(
  pathname: string,
  routeQuery: string,
  branch: string,
  commitHash?: string
): string {
  const params = new URLSearchParams(routeQuery);
  params.set('view', 'canvas');
  if (branch === 'main') {
    params.delete('branch');
  } else {
    params.set('branch', branch);
  }
  if (commitHash) {
    params.set('commit', commitHash);
  } else {
    params.delete('commit');
  }
  return `${pathname}?${params.toString()}`;
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
  const { push: pushRoute, replace: replaceRoute } = useRouter();
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
  const focusedCommitHash = searchParams.get('commit')?.trim() || undefined;
  const [pathQuery, setPathQuery] = useState('');
  const [diffOpen, setDiffOpen] = useState(false);
  const [selectedDiffChangeId, setSelectedDiffChangeId] = useState('');
  const [snapshotRefreshVersion, setSnapshotRefreshVersion] = useState(0);
  const [contextRailWidth, setContextRailWidth] = useState(STATE_CONTEXT_RAIL_DEFAULT_WIDTH);
  const stateLayoutRef = useRef<HTMLDivElement>(null);
  const {
    branchHeads = EMPTY_BRANCH_HEADS,
    branches,
    create: createBranch,
    loading: branchesLoading,
    refresh,
  } = useBranches(projectId, true);
  const projectWorkspaces = useProjectWorkspaces(projectId, true);
  const { saveDraft } = useWorkspaceFlow();
  const { loadCommit } = useCommitByHash();
  const { loadCommits } = useCommitsList();
  const { loadOperations } = useCommitOperations();
  const [snapshot, setSnapshot] = useState<StateSnapshot>({
    auxiliaryError: null,
    commits: [],
    headCommit: null,
    loading: true,
    operations: [],
    parentCommit: null,
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
        parentCommit: null,
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
        let parentCommit: ApiCommit | null = null;
        const auxiliaryErrors: string[] = [];

        if (headCommit) {
          try {
            operations = (await loadOperations(headCommit.hash)).operations;
          } catch {
            auxiliaryErrors.push('YOps log unavailable.');
          }

          const parentHash = headCommit.parents[0];
          if (parentHash) {
            try {
              parentCommit = commits.find((commit) => commit.hash === parentHash) ?? null;
              if (!parentCommit) parentCommit = await loadCommit(parentHash);
              if (parentCommit.project_id !== projectId || parentCommit.hash !== parentHash) {
                throw new Error('Parent commit response does not match the selected project.');
              }
            } catch {
              auxiliaryErrors.push('Parent commit unavailable.');
            }
          }
        }

        if (!cancelled) {
          setSnapshot({
            auxiliaryError: auxiliaryErrors.join(' ') || null,
            commits,
            headCommit,
            loading: false,
            operations,
            parentCommit,
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
            parentCommit: null,
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
  const yamlText = useMemo(
    () => (headCommit ? buildCanonicalStateYaml(headCommit.content) : ''),
    [headCommit]
  );
  const schemaName = currentValidation?.schemaName ?? inferSchemaName(headCommit);
  const isSkillSchema = schemaName === 't3x/skill';
  const prdRenderModel = useMemo(
    () =>
      headCommit && !isSkillSchema
        ? selectPrdRenderModel(headCommit.content, {
            gaps: validationGaps,
            operations: effectiveOperations,
          })
        : null,
    [effectiveOperations, headCommit, isSkillSchema, validationGaps]
  );
  const skillRenderModel = useMemo(
    () => (headCommit && isSkillSchema ? selectSkillRenderModel(headCommit.content) : null),
    [headCommit, isSkillSchema]
  );
  const skillArtifact = useSkillArtifact(projectId, headCommit?.hash ?? null, isSkillSchema);
  const validationReady = currentValidation?.status === 'verified';
  const validationGapCount = currentValidation?.gapCount ?? validationGaps.length;
  const rootKey = headCommit?.content.trees?.[0]?.key ?? 'state';
  const commitTitle = commitTitleFor(headCommit);
  const commitCount = snapshot.commits.length;
  const yopsCount = countStateYOps(effectiveOperations);
  const branchCount = branchOptions.length;
  const committedDiffChanges = useMemo(
    () =>
      headCommit && snapshot.parentCommit
        ? buildStructuredStateDiff({
            baseline: snapshot.parentCommit.content,
            head: headCommit.content,
            workspace: committedWorkspace,
          })
        : [],
    [committedWorkspace, headCommit, snapshot.parentCommit]
  );
  const effectiveSelectedDiffChangeId = committedDiffChanges.some(
    (change) => change.id === selectedDiffChangeId
  )
    ? selectedDiffChangeId
    : (committedDiffChanges.at(-1)?.id ?? '');
  const showingInlineDiff =
    activeView !== 'canvas' &&
    diffOpen &&
    committedDiffChanges.length > 0 &&
    Boolean(snapshot.parentCommit);
  const stateWarning = joinWarnings(snapshot.auxiliaryError, projectWorkspaces.error);
  const historyHref = buildCanvasHref(pathname, routeQuery, branchFocus);
  const commitHref = headCommit
    ? buildCanvasHref(pathname, routeQuery, branchFocus, headCommit.hash)
    : null;
  const workspaceBasePath = `${getProjectRepoPath({ id: projectId, name: projectName })}/workspaces`;
  const workspaceHref = `${workspaceBasePath}?branch=${encodeURIComponent(branchFocus || 'main')}`;
  const mainHeadCommitHash = branchHeads.main ?? null;
  const mainSchemaBindings = resolveMainSchemaBindings(
    projectWorkspaces.workspaces,
    mainHeadCommitHash
  );
  const handleCreateBranch = useCallback(
    async (name: string) => {
      const createdBranch = await createBranch(name, 'main');
      const workspaceId = `workspace_branch:${encodeURIComponent(name)}`;
      await saveDraft({
        id: workspaceId,
        projectId,
        title: `Branch workspace: ${name}`,
        summary: `Workspace for collecting source evidence on ${name}.`,
        status: 'draft',
        updatedAt: new Date().toISOString(),
        baseCommitHash: createdBranch.head_commit_hash ?? null,
        targetBranch: name,
        sourceBundle: [],
        schemaBindings: mainSchemaBindings,
        schemaCandidate: {
          summary: 'Collect source evidence, then generate a candidate proposal.',
          fields: [],
        },
        schemaReview: {
          verdict: 'needs_review',
          summary: 'This workspace needs source evidence.',
          gaps: ['Add source evidence for this branch.'],
        },
        yopsDraft: { id: `draft:${workspaceId}`, operations: [] },
        outputTargets: [],
      });
      pushRoute(`${workspaceBasePath}?branch=${encodeURIComponent(name)}`);
    },
    [createBranch, mainSchemaBindings, projectId, pushRoute, saveDraft, workspaceBasePath]
  );
  const handleContextRailResizeMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const container = stateLayoutRef.current;
      if (!container) return;

      const startX = event.clientX;
      const startWidth = contextRailWidth;
      const containerWidth = container.getBoundingClientRect().width;
      const maxWidth = Math.min(
        STATE_CONTEXT_RAIL_MAX_WIDTH,
        containerWidth - STATE_CONTENT_MIN_WIDTH
      );

      const handleMove = (moveEvent: MouseEvent) => {
        const nextWidth = startWidth + startX - moveEvent.clientX;
        setContextRailWidth(clampStatePaneWidth(nextWidth, STATE_CONTEXT_RAIL_MIN_WIDTH, maxWidth));
      };
      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        window.removeEventListener('blur', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      window.addEventListener('blur', handleUp);
    },
    [contextRailWidth]
  );
  const handleContextRailResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const step = event.shiftKey ? 48 : 16;
      const direction = event.key === 'ArrowLeft' ? 1 : -1;
      setContextRailWidth((current) =>
        clampStatePaneWidth(
          current + step * direction,
          STATE_CONTEXT_RAIL_MIN_WIDTH,
          STATE_CONTEXT_RAIL_MAX_WIDTH
        )
      );
    },
    []
  );
  const contextRailVisible =
    showingInlineDiff || (activeView !== 'render' && activeView !== 'canvas');

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-app)] p-3"
      data-state-view={activeView}
    >
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 shadow-sm">
        <StateModeTabs
          activeMode={activeView === 'canvas' ? 'canvas' : 'snapshot'}
          onModeChange={(mode) => updateActiveView(mode === 'canvas' ? 'canvas' : lastSnapshotView)}
        />
        {activeView !== 'canvas' ? (
          <StateOverviewHeader
            headCommit={headCommit}
            onRunValidation={
              headCommit && onRunValidation
                ? () => onRunValidation(headCommit.hash, schemaName)
                : undefined
            }
            validation={currentValidation}
            validationError={validationError}
            validationGapCount={validationGapCount}
            validationReady={validationReady}
            validationRunning={validationRunning}
            workspaceHref={workspaceHref}
          />
        ) : null}
      </div>

      <div
        className={cn(
          'mt-3 grid min-h-0 flex-1 overflow-auto xl:overflow-hidden',
          contextRailVisible &&
            'gap-4 xl:grid-cols-[minmax(0,1fr)_8px_var(--state-context-rail-width)] xl:gap-0'
        )}
        ref={stateLayoutRef}
        style={
          contextRailVisible
            ? ({ '--state-context-rail-width': `${String(contextRailWidth)}px` } as CSSProperties)
            : undefined
        }
      >
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm">
          <StateRepositoryToolbar
            branch={branchFocus || 'main'}
            branchCount={branchCount}
            branchOptions={branchOptions}
            headCommitHash={mainHeadCommitHash}
            historyHref={historyHref}
            loading={branchesLoading || projectWorkspaces.loading || snapshot.loading}
            onBranchChange={updateBranchFocus}
            onCreateBranch={handleCreateBranch}
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
                title={commitTitle}
                yopsCount={yopsCount}
              />
              <StateObjectLine
                activeView={activeView}
                commitHref={commitHref}
                diffCount={committedDiffChanges.length}
                diffOpen={showingInlineDiff}
                headCommit={headCommit}
                onDiffToggle={() => setDiffOpen((current) => !current)}
                rootKey={rootKey}
                schemaName={schemaName}
                validationGapCount={validationGapCount}
                validationKnown={Boolean(currentValidation)}
              />
              {!showingInlineDiff ? (
                <StateViewTabs
                  activeView={activeView}
                  onViewChange={updateActiveView}
                  schemaName={schemaName}
                />
              ) : null}

              {showingInlineDiff && headCommit && snapshot.parentCommit ? (
                <StateScrollArea className="min-h-0 flex-1" horizontal label="Committed state diff">
                  <T3XDiff
                    baselineLabel={`Parent ${shortHash(snapshot.parentCommit.hash)}`}
                    changes={committedDiffChanges}
                    headerSubtitle="Commit · Parent → HEAD"
                    onSelectChange={setSelectedDiffChangeId}
                    pathSubtitle="Committed state · node-level result"
                    projectedLabel={`HEAD ${shortHash(headCommit.hash)}`}
                    selectedChangeId={effectiveSelectedDiffChangeId}
                  />
                </StateScrollArea>
              ) : null}
              {!showingInlineDiff && snapshot.primaryError ? (
                <StateEmpty message={snapshot.primaryError} title="No committed state loaded" />
              ) : null}
              {!showingInlineDiff && !snapshot.primaryError && !snapshot.loading && !headCommit ? (
                <StateEmpty
                  message="Create or select a committed branch to inspect state as Structure, Render, or Code."
                  title="No commit on this branch"
                />
              ) : null}
              {!showingInlineDiff && !snapshot.primaryError && snapshot.loading ? (
                <StateEmpty
                  message="Loading commit, YOps, and validation context."
                  title="Loading state"
                />
              ) : null}
              {!showingInlineDiff && !snapshot.primaryError && !snapshot.loading && headCommit ? (
                <>
                  {activeView === 'structure' ? (
                    <StateStructureView
                      onPathQueryChange={setPathQuery}
                      pathQuery={pathQuery}
                      rows={pointRows}
                    />
                  ) : null}
                  {activeView === 'render' && skillRenderModel ? (
                    <StateSkillReader
                      artifact={skillArtifact.artifact}
                      artifactError={skillArtifact.error?.message ?? null}
                      artifactLoading={skillArtifact.loading}
                      model={skillRenderModel}
                      schemaName={schemaName}
                      validationGapCount={validationGapCount}
                      validationReady={validationReady}
                      yamlText={yamlText}
                    />
                  ) : null}
                  {activeView === 'render' && prdRenderModel ? (
                    <StatePrdReader
                      model={prdRenderModel}
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
              branchHeadHash={headCommit?.hash ?? null}
              focusedCommitHash={focusedCommitHash}
              projectId={projectId}
              projectName={projectName}
              snapshotLoading={snapshot.loading}
            />
          )}
        </main>

        {contextRailVisible ? (
          <StatePaneResizeHandle
            className="hidden xl:block"
            label="Resize state details"
            max={STATE_CONTEXT_RAIL_MAX_WIDTH}
            min={STATE_CONTEXT_RAIL_MIN_WIDTH}
            onKeyDown={handleContextRailResizeKeyDown}
            onMouseDown={handleContextRailResizeMouseDown}
            onReset={() => setContextRailWidth(STATE_CONTEXT_RAIL_DEFAULT_WIDTH)}
            value={contextRailWidth}
          />
        ) : null}

        {contextRailVisible ? (
          <StateScrollArea className="min-h-0" label="State details" viewportClassName="xl:pl-4">
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
          </StateScrollArea>
        ) : null}
      </div>
    </section>
  );
}

function StateOverviewHeader({
  headCommit,
  onRunValidation,
  validation,
  validationError,
  validationGapCount,
  validationReady,
  validationRunning,
  workspaceHref,
}: {
  headCommit: ApiCommit | null;
  onRunValidation?: () => Promise<void> | void;
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
      className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 py-1"
    >
      <h1 className="sr-only">State</h1>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
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
        {validationError ? (
          <p
            className="max-w-64 truncate text-xs font-semibold text-[var(--status-warning)]"
            title={validationError}
          >
            {validationError}
          </p>
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
        <Button asChild size="sm" variant="canvas-outline">
          <Link href={workspaceHref}>Open workspace</Link>
        </Button>
      </div>
    </section>
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
  onCreateBranch: (name: string) => Promise<void>;
  onRefresh: () => void;
  schemaName: string;
}) {
  return (
    <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3 py-2">
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
  title,
  yopsCount,
}: {
  commitCount: number;
  hash: string | null;
  relativeTime: string;
  title: string;
  yopsCount: number;
}) {
  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-branch)]/15 text-sm font-bold text-[var(--accent-branch)]">
          W
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-bold text-[var(--text-primary)]">{title}</h2>
            <Badge variant="outline">
              HEAD · {yopsCount} {yopsCount === 1 ? 'YOp' : 'YOps'}
            </Badge>
          </div>
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
  diffCount,
  diffOpen,
  headCommit,
  onDiffToggle,
  rootKey,
  schemaName,
  validationGapCount,
  validationKnown,
}: {
  activeView: ProjectStateView;
  commitHref: string | null;
  diffCount: number;
  diffOpen: boolean;
  headCommit: ApiCommit | null;
  onDiffToggle: () => void;
  rootKey: string;
  schemaName: string;
  validationGapCount: number;
  validationKnown: boolean;
}) {
  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3 py-1.5">
      <div className="min-w-0 truncate font-mono text-sm text-[var(--text-secondary)]">
        state{' '}
        <span className="font-bold text-[var(--text-primary)]">
          {schemaArtifactFileName(schemaName)}
        </span>{' '}
        / <span className="font-bold text-[var(--text-primary)]">{rootKey}</span>
        <Badge className="ml-2 font-mono" variant="commit">
          HEAD {headCommit?.hash ? commitHashLabel(headCommit.hash) : 'empty'}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="pending-subtle">adapter {schemaAdapterName(schemaName)}</Badge>
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
        {diffCount > 0 ? <Badge variant="warning">{diffCount} changed paths</Badge> : null}
        {commitHref ? (
          <Button asChild size="sm" variant="canvas-outline">
            <Link href={commitHref}>Open commit</Link>
          </Button>
        ) : null}
        {diffCount > 0 ? (
          <Button
            aria-expanded={diffOpen}
            onClick={onDiffToggle}
            size="sm"
            type="button"
            variant={diffOpen ? 'commit' : 'canvas-outline'}
          >
            <GitCompare className="size-4" />
            {diffOpen ? 'Hide changed paths' : `View ${String(diffCount)} changed paths`}
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
    <div aria-label="State modes" className="flex min-h-10 shrink-0 items-stretch" role="tablist">
      {modes.map((mode) => {
        const Icon = mode.icon;
        const selected = activeMode === mode.id;
        return (
          <button
            aria-selected={selected}
            className={cn(
              'border-b-2 px-3 py-1.5 text-left transition-colors',
              selected
                ? 'border-[var(--accent-commit)] text-[var(--accent-commit)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            role="tab"
            type="button"
          >
            <span className="flex items-center gap-1.5 whitespace-nowrap text-sm font-bold">
              <Icon aria-hidden="true" className="size-4" />
              {mode.label}
              <span className="hidden text-xs font-medium text-[var(--text-tertiary)] 2xl:inline">
                · {mode.subtitle}
              </span>
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
  schemaName,
}: {
  activeView: ProjectSnapshotView;
  onViewChange: (view: ProjectSnapshotView) => void;
  schemaName: string;
}) {
  return (
    <div
      aria-label="State views"
      className="flex min-h-12 shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-[var(--stroke-divider)] px-3"
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
        <Badge variant="pending-subtle">adapter {schemaAdapterName(schemaName)}</Badge>
        <Badge variant="commit-subtle">canonical YAML</Badge>
      </div>
    </div>
  );
}

function StateCanvasView({
  branch,
  branchHeadHash,
  focusedCommitHash,
  projectId,
  projectName,
  snapshotLoading,
}: {
  branch: string;
  branchHeadHash: string | null;
  focusedCommitHash?: string;
  projectId: string;
  projectName: string;
  snapshotLoading: boolean;
}) {
  const canvasProjectId = useCanvasStore((state) => state.projectId);
  const canvasLoading = useCanvasStore((state) => state.loading);
  const canvasError = useCanvasStore((state) => state.loadError);
  const { load: loadCanvas } = useCanvasNodeActions();

  if (canvasLoading || canvasProjectId !== projectId) {
    return (
      <section
        aria-label="Multi-commit state canvas"
        className="flex min-h-0 flex-1 items-center justify-center"
      >
        <LoadingSpinner message="Loading state evolution..." />
      </section>
    );
  }

  if (canvasError) {
    return (
      <section
        aria-label="Multi-commit state canvas"
        className="flex min-h-0 flex-1 items-center justify-center p-6"
      >
        <ErrorMessage error={canvasError} onRetry={() => void loadCanvas(projectId)} />
      </section>
    );
  }

  return (
    <section
      aria-label="Multi-commit state canvas"
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    >
      {!snapshotLoading && !branchHeadHash ? (
        <output className="shrink-0 border-b border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">{branch} has no HEAD commit.</strong>{' '}
          Canvas shows the evolution of all branches; the visible commits belong to the branch
          labels on their cards and cannot serve as the {branch} PR base.
        </output>
      ) : null}
      <div className="min-h-0 flex-1">
        <CanvasWorkspace
          embedded
          focusedBranch={branch}
          focusedCommitHash={focusedCommitHash}
          projectName={projectName}
        />
      </div>
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
  const [expansionOverrides, setExpansionOverrides] = useState<Record<string, boolean>>({});
  const structureRows = useMemo(() => buildStateStructureRows(rows), [rows]);
  const filteredRows = useMemo(
    () => filterStateStructureRows(structureRows, pathQuery),
    [pathQuery, structureRows]
  );
  const searching = pathQuery.trim().length > 0;
  const visibleRows = useMemo(
    () =>
      searching
        ? filteredRows
        : filterCollapsedStateRows(structureRows, (row) =>
            isStateStructureRowExpanded(row, expansionOverrides)
          ),
    [expansionOverrides, filteredRows, searching, structureRows]
  );

  const toggleRow = useCallback((row: StateStructureRow) => {
    setExpansionOverrides((current) => ({
      ...current,
      [row.id]: !isStateStructureRowExpanded(row, current),
    }));
  }, []);

  return (
    <section
      aria-label="Structured state tree"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 py-2">
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
      <StateScrollArea className="min-h-0 flex-1" horizontal label="State rows">
        <table className="w-full min-w-[1200px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[360px]" />
            <col />
            <col className="w-24" />
            <col className="w-32" />
            <col className="w-36" />
            <col className="w-24" />
          </colgroup>
          <thead className="sticky top-0 z-20 bg-[var(--surface-card)] text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)] shadow-[0_1px_0_var(--stroke-divider)]">
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3">
                Path / Key
              </th>
              <th className="border-b border-[var(--stroke-divider)] px-3 py-3">Value</th>
              <th className="border-b border-[var(--stroke-divider)] px-3 py-3">Type</th>
              <th className="border-b border-[var(--stroke-divider)] px-3 py-3">Status</th>
              <th className="border-b border-[var(--stroke-divider)] px-3 py-3">Source / Op</th>
              <th className="border-b border-[var(--stroke-divider)] px-3 py-3">Issues</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <StatePointTableRow
                expanded={searching || isStateStructureRowExpanded(row, expansionOverrides)}
                key={row.id}
                onToggle={() => toggleRow(row)}
                row={row}
              />
            ))}
          </tbody>
        </table>
      </StateScrollArea>
    </section>
  );
}

interface StateStructureRow extends StatePointRow {
  childCount?: number;
  collapseByDefault?: boolean;
  parentPath: string | null;
  virtualGroup?: boolean;
}

function StatePointTableRow({
  expanded,
  onToggle,
  row,
}: {
  expanded: boolean;
  onToggle: () => void;
  row: StateStructureRow;
}) {
  const expandableLabel = `${expanded ? 'Collapse' : 'Expand'} ${row.key}`;

  return (
    <tr
      className={cn(
        'group border-b border-[var(--stroke-divider)] text-[var(--text-primary)]',
        row.expandable && 'cursor-pointer transition-colors hover:bg-[var(--surface-hover)]',
        row.status === 'missing' && 'bg-[var(--status-warning-muted)]/25'
      )}
      onClick={row.expandable ? onToggle : undefined}
    >
      <td
        className={cn(
          'sticky left-0 z-10 border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2.5 font-bold transition-colors',
          row.expandable && 'group-hover:bg-[var(--surface-hover)]',
          row.status === 'missing' && 'bg-[var(--status-warning-muted)]'
        )}
      >
        <span
          className="flex min-w-0 items-center gap-2"
          style={{ paddingLeft: 4 + row.depth * 18 }}
        >
          {row.expandable ? (
            <button
              aria-expanded={expanded}
              aria-label={expandableLabel}
              className="-m-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40"
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              type="button"
            >
              {expanded ? (
                <ChevronDown aria-hidden="true" className="size-3.5" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate" title={row.path}>
            {row.key}
          </span>
          {row.childCount ? (
            <Badge className="shrink-0 px-1.5 py-0 text-[10px]" variant="outline">
              {row.childCount}
            </Badge>
          ) : null}
        </span>
      </td>
      <td className="truncate px-3 py-2.5 text-xs text-[var(--text-secondary)]" title={row.value}>
        {row.value}
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-[var(--text-secondary)]">{row.type}</td>
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
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface-card)] px-6 py-5"
    >
      <StateScrollArea
        className="min-h-0 flex-1 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
        horizontal
        label="Canonical YAML content"
        viewportClassName="font-mono text-sm leading-6 text-[var(--text-primary)]"
      >
        <code className="block min-w-max py-4 pr-4">
          {lines.map((line, index) => (
            <span className="grid grid-cols-[44px_max-content]" key={String(index)}>
              <span className="sticky left-0 z-10 select-none border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 text-right text-[var(--text-tertiary)]">
                {index + 1}
              </span>
              <span className="whitespace-pre pl-4">{line}</span>
            </span>
          ))}
        </code>
      </StateScrollArea>
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
    <aside className="grid content-start gap-4 pb-1">
      <RailCard title="About this state">
        <p>Committed state built from source evidence through YOps.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="pending-subtle">prd</Badge>
          <Badge variant="outline">yaml</Badge>
          <Badge variant="branch">branch</Badge>
          <Badge variant={validationReady ? 'success' : 'warning'}>
            {validationReady ? 'output-ready' : 'output blocked'}
          </Badge>
        </div>
      </RailCard>
      <RailCard title="State metadata">
        <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-sm">
          <RailRow label="Project" value={projectName} />
          <RailRow
            label="HEAD"
            mono
            title={headCommit?.hash}
            value={hashTail(headCommit?.hash, 'empty')}
          />
          <RailRow
            label="Parent"
            mono
            title={headCommit?.parents?.[0]}
            value={hashTail(headCommit?.parents?.[0], 'none')}
          />
          <RailRow label="Schema" value={schemaName} />
          <RailRow label="Readiness" value={validationLabel(validation, validationGapCount)} />
          <RailRow label="Commits" value={String(commitCount)} />
          <RailRow label="HEAD YOps" value={String(countStateYOps(operations))} />
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

function RailRow({
  label,
  mono,
  title,
  value,
}: {
  label: string;
  mono?: boolean;
  title?: string;
  value: string;
}) {
  return (
    <>
      <dt className="font-bold text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate font-bold text-[var(--text-primary)]',
          mono && 'font-mono text-xs'
        )}
        title={title ?? value}
      >
        {value}
      </dd>
    </>
  );
}

function hashTail(hash: string | null | undefined, fallback: string): string {
  return hash ? hash.replace(/^sha256:/, '').slice(-6) : fallback;
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

function joinWarnings(...warnings: Array<string | null | undefined>): string | null {
  const message = warnings.filter(Boolean).join(' ');
  return message || null;
}

function buildStateStructureRows(rows: StatePointRow[]): StateStructureRow[] {
  const rootPaths = new Set(rows.filter((row) => row.depth === 0).map((row) => row.path));
  const mustRowsByParent = new Map<string, StatePointRow[]>();

  for (const row of rows) {
    const parentPath = parentStatePath(row.path);
    if (
      parentPath &&
      rootPaths.has(parentPath) &&
      row.depth === 1 &&
      row.type === 'boolean' &&
      isMustConditionKey(row.key)
    ) {
      const siblings = mustRowsByParent.get(parentPath) ?? [];
      siblings.push(row);
      mustRowsByParent.set(parentPath, siblings);
    }
  }

  const groupByChildId = new Map<string, StatePointRow[]>();
  for (const siblings of mustRowsByParent.values()) {
    if (siblings.length < 2) continue;
    for (const row of siblings) groupByChildId.set(row.id, siblings);
  }

  const structuredRows: StateStructureRow[] = [];
  for (const row of rows) {
    const mustSiblings = groupByChildId.get(row.id);
    if (!mustSiblings) {
      structuredRows.push({ ...row, parentPath: parentStatePath(row.path) });
      continue;
    }
    if (mustSiblings[0]?.id !== row.id) continue;

    const parentPath = parentStatePath(row.path);
    if (!parentPath) continue;
    const groupId = `${parentPath}/$must_conditions`;
    const groupStatus = aggregateStatePointStatus(mustSiblings);
    structuredRows.push({
      childCount: mustSiblings.length,
      collapseByDefault: true,
      depth: row.depth,
      expandable: true,
      id: groupId,
      issueCount: mustSiblings.reduce((total, child) => total + child.issueCount, 0),
      key: 'Must conditions',
      parentPath,
      path: groupId,
      sourceOp: aggregateStatePointSource(mustSiblings),
      status: groupStatus.status,
      statusLabel: groupStatus.label,
      type: `${String(mustSiblings.length)} × bool`,
      value: summarizeMustConditions(mustSiblings),
      virtualGroup: true,
    });
    structuredRows.push(
      ...mustSiblings.map((child) => ({
        ...child,
        depth: row.depth + 1,
        parentPath: groupId,
      }))
    );
  }

  return collapseDenseBooleanGroups(structuredRows);
}

function collapseDenseBooleanGroups(rows: StateStructureRow[]): StateStructureRow[] {
  const childrenByParent = new Map<string, StateStructureRow[]>();
  for (const row of rows) {
    if (!row.parentPath) continue;
    const children = childrenByParent.get(row.parentPath) ?? [];
    children.push(row);
    childrenByParent.set(row.parentPath, children);
  }

  return rows.map((row) => {
    if (!row.expandable || row.type !== 'object') return row;
    const children = childrenByParent.get(row.id) ?? [];
    const booleanChildren = children.filter((child) => child.type === 'boolean');
    const booleanHeavy = booleanChildren.length * 3 >= children.length * 2;
    if (booleanChildren.length < 4 || !booleanHeavy) return row;

    const groupStatus = aggregateStatePointStatus([row, ...children]);
    return {
      ...row,
      childCount: children.length,
      collapseByDefault: true,
      issueCount: children.reduce((total, child) => total + child.issueCount, row.issueCount),
      sourceOp: aggregateStatePointSource([row, ...children]),
      status: groupStatus.status,
      statusLabel: groupStatus.label,
      value: summarizeBooleanGroup(children, booleanChildren),
    };
  });
}

function summarizeBooleanGroup(
  children: StateStructureRow[],
  booleanChildren: StateStructureRow[]
): string {
  const enabledCount = booleanChildren.filter(
    (child) => child.value.trim().toLowerCase() === 'true'
  ).length;
  if (children.length === booleanChildren.length) {
    return enabledCount === booleanChildren.length
      ? `${String(booleanChildren.length)} rules · all enabled`
      : `${String(booleanChildren.length)} rules · ${String(enabledCount)} enabled`;
  }
  return `${String(children.length)} fields · ${String(enabledCount)}/${String(booleanChildren.length)} rules enabled`;
}

function filterStateStructureRows(rows: StateStructureRow[], query: string): StateStructureRow[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return rows;

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const includedIds = new Set<string>();
  for (const row of rows) {
    const matches = [row.path, row.key, row.type, row.value, row.statusLabel].some((value) =>
      value.toLowerCase().includes(normalized)
    );
    if (!matches) continue;

    includedIds.add(row.id);
    let ancestorPath = row.parentPath;
    while (ancestorPath) {
      includedIds.add(ancestorPath);
      ancestorPath = rowById.get(ancestorPath)?.parentPath ?? null;
    }
  }

  return rows.filter((row) => includedIds.has(row.id));
}

function filterCollapsedStateRows(
  rows: StateStructureRow[],
  isExpanded: (row: StateStructureRow) => boolean
): StateStructureRow[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return rows.filter((row) => {
    let ancestorPath = row.parentPath;
    while (ancestorPath) {
      const ancestor = rowById.get(ancestorPath);
      if (ancestor?.expandable && !isExpanded(ancestor)) return false;
      ancestorPath = ancestor?.parentPath ?? null;
    }
    return true;
  });
}

function isStateStructureRowExpanded(
  row: StateStructureRow,
  overrides: Record<string, boolean>
): boolean {
  return overrides[row.id] ?? !row.collapseByDefault;
}

function parentStatePath(path: string): string | null {
  const separatorIndex = path.lastIndexOf('/');
  return separatorIndex < 0 ? null : path.slice(0, separatorIndex);
}

function isMustConditionKey(key: string): boolean {
  return (
    key.includes('_must_') ||
    key.startsWith('must_') ||
    key.startsWith('cases_not_resolvable_automatically_need_')
  );
}

function summarizeMustConditions(rows: StatePointRow[]): string {
  const labels = rows.map((row) => conciseMustConditionLabel(row.key));
  const visibleLabels = labels.slice(0, 5);
  const remaining = labels.length - visibleLabels.length;
  return `${visibleLabels.join(' · ')}${remaining > 0 ? ` · +${String(remaining)}` : ''}`;
}

function conciseMustConditionLabel(key: string): string {
  const prefixes = [
    'for_every_relevant_case_must_define_',
    'cases_not_resolvable_automatically_need_',
    'must_define_',
    'must_',
  ];
  const prefix = prefixes.find((candidate) => key.startsWith(candidate));
  const text = (prefix ? key.slice(prefix.length) : key).replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function aggregateStatePointStatus(rows: StatePointRow[]): {
  label: string;
  status: StatePointRow['status'];
} {
  const first = rows[0];
  if (!first) return { label: 'unchanged', status: 'unchanged' };
  if (rows.every((row) => row.status === first.status && row.statusLabel === first.statusLabel)) {
    return { label: first.statusLabel, status: first.status };
  }
  if (rows.some((row) => row.status === 'missing')) return { label: 'missing', status: 'missing' };
  const changedCount = rows.filter((row) => row.status !== 'unchanged').length;
  return { label: `${String(changedCount)} changes`, status: 'changed' };
}

function aggregateStatePointSource(rows: StatePointRow[]): string {
  const sources = Array.from(
    new Set(rows.map((row) => row.sourceOp).filter((value) => value !== '-'))
  );
  return sources.length === 1 ? sources[0]! : '-';
}

function commitTitleFor(commit: ApiCommit | null): string {
  if (!commit) return 'No committed state';
  const title = commit.content.trees?.[0]?.slots?.title;
  return commit.message || (typeof title === 'string' && title.trim() ? title : 'State committed');
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
  const provenanceSchema = commit?.provenance?.schema_ref?.name;
  if (provenanceSchema) return provenanceSchema;

  const rootKeys = new Set(commit?.content.trees?.map((tree) => tree.key) ?? []);
  if (
    rootKeys.has('skill') ||
    ['manifest', 'activation', 'contract', 'instructions'].every((key) => rootKeys.has(key))
  ) {
    return 't3x/skill';
  }
  return rootKeys.has('prd') ? 't3x/prd' : 't3x/state';
}

function schemaArtifactFileName(schemaName: string): string {
  const schemaKey =
    schemaName
      .split('/')
      .at(-1)
      ?.replace(/[^a-z0-9-]+/gi, '-') || 'state';
  return `${schemaKey}-state.yaml`;
}

function schemaAdapterName(schemaName: string): string {
  const schemaKey =
    schemaName
      .split('/')
      .at(-1)
      ?.replace(/[^a-z0-9_.-]+/gi, '-') || 'state';
  return `${schemaKey}.document`;
}

function resolveMainSchemaBindings(
  workspaces: WorkspaceCandidate[],
  mainHeadCommitHash: string | null
) {
  const mainWorkspace = selectWorkspaceForBranch(workspaces, 'main', mainHeadCommitHash);
  return mainWorkspace?.schemaBindings.map((binding) => ({ ...binding })) ?? [];
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
