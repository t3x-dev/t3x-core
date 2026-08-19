'use client';

import {
  ChevronDown,
  ChevronRight,
  Code2,
  FileText,
  GitCommit,
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
import { StatePromptReader } from '@/components/project/StatePromptReader';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { StateSkillReader } from '@/components/project/StateSkillReader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import { shortHash } from '@/domain/format/formatters';
import { getProjectIdDiffPath, getProjectRepoPath } from '@/domain/project/repoPath';
import {
  buildCanonicalStateYaml,
  buildStatePointRows,
  countStateYOps,
  resolveStateReaderKind,
  type StateOperationEntry,
  type StatePointRow,
  type StateValidationGapLike,
  selectPrdRenderModel,
  selectPromptRenderModel,
  selectSkillRenderModel,
  workspaceDraftOperationsToStateOperations,
} from '@/domain/project/stateViewModel';
import type { YSchemaValidationSummary } from '@/domain/project/yschemaValidation';
import { selectWorkspaceForBranch } from '@/domain/workspaces/navigation';
import { useCanvasNodeActions } from '@/hooks/canvas/useCanvasNodeActions';
import { useCommitByHash } from '@/hooks/commits/useCommitByHash';
import { useCommitOperations } from '@/hooks/commits/useCommitOperations';
import { useCommitsList } from '@/hooks/commits/useCommitsList';
import { useSkillArtifact } from '@/hooks/projects/useSkillArtifact';
import { useSchemaArtifactRegistry } from '@/hooks/schemas/useSchemaArtifactRegistry';
import { useBranches } from '@/hooks/shared/useBranches';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { useWorkspaceFlow } from '@/hooks/workspaces/useWorkspaceFlow';
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
  { id: 'code', label: 'Code', subtitle: 'canonical YAML', icon: Code2 },
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
  const { push: pushRoute, replace: replaceRoute } = useRouter();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const routeQueryRef = useRef(routeQuery);
  routeQueryRef.current = routeQuery;
  const routeView = parseStateView(searchParams.get('view'), initialView);
  const [activeView, setActiveView] = useState<ProjectStateView>(routeView);
  const snapshotEnabled = activeView !== 'canvas';
  const [lastSnapshotView, setLastSnapshotView] = useState<ProjectSnapshotView>(
    routeView === 'canvas' ? 'structure' : routeView
  );
  const branchFocus: BranchFocus = searchParams.get('branch')?.trim() || 'main';
  const focusedCommitHash = searchParams.get('commit')?.trim() || undefined;
  const [pathQuery, setPathQuery] = useState('');
  const [snapshotRefreshVersion, setSnapshotRefreshVersion] = useState(0);
  const [stateDetailsOpen, setStateDetailsOpen] = useState(false);
  const [freshnessChecking, setFreshnessChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [dismissedHeadHash, setDismissedHeadHash] = useState<string | null>(null);
  const inspectedHeadByBranchRef = useRef<Record<string, string>>({});
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
    if (!snapshotEnabled) return;

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
        const registeredBranchHeadHash = branchHeads[requestedBranch];
        const branchHeadHash =
          inspectedHeadByBranchRef.current[requestedBranch] ?? registeredBranchHeadHash;
        let commits = await loadCommits(projectId, requestedBranch, 100);
        let headCommit = selectVisibleBranchHead(commits);
        if (branchHeadHash) {
          headCommit = await loadCommit(branchHeadHash, projectId);
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
            operations = (await loadOperations(headCommit.hash, projectId)).operations;
          } catch {
            auxiliaryErrors.push('YOps log unavailable.');
          }

          const parentHash = headCommit.parents[0];
          if (parentHash) {
            try {
              parentCommit = commits.find((commit) => commit.hash === parentHash) ?? null;
              if (!parentCommit) parentCommit = await loadCommit(parentHash, projectId);
              if (parentCommit.project_id !== projectId || parentCommit.hash !== parentHash) {
                throw new Error('Parent commit response does not match the selected project.');
              }
            } catch {
              auxiliaryErrors.push('Parent commit unavailable.');
            }
          }
        }

        if (!cancelled) {
          if (headCommit && !inspectedHeadByBranchRef.current[requestedBranch]) {
            inspectedHeadByBranchRef.current[requestedBranch] = headCommit.hash;
          }
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
    snapshotEnabled,
    snapshotRefreshVersion,
  ]);

  const headCommit = snapshot.headCommit;
  const committedWorkspace = useMemo(
    () => findCommittedWorkspaceForCommit(projectWorkspaces.workspaces, headCommit),
    [headCommit, projectWorkspaces.workspaces]
  );
  const schemaCompositionWorkspace = useMemo(
    () =>
      findSchemaCompositionWorkspaceForCommit(
        projectWorkspaces.workspaces,
        headCommit,
        committedWorkspace
      ),
    [committedWorkspace, headCommit, projectWorkspaces.workspaces]
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
  const readerKind = resolveStateReaderKind(schemaName);
  const prdRenderModel = useMemo(
    () =>
      headCommit && (readerKind === 'prd' || readerKind === 'generic')
        ? selectPrdRenderModel(headCommit.content, {
            gaps: validationGaps,
            operations: effectiveOperations,
          })
        : null,
    [effectiveOperations, headCommit, readerKind, validationGaps]
  );
  const prdSchemaRegistry = useSchemaArtifactRegistry(
    projectId,
    'prd',
    Boolean(prdRenderModel && schemaCompositionWorkspace?.schemaComposition)
  );
  const skillRenderModel = useMemo(
    () =>
      headCommit && readerKind === 'skill' ? selectSkillRenderModel(headCommit.content) : null,
    [headCommit, readerKind]
  );
  const promptRenderModel = useMemo(
    () =>
      headCommit && readerKind === 'prompt'
        ? selectPromptRenderModel(headCommit.content, {
            issues: currentValidation?.issues ?? validationGaps,
            operations: effectiveOperations,
            sources: headCommit.sources,
          })
        : null,
    [currentValidation?.issues, effectiveOperations, headCommit, readerKind, validationGaps]
  );
  const skillArtifact = useSkillArtifact(
    projectId,
    headCommit?.hash ?? null,
    readerKind === 'skill'
  );
  const validationReady = currentValidation?.status === 'verified';
  const validationGapCount = currentValidation?.gapCount ?? validationGaps.length;
  const validationIssueCount = currentValidation
    ? currentValidation.errorCount + currentValidation.gapCount
    : validationGaps.length;
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
  const stateWarning = joinWarnings(snapshot.auxiliaryError, projectWorkspaces.error);
  const currentStateReturnTo = buildReturnTo(pathname, routeQuery);
  const historyHref = withReturnTo(
    `/project/${encodeURIComponent(projectId)}/history?branch=${encodeURIComponent(branchFocus)}`,
    currentStateReturnTo
  );
  const repositoryPath = getProjectRepoPath({ id: projectId, name: projectName });
  const commitCanvasHref = headCommit
    ? `${repositoryPath}?${new URLSearchParams({
        view: 'canvas',
        branch: branchFocus,
        commit: headCommit.hash,
      }).toString()}`
    : null;
  const diffHref =
    headCommit?.parents?.[0] && headCommit.hash
      ? withReturnTo(
          getProjectIdDiffPath(projectId, headCommit.parents[0], headCommit.hash),
          currentStateReturnTo
        )
      : null;
  const workspaceBasePath = `${repositoryPath}/workspaces`;
  const workspaceHref = `${workspaceBasePath}?branch=${encodeURIComponent(branchFocus || 'main')}`;
  const mainHeadCommitHash = branchHeads.main ?? null;
  const latestBranchHeadHash = branchHeads[branchFocus] ?? null;
  const availableHeadHash =
    latestBranchHeadHash &&
    headCommit &&
    latestBranchHeadHash !== headCommit.hash &&
    latestBranchHeadHash !== dismissedHeadHash
      ? latestBranchHeadHash
      : null;
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
  const checkCurrentBranchForUpdates = useCallback(async () => {
    setFreshnessChecking(true);
    try {
      await refresh();
    } finally {
      setLastCheckedAt(new Date());
      setFreshnessChecking(false);
    }
  }, [refresh]);

  useEffect(() => {
    setDismissedHeadHash(null);
    setLastCheckedAt(null);
    setStateDetailsOpen(false);
    const initialCheck = window.setTimeout(() => {
      void checkCurrentBranchForUpdates();
    }, 1100);
    const handleFocus = () => {
      void checkCurrentBranchForUpdates();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkCurrentBranchForUpdates();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearTimeout(initialCheck);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [branchFocus, checkCurrentBranchForUpdates]);

  const handleViewLatest = useCallback(() => {
    if (!availableHeadHash) return;
    inspectedHeadByBranchRef.current[branchFocus] = availableHeadHash;
    setDismissedHeadHash(null);
    setSnapshotRefreshVersion((version) => version + 1);
  }, [availableHeadHash, branchFocus]);

  const contextRailVisible = activeView !== 'canvas';
  const readinessLabel = stateReadinessLabel(validationReady);
  const lastCheckedLabel = freshnessChecking
    ? 'Checking…'
    : lastCheckedAt
      ? 'Just now'
      : 'Not checked';

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-app)] p-[7px]"
      data-state-view={activeView}
    >
      <div className="flex min-h-10 shrink-0 flex-wrap items-center rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-1 shadow-sm">
        <StateModeTabs
          activeMode={activeView === 'canvas' ? 'canvas' : 'snapshot'}
          onModeChange={(mode) => updateActiveView(mode === 'canvas' ? 'canvas' : lastSnapshotView)}
        />
      </div>

      <div
        className={cn(
          'mt-[7px] grid min-h-0 flex-1 gap-[9px] overflow-auto min-[1121px]:overflow-hidden',
          contextRailVisible && 'min-[1121px]:grid-cols-[minmax(0,1fr)_224px]'
        )}
      >
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-sm">
          {activeView !== 'canvas' ? (
            <>
              <StateRepositoryToolbar
                branch={branchFocus || 'main'}
                branchCount={branchCount}
                branchOptions={branchOptions}
                commitCount={commitCount}
                headCommitHash={mainHeadCommitHash}
                historyHref={historyHref}
                onBranchChange={updateBranchFocus}
                onCreateBranch={handleCreateBranch}
                schemaName={schemaName}
              />
              {availableHeadHash ? (
                <StateUpdateBanner
                  branch={branchFocus}
                  hash={availableHeadHash}
                  onDismiss={() => setDismissedHeadHash(availableHeadHash)}
                  onViewLatest={handleViewLatest}
                />
              ) : null}
              <StateCommitRow
                author={headCommit?.author?.name ?? headCommit?.author?.type ?? 'W'}
                commitCanvasHref={commitCanvasHref}
                hash={headCommit?.hash ?? null}
                relativeTime={formatRelativeTime(headCommit?.committed_at)}
                title={commitTitle}
                yopsCount={yopsCount}
              />
              <StateObjectLine
                diffHref={diffHref}
                diffCount={committedDiffChanges.length}
                headCommit={headCommit}
                onRunValidation={
                  headCommit && onRunValidation
                    ? () => onRunValidation(headCommit.hash, schemaName)
                    : undefined
                }
                readinessLabel={readinessLabel}
                rootKey={rootKey}
                schemaName={schemaName}
                validationError={validationError}
                validationReady={validationReady}
                validationRunning={validationRunning}
                workspaceHref={workspaceHref}
              />
              <StateViewTabs
                activeView={activeView}
                detailsOpen={stateDetailsOpen}
                onDetailsToggle={() => setStateDetailsOpen((open) => !open)}
                onViewChange={updateActiveView}
              />

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
                      schemaArtifacts={prdSchemaRegistry.artifacts}
                      schemaComposition={schemaCompositionWorkspace?.schemaComposition}
                      schemaCompositionSource={
                        schemaCompositionWorkspace === committedWorkspace
                          ? 'committed'
                          : 'workspace'
                      }
                      schemaName={schemaName}
                      schemaRegistryHref={`${repositoryPath}/schemas`}
                      validationGapCount={validationGapCount}
                      validationReady={validationReady}
                      yamlText={yamlText}
                    />
                  ) : null}
                  {activeView === 'render' && promptRenderModel ? (
                    <StatePromptReader
                      model={promptRenderModel}
                      schemaName={schemaName}
                      validationGapCount={validationIssueCount}
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
              branchHeadHash={branchHeads[branchFocus] ?? null}
              focusedCommitHash={focusedCommitHash}
              projectId={projectId}
              projectName={projectName}
              snapshotLoading={branchesLoading}
            />
          )}
        </main>

        {contextRailVisible ? (
          <aside
            className={cn(
              'hidden min-h-0 min-[1121px]:block',
              stateDetailsOpen &&
                'fixed right-3 top-24 z-40 block w-[min(310px,calc(100vw-24px))] min-[1121px]:static min-[1121px]:w-auto'
            )}
          >
            <StateContextRail
              branch={branchFocus}
              changedPathCount={committedDiffChanges.length}
              headCommit={headCommit}
              lastCheckedLabel={lastCheckedLabel}
              operations={effectiveOperations}
              projectName={projectName}
              readinessLabel={readinessLabel}
              schemaName={schemaName}
              warning={stateWarning}
            />
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function StateRepositoryToolbar({
  branch,
  branchCount,
  branchOptions,
  commitCount,
  headCommitHash,
  historyHref,
  onBranchChange,
  onCreateBranch,
  schemaName,
}: {
  branch: string;
  branchCount: number;
  branchOptions: string[];
  commitCount: number;
  headCommitHash: string | null;
  historyHref: string;
  onBranchChange: (branch: string) => void;
  onCreateBranch: (name: string) => Promise<void>;
  schemaName: string;
}) {
  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3 py-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <StateBranchControls
          branch={branch}
          branchOptions={branchOptions}
          headCommitHash={headCommitHash}
          onBranchChange={onBranchChange}
          onCreateBranch={onCreateBranch}
        />
        <span className="text-xs font-normal text-[var(--text-tertiary)]">
          {branchCount} {branchCount === 1 ? 'branch' : 'branches'}
        </span>
        <span className="text-xs font-normal text-[var(--text-tertiary)] opacity-40">/</span>
        <span className="font-mono text-xs font-normal text-[var(--text-secondary)]">
          {schemaName}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          asChild
          className="h-7 text-xs font-medium px-2.5"
          size="sm"
          variant="canvas-outline"
        >
          <Link aria-label="History" href={historyHref}>
            <History className="size-3.5 opacity-70" />
            <span>History</span>
            <span className="ml-0.5 rounded-full border border-[var(--stroke-default)] bg-[var(--surface-app)] px-1.5 py-0 text-[10px] font-mono text-[var(--text-secondary)]">
              {commitCount}
            </span>
          </Link>
        </Button>
      </div>
    </div>
  );
}

function StateUpdateBanner({
  branch,
  hash,
  onDismiss,
  onViewLatest,
}: {
  branch: string;
  hash: string;
  onDismiss: () => void;
  onViewLatest: () => void;
}) {
  return (
    <output
      aria-live="polite"
      className="flex min-h-[38px] shrink-0 flex-wrap items-center gap-2 border-b border-[var(--accent-commit)]/15 bg-[var(--accent-commit)]/5 px-3 py-1.5 text-xs leading-5 text-[var(--accent-commit)]"
    >
      <GitCommit aria-hidden="true" className="size-3.5" />
      <span>
        <strong className="font-semibold text-[var(--text-primary)]">
          Newer commit available on {branch}
        </strong>
        {' · '}
        <span className="font-mono text-xs">{shortHash(hash)}</span>
        {' · just now'}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          className="h-7 text-xs font-medium px-2"
          onClick={onDismiss}
          size="sm"
          variant="canvas-ghost"
        >
          Dismiss
        </Button>
        <Button
          className="h-7 text-xs font-medium px-2.5"
          onClick={onViewLatest}
          size="sm"
          variant="commit"
        >
          View latest
        </Button>
      </div>
    </output>
  );
}

function StateCommitRow({
  author,
  commitCanvasHref,
  hash,
  relativeTime,
  title,
  yopsCount,
}: {
  author: string;
  commitCanvasHref: string | null;
  hash: string | null;
  relativeTime: string;
  title: string;
  yopsCount: number;
}) {
  return (
    <div className="flex min-h-[40px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3.5 py-1.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-branch)]/10 text-[11px] font-medium text-[var(--accent-branch)]"
          title={`Author ${author}`}
        >
          W
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="whitespace-nowrap text-xs text-[var(--text-tertiary)] font-normal">
            Committed state · {yopsCount} deterministic {yopsCount === 1 ? 'YOp' : 'YOps'}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 text-xs text-[var(--text-tertiary)] font-normal">
        {commitCanvasHref && hash ? (
          <Link
            className="font-mono text-[var(--text-secondary)] hover:text-[var(--accent-commit)] hover:underline"
            href={commitCanvasHref}
          >
            {shortHash(hash)}
          </Link>
        ) : (
          <span className="font-mono text-[var(--text-secondary)]">
            {hash ? shortHash(hash) : 'empty'}
          </span>
        )}
        <span className="opacity-40">·</span>
        <span>{relativeTime}</span>
      </div>
    </div>
  );
}

function StateObjectLine({
  diffHref,
  diffCount,
  headCommit,
  onRunValidation,
  readinessLabel,
  rootKey,
  schemaName,
  validationError,
  validationReady,
  validationRunning,
  workspaceHref,
}: {
  diffHref: string | null;
  diffCount: number;
  headCommit: ApiCommit | null;
  onRunValidation?: () => Promise<void> | void;
  readinessLabel: string;
  rootKey: string;
  schemaName: string;
  validationError?: string | null;
  validationReady: boolean;
  validationRunning: boolean;
  workspaceHref: string;
}) {
  return (
    <div className="flex min-h-[40px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3.5 py-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="min-w-0 truncate text-xs text-[var(--text-secondary)] font-normal">
          state{' '}
          <span className="font-medium text-[var(--text-primary)]">
            {schemaArtifactFileName(schemaName)}
          </span>{' '}
          / <span className="font-medium text-[var(--text-primary)]">{rootKey}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-[var(--text-tertiary)] font-normal">
          <span>
            HEAD{' '}
            <span className="font-mono text-[var(--text-secondary)]">
              {headCommit?.hash ? shortHash(headCommit.hash) : 'empty'}
            </span>
          </span>
          {diffCount > 0 && diffHref ? (
            <Link
              className="font-medium text-[var(--text-secondary)] hover:text-[var(--accent-commit)] hover:underline"
              href={diffHref}
            >
              {diffCount} changed paths
            </Link>
          ) : null}
          <span>
            Parent{' '}
            <span className="font-mono text-[var(--text-secondary)]">
              {headCommit?.parents?.[0] ? shortHash(headCommit.parents[0]) : 'none'}
            </span>
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Badge
          className="min-h-[22px] px-2 text-[11px] font-medium"
          variant={validationReady ? 'success' : 'warning'}
        >
          {readinessLabel}
        </Badge>
        {validationError ? (
          <span
            className="max-w-44 truncate text-xs font-medium text-[var(--status-warning)]"
            title={validationError}
          >
            {validationError}
          </span>
        ) : null}
        {!validationReady && onRunValidation ? (
          <Button
            className="h-7 text-xs font-medium px-2.5"
            disabled={validationRunning}
            onClick={onRunValidation}
            size="sm"
            type="button"
            variant="commit"
          >
            <RotateCw className={cn('size-3.5', validationRunning && 'animate-spin')} />
            {validationRunning ? 'Running…' : 'Run validation'}
          </Button>
        ) : null}
        <Button
          asChild
          className="h-7 text-xs font-medium px-2.5"
          size="sm"
          variant="canvas-outline"
        >
          <Link href={workspaceHref}>Open workspace</Link>
        </Button>
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
              'border-b-2 px-3.5 py-2 text-left transition-colors',
              selected
                ? 'border-[var(--accent-commit)] text-[var(--accent-commit)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            role="tab"
            type="button"
          >
            <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium">
              <Icon aria-hidden="true" className="size-3.5 opacity-80" />
              {mode.label}
              <span className="hidden text-[11px] font-normal text-[var(--text-tertiary)] lg:inline">
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
  detailsOpen,
  onDetailsToggle,
  onViewChange,
}: {
  activeView: ProjectSnapshotView;
  detailsOpen: boolean;
  onDetailsToggle: () => void;
  onViewChange: (view: ProjectSnapshotView) => void;
}) {
  return (
    <div
      aria-label="State views"
      className="flex min-h-[38px] shrink-0 items-stretch justify-between gap-2 overflow-x-auto border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-1"
      role="tablist"
    >
      <div className="flex shrink-0 items-stretch gap-0.5">
        {SNAPSHOT_VIEWS.map((view) => {
          const Icon = view.icon;
          const selected = activeView === view.id;
          return (
            <button
              aria-selected={selected}
              className={cn(
                'min-w-24 border-b-2 px-3 py-1.5 text-left transition-colors',
                selected
                  ? 'border-[var(--accent-commit)] text-[var(--accent-commit)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
              key={view.id}
              onClick={() => onViewChange(view.id)}
              role="tab"
              type="button"
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Icon
                  aria-hidden="true"
                  className={cn('size-3.5', selected ? 'opacity-90' : 'opacity-60')}
                />
                {view.label}
              </span>
              <span className="mt-0.5 block text-[10px] leading-tight text-[var(--text-tertiary)] font-normal">
                {view.subtitle}
              </span>
            </button>
          );
        })}
      </div>
      <Button
        aria-expanded={detailsOpen}
        className="my-auto mr-1 h-7 text-xs font-medium px-2.5 min-[1121px]:hidden"
        onClick={onDetailsToggle}
        size="sm"
        type="button"
        variant="canvas-outline"
      >
        State details
      </Button>
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
      <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-1">
        <label className="relative h-[33px] w-full max-w-[270px]">
          <Search
            aria-hidden="true"
            className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <input
            className="h-full w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-elevated)] pl-8 pr-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            onChange={(event) => onPathQueryChange(event.target.value)}
            placeholder="Search paths, titles, types..."
            value={pathQuery}
          />
        </label>
        <span className="text-xs text-[var(--text-secondary)]">
          {visibleRows.length} visible {visibleRows.length === 1 ? 'row' : 'rows'}
        </span>
      </div>
      <StateScrollArea className="min-h-0 flex-1" horizontal label="State rows">
        <table className="w-full min-w-[1010px] table-fixed border-collapse text-left text-base leading-5">
          <colgroup>
            <col className="w-[250px]" />
            <col />
            <col className="w-[88px]" />
            <col className="w-[92px]" />
            <col className="w-[130px]" />
            <col className="w-[62px]" />
          </colgroup>
          <thead className="sticky top-0 z-20 bg-[var(--surface-card)] text-xs font-semibold uppercase tracking-[0.04em] text-[var(--text-secondary)] shadow-[0_1px_0_var(--stroke-divider)]">
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2">
                Path / Key
              </th>
              <th className="border-b border-[var(--stroke-divider)] px-3 py-2">Value</th>
              <th className="border-b border-[var(--stroke-divider)] px-3 py-2">Type</th>
              <th className="border-b border-[var(--stroke-divider)] px-3 py-2">Status</th>
              <th className="border-b border-[var(--stroke-divider)] px-3 py-2">Source / Op</th>
              <th className="border-b border-[var(--stroke-divider)] px-3 py-2">Issues</th>
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
        'group h-10 border-b border-[var(--stroke-divider)] text-[var(--text-primary)]',
        row.expandable && 'cursor-pointer transition-colors hover:bg-[var(--surface-hover)]',
        row.status === 'missing' && 'bg-[var(--status-warning-muted)]/25'
      )}
      onClick={row.expandable ? onToggle : undefined}
    >
      <td
        className={cn(
          'sticky left-0 z-10 border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2 font-semibold transition-colors',
          row.expandable && 'group-hover:bg-[var(--surface-hover)]',
          row.status === 'missing' && 'bg-[var(--status-warning-muted)]'
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: row.depth * 22 }}>
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
                <ChevronDown aria-hidden="true" className="size-3" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-3" />
              )}
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate" title={row.path}>
            {row.key}
          </span>
          {row.childCount ? (
            <Badge className="shrink-0 px-1.5 py-0 text-xs" variant="outline">
              {row.childCount}
            </Badge>
          ) : null}
        </span>
      </td>
      <td className="truncate px-3 py-2 text-base text-[var(--text-secondary)]" title={row.value}>
        {row.value}
      </td>
      <td className="px-3 py-2 text-base text-[var(--text-secondary)]">{row.type}</td>
      <td className="px-3 py-2">
        <StatusPill row={row} />
      </td>
      <td className="px-3 py-2 font-mono text-[13px] text-[var(--text-secondary)]">
        {row.sourceOp}
      </td>
      <td className="px-3 py-2 text-center">
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
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold', tone)}>
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
  branch,
  changedPathCount,
  headCommit,
  lastCheckedLabel,
  operations,
  projectName,
  readinessLabel,
  schemaName,
  warning,
}: {
  branch: string;
  changedPathCount: number;
  headCommit: ApiCommit | null;
  lastCheckedLabel: string;
  operations: StateOperationEntry[];
  projectName: string;
  readinessLabel: string;
  schemaName: string;
  warning: string | null;
}) {
  return (
    <RailCard title="State details">
      <dl className="grid grid-cols-[74px_minmax(0,1fr)] gap-x-2 gap-y-2.5 text-xs leading-5">
        <RailRow label="Project" value={projectName} />
        <RailRow
          label="Viewing"
          value={`${branch} · pinned ${headCommit?.hash ? shortHash(headCommit.hash) : 'empty'}`}
        />
        <RailRow
          label="HEAD"
          mono
          title={headCommit?.hash}
          value={headCommit?.hash ? shortHash(headCommit.hash) : 'empty'}
        />
        <RailRow
          label="Parent"
          mono
          title={headCommit?.parents?.[0]}
          value={headCommit?.parents?.[0] ? shortHash(headCommit.parents[0]) : 'none'}
        />
        <RailRow label="Schema" value={schemaName} />
        <RailRow label="Readiness" value={readinessLabel} />
        <RailRow label="HEAD YOps" value={String(countStateYOps(operations))} />
        <RailRow label="Changed" value={`${String(changedPathCount)} paths`} />
        <RailRow label="Last checked" value={lastCheckedLabel} />
      </dl>
      {warning ? (
        <p className="mt-3 text-xs font-medium text-[var(--status-warning)]">{warning}</p>
      ) : null}
    </RailCard>
  );
}

function RailCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3.5 shadow-sm">
      <h2 className="mb-2.5 text-base font-semibold text-[var(--text-primary)]">{title}</h2>
      <div className="leading-5 text-[var(--text-secondary)]">{children}</div>
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
      <dt className="font-normal text-[var(--text-tertiary)] text-xs">{label}</dt>
      <dd
        className={cn(
          'min-w-0 truncate font-medium text-[var(--text-primary)] text-xs',
          mono && 'font-mono text-[11px]'
        )}
        title={title ?? value}
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

function findSchemaCompositionWorkspaceForCommit(
  workspaces: WorkspaceCandidate[],
  commit: ApiCommit | null,
  committedWorkspace: WorkspaceCandidate | null
): WorkspaceCandidate | null {
  if (!commit) return null;
  if (committedWorkspace?.schemaComposition) return committedWorkspace;

  return (
    workspaces
      .filter(
        (workspace) =>
          Boolean(workspace.schemaComposition) &&
          workspace.baseCommitHash === commit.hash &&
          workspace.targetBranch === commit.branch
      )
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
          right.id.localeCompare(left.id)
      )[0] ?? null
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

  return collapseCollectionContainers(collapseDenseBooleanGroups(structuredRows));
}

function collapseCollectionContainers(rows: StateStructureRow[]): StateStructureRow[] {
  const childrenByParent = new Map<string, StateStructureRow[]>();
  for (const row of rows) {
    if (!row.parentPath) continue;
    const children = childrenByParent.get(row.parentPath) ?? [];
    children.push(row);
    childrenByParent.set(row.parentPath, children);
  }

  return rows.map((row) => {
    if (!row.expandable || row.type !== 'object' || row.depth < 2) return row;
    const children = childrenByParent.get(row.id) ?? [];
    return children.some((child) => child.type === 'array')
      ? { ...row, collapseByDefault: true }
      : row;
  });
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

function stateReadinessLabel(validationReady: boolean): string {
  return validationReady ? 'Validated at HEAD' : 'Validation pending';
}

function inferSchemaName(commit: ApiCommit | null): string {
  const provenanceSchema = commit?.provenance?.schema_ref?.name;
  if (provenanceSchema) return provenanceSchema;

  const rootKeys = new Set(commit?.content.trees?.map((tree) => tree.key) ?? []);
  if (
    rootKeys.has('prompt') ||
    ['manifest', 'contract', 'variables', 'messages', 'runtime', 'output'].every((key) =>
      rootKeys.has(key)
    )
  ) {
    return 't3x/prompt';
  }
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
