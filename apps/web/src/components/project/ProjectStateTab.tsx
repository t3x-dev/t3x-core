'use client';

import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  ExternalLink,
  FileDown,
  FileText,
  GitBranch,
  GitCommit,
  History,
  Link2,
  type LucideIcon,
  Network,
  Play,
  Search,
  ShieldCheck,
  TableProperties,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasWorkspace } from '@/components/canvas';
import { StateNodeHistoryPanel } from '@/components/history/StateNodeHistoryPanel';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { StateBranchControls } from '@/components/project/StateBranchControls';
import { StateCodeView } from '@/components/project/StateCodeView';
import { StateGenericReader } from '@/components/project/StateGenericReader';
import { StatePrdReader } from '@/components/project/StatePrdReader';
import { StatePromptReader } from '@/components/project/StatePromptReader';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { StateSkillReader } from '@/components/project/StateSkillReader';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  buildStructuredStateDiff,
  type StructuredDiffChange,
  type StructuredDiffKind,
} from '@/domain/diff/structuredStateDiff';
import { shortHash } from '@/domain/format/formatters';
import {
  getProjectIdDiffPath,
  getProjectOutputsPath,
  getProjectRepoPath,
} from '@/domain/project/repoPath';
import {
  buildCanonicalStateYaml,
  buildStatePointRows,
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
import { repositoryConversationSourceHref } from '@/domain/sourceEvidenceNavigation';
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
type BranchFocus = string;

interface ProjectStateTabProps {
  initialView?: ProjectStateView;
  onRunValidation?: (commitHash: string, schemaName: string) => Promise<void> | void;
  projectDescription?: string;
  projectId: string;
  projectName: string;
  projectTags?: string[];
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
  icon: typeof TableProperties;
}> = [
  { id: 'render', label: 'Render', icon: FileText },
  { id: 'structure', label: 'Structure', icon: TableProperties },
  { id: 'code', label: 'Code', icon: Code2 },
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
  initialView = 'render',
  projectDescription = '',
  projectId,
  projectName,
  projectTags = [],
  validation,
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
  const branchFocus: BranchFocus = searchParams.get('branch')?.trim() || 'main';
  const focusedCommitHash = searchParams.get('commit')?.trim() || undefined;
  const [pathQuery, setPathQuery] = useState('');
  const [snapshotRefreshVersion, setSnapshotRefreshVersion] = useState(0);
  const [, setFreshnessChecking] = useState(false);
  const [, setLastCheckedAt] = useState<Date | null>(null);
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
  }, [routeView]);

  const updateActiveView = useCallback(
    (view: ProjectStateView) => {
      setActiveView(view);
      const params = new URLSearchParams(routeQueryRef.current);
      if (view === 'render') params.delete('view');
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
  const aboutDescription =
    projectDescription.trim() || `${projectName} is a versioned structured state project.`;
  const aboutTags = useMemo(
    () => buildStateAboutTags(projectTags, readerKind, schemaName),
    [projectTags, readerKind, schemaName]
  );
  const prdRenderModel = useMemo(
    () =>
      headCommit && readerKind === 'prd'
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
  const commitCount = snapshot.commits.length;
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
  const currentStateReturnTo = buildReturnTo(pathname, routeQuery);
  const historyHref = withReturnTo(
    `/project/${encodeURIComponent(projectId)}/history?branch=${encodeURIComponent(branchFocus)}`,
    currentStateReturnTo
  );
  const repositoryPath = getProjectRepoPath({ id: projectId, name: projectName });
  const diffHref =
    headCommit?.parents[0] && committedDiffChanges.length > 0
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

  const renderExportReady = Boolean(prdRenderModel || (headCommit && readerKind === 'generic'));
  const handleExportPdf = useCallback(() => {
    if (!renderExportReady) return;
    if (activeView !== 'render') updateActiveView('render');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
  }, [activeView, renderExportReady, updateActiveView]);

  const contextRailVisible = activeView !== 'canvas';
  const headModifiedRelativeTime = formatRelativeTime(headCommit?.committed_at);
  const headChangeReason = headCommit?.message?.trim() ?? '';

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-app)]"
      data-state-view={activeView}
    >
      {activeView === 'canvas' ? (
        <div className="m-[7px] mb-0 flex min-h-10 shrink-0 flex-wrap items-center justify-end gap-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 shadow-sm">
          <StateViewLinks
            canvasActive={true}
            commitCount={commitCount}
            historyHref={historyHref}
            onCanvasClick={() => updateActiveView('canvas')}
          />
          <StateUseButton href={workspaceHref} />
        </div>
      ) : null}

      <div
        className={cn(
          'grid min-h-0 flex-1 overflow-hidden',
          contextRailVisible && 'min-[1121px]:grid-cols-[210px_minmax(0,1fr)]'
        )}
      >
        {contextRailVisible ? (
          <StateRelationshipsRail
            aboutDescription={aboutDescription}
            aboutTags={aboutTags}
            branch={branchFocus || 'main'}
            changeCount={committedDiffChanges.length}
            commitCount={commitCount}
            currentStateReturnTo={currentStateReturnTo}
            diffHref={diffHref}
            headCommit={headCommit}
            historyHref={historyHref}
            projectId={projectId}
            projectName={projectName}
            schemaHref={`${repositoryPath}/schemas`}
            schemaName={schemaName}
            validationGapCount={validationGapCount}
            validationReady={validationReady}
            workspaceHref={workspaceHref}
            workspaces={projectWorkspaces.workspaces}
          />
        ) : null}

        <main
          className={cn(
            'flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--surface-panel)]',
            contextRailVisible
              ? 'border-r border-[var(--stroke-divider)]'
              : 'm-[7px] rounded-md border border-[var(--stroke-divider)] shadow-sm'
          )}
        >
          {activeView !== 'canvas' ? (
            <>
              <StateUnifiedToolbar
                branch={branchFocus || 'main'}
                branchOptions={branchOptions}
                commitCount={commitCount}
                headCommit={headCommit}
                headCommitHash={mainHeadCommitHash}
                historyHref={historyHref}
                onBranchChange={updateBranchFocus}
                onCreateBranch={handleCreateBranch}
                onCanvasClick={() => updateActiveView('canvas')}
                workspaceHref={workspaceHref}
              />
              {availableHeadHash ? (
                <StateUpdateBanner
                  branch={branchFocus}
                  hash={availableHeadHash}
                  onDismiss={() => setDismissedHeadHash(availableHeadHash)}
                  onViewLatest={handleViewLatest}
                />
              ) : null}
              <StateViewTabs
                activeView={activeView}
                exportPdfReady={renderExportReady}
                onExportPdf={handleExportPdf}
                onPathQueryChange={setPathQuery}
                onViewChange={updateActiveView}
                pathQuery={pathQuery}
              />

              {snapshot.primaryError ? (
                <StateEmpty message={snapshot.primaryError} title="No committed state loaded" />
              ) : null}
              {!snapshot.primaryError && !snapshot.loading && !headCommit ? (
                <StateEmpty
                  message="Create or select a committed branch to inspect state as Render, Structure, or Code."
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
                      branch={branchFocus || 'main'}
                      changeReason={headChangeReason}
                      diffChanges={committedDiffChanges}
                      headCommit={headCommit}
                      modifiedLabel={headModifiedRelativeTime}
                      pathQuery={pathQuery}
                      rows={pointRows}
                      schemaName={schemaName}
                      validationIssues={currentValidation?.issues ?? validationGaps}
                      validationReady={validationReady}
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
                      headCommitHash={headCommit.hash}
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
                    />
                  ) : null}
                  {activeView === 'render' && readerKind === 'generic' ? (
                    <StateGenericReader
                      branch={branchFocus || 'main'}
                      headCommitHash={headCommit.hash}
                      rows={pointRows}
                      schemaName={schemaName}
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
                  {activeView === 'code' ? (
                    <StateCodeView
                      branch={branchFocus || 'main'}
                      rootKey={rootKey}
                      validationReady={validationReady}
                      yamlText={yamlText}
                    />
                  ) : null}
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
      </div>
    </section>
  );
}

function StateUnifiedToolbar({
  branch,
  branchOptions,
  commitCount,
  headCommit,
  headCommitHash,
  historyHref,
  onBranchChange,
  onCreateBranch,
  onCanvasClick,
  workspaceHref,
}: {
  branch: string;
  branchOptions: string[];
  commitCount: number;
  headCommit: ApiCommit | null;
  headCommitHash: string | null;
  historyHref: string;
  onBranchChange: (branch: string) => void;
  onCreateBranch: (name: string) => Promise<void>;
  onCanvasClick: () => void;
  workspaceHref: string;
}) {
  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-1.5 shadow-xs">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <StateBranchControls
          branch={branch}
          branchOptions={branchOptions}
          headCommitHash={headCommitHash}
          onBranchChange={onBranchChange}
          onCreateBranch={onCreateBranch}
        />
        {headCommit ? <h2 className="sr-only">{headCommit.message || 'Committed state'}</h2> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          asChild
          className="h-7 rounded-[5px] px-2.5 text-xs font-medium shadow-[var(--fx-shadow-sm)]"
          size="sm"
          variant="canvas-outline"
        >
          <Link href={workspaceHref}>Open workspace</Link>
        </Button>

        <StateViewLinks
          canvasActive={false}
          commitCount={commitCount}
          historyHref={historyHref}
          onCanvasClick={onCanvasClick}
        />
        <StateUseButton href={workspaceHref} />
      </div>
    </div>
  );
}

function StateUseButton({ href }: { href: string }) {
  return (
    <Button
      asChild
      className="h-7 rounded-[5px] bg-[var(--accent-commit)] px-2.5 text-xs font-semibold !text-[var(--primary-foreground)] shadow-[var(--fx-shadow-sm)] hover:bg-[var(--accent-commit)]/90 [&_svg]:!text-[var(--primary-foreground)]"
      size="sm"
      variant="commit"
    >
      <Link href={href}>
        <Play aria-hidden="true" className="size-3.5" />
        Use this state
      </Link>
    </Button>
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

function StateViewLinks({
  canvasActive,
  commitCount,
  historyHref,
  onCanvasClick,
}: {
  canvasActive: boolean;
  commitCount: number;
  historyHref: string;
  onCanvasClick: () => void;
}) {
  return (
    <div
      aria-label="State related views"
      className="inline-flex h-7 shrink-0 items-center overflow-hidden rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] p-[1px] shadow-[var(--fx-shadow-sm)]"
      role="toolbar"
    >
      <button
        aria-pressed={canvasActive}
        className={cn(
          'inline-flex h-full items-center gap-1.5 rounded-[4px] px-2.5 text-xs font-medium transition-colors',
          canvasActive
            ? 'bg-[var(--accent-commit)] text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)]'
            : 'bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
        )}
        onClick={onCanvasClick}
        type="button"
      >
        <Network aria-hidden="true" className="size-3.5 opacity-80" />
        <span className="whitespace-nowrap">Canvas</span>
      </button>
      <Link
        aria-label="History"
        className="inline-flex h-full items-center gap-1.5 rounded-[4px] bg-[var(--surface-panel)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
        href={historyHref}
      >
        <History aria-hidden="true" className="size-3.5 opacity-80" />
        <span>History</span>
        <span className="ml-0.5 rounded-full border border-[var(--stroke-default)] bg-[var(--surface-app)] px-1.5 py-0 font-mono text-xs leading-4 text-[var(--text-secondary)]">
          {commitCount}
        </span>
      </Link>
    </div>
  );
}

type StateRailTone = 'branch' | 'commit' | 'neutral' | 'source' | 'success' | 'warning';

interface StateRailItem {
  href?: string;
  icon: LucideIcon;
  id: string;
  label: string;
  meta?: string;
  tone?: StateRailTone;
}

function StateRelationshipsRail({
  aboutDescription,
  aboutTags,
  branch,
  changeCount,
  commitCount,
  currentStateReturnTo,
  diffHref,
  headCommit,
  historyHref,
  projectId,
  projectName,
  schemaHref,
  schemaName,
  validationGapCount,
  validationReady,
  workspaceHref,
  workspaces,
}: {
  aboutDescription: string;
  aboutTags: string[];
  branch: string;
  changeCount: number;
  commitCount: number;
  currentStateReturnTo: string;
  diffHref: string | null;
  headCommit: ApiCommit | null;
  historyHref: string;
  projectId: string;
  projectName: string;
  schemaHref: string;
  schemaName: string;
  validationGapCount: number;
  validationReady: boolean;
  workspaceHref: string;
  workspaces: WorkspaceCandidate[];
}) {
  const headCommitHash = headCommit?.hash ?? null;
  const authorLabel = headCommit?.author?.name?.trim() || headCommit?.author?.id?.trim() || null;
  const revisionItems = useMemo<StateRailItem[]>(
    () => [
      {
        href: schemaHref,
        icon: FileText,
        id: 'state-schema',
        label: schemaName,
        meta: 'Schema',
        tone: 'commit',
      },
      ...(headCommitHash
        ? [
            {
              href: historyHref,
              icon: GitCommit,
              id: 'state-head',
              label: `HEAD ${shortHash(headCommitHash)}`,
              meta: 'Current revision',
              tone: 'commit' as const,
            },
          ]
        : []),
      {
        href: historyHref,
        icon: History,
        id: 'state-commits',
        label: stateCountLabel(commitCount, 'commit'),
        meta: 'History',
      },
      ...(changeCount > 0 && diffHref
        ? [
            {
              href: diffHref,
              icon: Network,
              id: 'state-changes',
              label: stateCountLabel(changeCount, 'change'),
              meta: 'Compare with parent',
              tone: 'warning' as const,
            },
          ]
        : []),
      ...(authorLabel
        ? [
            {
              icon: UserRound,
              id: 'state-author',
              label: authorLabel,
              meta: headCommit?.committed_at
                ? `Updated ${formatRelativeTime(headCommit.committed_at)}`
                : 'Last changed by',
            },
          ]
        : []),
    ],
    [
      authorLabel,
      changeCount,
      commitCount,
      diffHref,
      headCommit?.committed_at,
      headCommitHash,
      historyHref,
      schemaHref,
      schemaName,
    ]
  );
  const validationItems = useMemo<StateRailItem[]>(
    () => [
      {
        icon: validationReady ? ShieldCheck : Search,
        id: 'state-validation',
        label: validationReady
          ? 'Validated'
          : validationGapCount > 0
            ? stateCountLabel(validationGapCount, 'gap')
            : 'Validation pending',
        meta: validationReady
          ? 'No validation gaps'
          : validationGapCount > 0
            ? 'Needs attention'
            : 'Not verified at HEAD',
        tone: validationReady ? ('success' as const) : ('warning' as const),
      },
    ],
    [validationGapCount, validationReady]
  );
  const sourceItems = useMemo(
    () => summarizeCommitSources(headCommit, projectId, projectName, branch, currentStateReturnTo),
    [branch, currentStateReturnTo, headCommit, projectId, projectName]
  );
  const usageItems = useMemo(
    () => summarizeStateUsage(workspaces, branch, workspaceHref, projectId, projectName),
    [branch, projectId, projectName, workspaceHref, workspaces]
  );

  return (
    <aside
      aria-label="State relationships"
      className="hidden min-h-0 flex-col border-r border-[var(--stroke-divider)] bg-[var(--surface-card)] min-[1121px]:flex"
    >
      <StateScrollArea
        className="min-h-0 flex-1 bg-[var(--surface-card)]"
        label="State relationships"
      >
        <div className="px-2">
          <StateRailSection title="About">
            <p className="px-2 text-[13px] leading-5 text-[var(--text-secondary)]">
              {aboutDescription}
            </p>
            {aboutTags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5 px-2">
                {aboutTags.map((tag) => (
                  <span
                    className="inline-flex min-h-5 items-center rounded-[4px] border border-[var(--stroke-divider)] bg-[var(--surface-app)] px-1.5 py-0.5 text-xs font-medium leading-4 text-[var(--text-secondary)]"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </StateRailSection>

          <StateRailSection title="Revision">
            <div className="grid gap-0.5">
              {revisionItems.map((item) => (
                <StateRailRow item={item} key={item.id} />
              ))}
            </div>
          </StateRailSection>

          <StateRailSection title="Validation">
            <div className="grid gap-0.5">
              {validationItems.map((item) => (
                <StateRailRow item={item} key={item.id} />
              ))}
            </div>
          </StateRailSection>

          {sourceItems.length > 0 ? (
            <StateRailSection title="Sources">
              <div className="grid gap-0.5">
                {sourceItems.map((item) => (
                  <StateRailRow item={item} key={item.id} />
                ))}
              </div>
            </StateRailSection>
          ) : null}

          {usageItems.length > 0 ? (
            <StateRailSection title="Used by">
              <div className="grid gap-0.5">
                {usageItems.map((item) => (
                  <StateRailRow item={item} key={item.id} />
                ))}
              </div>
            </StateRailSection>
          ) : null}
        </div>
      </StateScrollArea>
    </aside>
  );
}

function StateRailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="border-t border-[var(--stroke-divider)] py-2.5 first:border-t-0 first:pt-3 last:pb-2.5">
      <h2 className="mb-1.5 px-2 text-xs font-semibold leading-4 text-[var(--text-tertiary)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StateRailRow({ item }: { item: StateRailItem }) {
  const Icon = item.icon;
  const content = (
    <>
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-[5px] transition-colors',
          stateRailToneClass(item.tone ?? 'neutral')
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-[18px] text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">
          {item.label}
        </span>
        {item.meta ? (
          <span className="block truncate text-xs font-normal leading-4 text-[var(--text-tertiary)] transition-colors group-hover:text-[var(--text-secondary)]">
            {item.meta}
          </span>
        ) : null}
      </span>
      {item.href ? (
        <ExternalLink
          aria-hidden="true"
          className="size-3 shrink-0 text-[var(--text-quaternary)] transition-colors group-hover:text-[var(--text-tertiary)]"
        />
      ) : null}
    </>
  );
  const className =
    'group flex min-h-10 min-w-0 items-center gap-2.5 rounded-[5px] px-2 py-1 text-left transition-colors';

  if (item.href) {
    return (
      <Link
        className={`${className} hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50`}
        href={item.href}
        title={item.label}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={className} title={item.label}>
      {content}
    </div>
  );
}

function stateRailToneClass(tone: StateRailTone): string {
  if (tone === 'branch') {
    return 'bg-[color-mix(in_srgb,var(--accent-branch)_10%,transparent)] text-[var(--accent-branch)] group-hover:bg-[color-mix(in_srgb,var(--accent-branch)_16%,transparent)]';
  }
  if (tone === 'commit') {
    return 'bg-[color-mix(in_srgb,var(--accent-commit)_10%,transparent)] text-[var(--accent-commit)] group-hover:bg-[color-mix(in_srgb,var(--accent-commit)_16%,transparent)]';
  }
  if (tone === 'source') {
    return 'bg-[color-mix(in_srgb,var(--source)_10%,transparent)] text-[var(--source)] group-hover:bg-[color-mix(in_srgb,var(--source)_16%,transparent)]';
  }
  if (tone === 'success') {
    return 'bg-[var(--status-success-muted)] text-[var(--status-success)] group-hover:bg-[color-mix(in_srgb,var(--status-success)_14%,transparent)]';
  }
  if (tone === 'warning') {
    return 'bg-[var(--status-warning-muted)] text-[var(--status-warning)] group-hover:bg-[color-mix(in_srgb,var(--status-warning)_14%,transparent)]';
  }
  return 'bg-[var(--surface-app)] text-[var(--text-tertiary)] group-hover:bg-[var(--surface-hover)]';
}

function stateCountLabel(count: number, singular: string): string {
  return `${String(count)} ${count === 1 ? singular : `${singular}s`}`;
}

function buildStateAboutTags(
  projectTags: string[],
  readerKind: ReturnType<typeof resolveStateReaderKind>,
  schemaName: string
): string[] {
  const candidates = [
    ...projectTags,
    'structured state',
    ...(readerKind === 'generic' ? [] : [readerKind]),
    schemaName,
    'versioned',
  ];
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const candidate of candidates) {
    const tag = candidate.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === 5) break;
  }

  return tags;
}

function summarizeCommitSources(
  headCommit: ApiCommit | null,
  projectId: string,
  projectName: string,
  branch: string,
  currentStateReturnTo: string
): StateRailItem[] {
  return (headCommit?.sources ?? []).map((source, index) => {
    const label = source.title?.trim() || source.id;
    const href =
      source.type === 'conversation'
        ? repositoryConversationSourceHref({
            branch,
            commitId: headCommit?.hash ?? null,
            conversationId: source.id,
            projectId,
            returnTo: currentStateReturnTo,
          })
        : source.type === 'leaf'
          ? getProjectOutputsPath({ id: projectId, name: projectName }, source.id)
          : undefined;

    return {
      href,
      icon: FileText,
      id: `${source.type}:${source.id}:${String(index)}`,
      label,
      meta: sourceTypeLabel(source.type),
      tone: 'source',
    };
  });
}

function summarizeStateUsage(
  workspaces: WorkspaceCandidate[],
  branch: string,
  workspaceHref: string,
  projectId: string,
  projectName: string
): StateRailItem[] {
  const branchWorkspaces = workspaces
    .filter((workspace) => workspace.targetBranch === branch)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const workspaceItems = branchWorkspaces.slice(0, 3).map((workspace) => ({
    href: workspaceHref,
    icon: Network,
    id: `workspace:${workspace.id}`,
    label: workspace.title,
    meta: workspaceStatusLabel(workspace.status),
    tone: 'branch' as const,
  }));
  const outputTargets = uniqueOutputTargets(
    branchWorkspaces.flatMap((workspace) => workspace.outputTargets)
  );
  const outputItems = outputTargets.slice(0, 3).map((target) => ({
    href: getProjectOutputsPath({ id: projectId, name: projectName }, target.id),
    icon: FileText,
    id: `output:${target.id}`,
    label: target.title,
    meta: outputTargetLabel(target),
    tone: 'commit' as const,
  }));

  return [...workspaceItems, ...outputItems];
}

function uniqueOutputTargets(
  targets: Array<WorkspaceCandidate['outputTargets'][number]>
): Array<WorkspaceCandidate['outputTargets'][number]> {
  const seen = new Set<string>();
  const unique: Array<WorkspaceCandidate['outputTargets'][number]> = [];
  for (const target of targets) {
    if (seen.has(target.id)) continue;
    seen.add(target.id);
    unique.push(target);
  }
  return unique;
}

function sourceTypeLabel(type: string): string {
  if (type === 'conversation') return 'conversation';
  if (type === 'leaf') return 'leaf source';
  if (type === 'import') return 'import';
  return type || 'source';
}

function workspaceStatusLabel(status: WorkspaceCandidate['status']): string {
  if (status === 'ready_for_yops') return 'ready for YOps';
  if (status === 'schema_review') return 'schema review';
  return status;
}

function outputTargetLabel(target: WorkspaceCandidate['outputTargets'][number]): string {
  return `${target.format.toUpperCase()} ${target.type}`;
}

function StateViewTabs({
  activeView,
  exportPdfReady,
  onExportPdf,
  onPathQueryChange,
  onViewChange,
  pathQuery,
}: {
  activeView: ProjectSnapshotView;
  exportPdfReady: boolean;
  onExportPdf: () => void;
  onPathQueryChange: (query: string) => void;
  onViewChange: (view: ProjectSnapshotView) => void;
  pathQuery: string;
}) {
  return (
    <div className="flex min-h-[42px] shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3">
      <div
        aria-label="State views"
        className="inline-flex h-8 shrink-0 items-center gap-[2px] rounded-[6px] bg-[var(--surface-app)] p-[2px] text-[13px] font-medium leading-[18px]"
        role="tablist"
      >
        {SNAPSHOT_VIEWS.map((view) => {
          const Icon = view.icon;
          const selected = activeView === view.id;
          return (
            <button
              aria-selected={selected}
              className={cn(
                'inline-flex h-7 min-w-[92px] items-center justify-center gap-1.5 rounded-[5px] border px-2.5 transition-[background-color,border-color,box-shadow,color]',
                selected
                  ? 'border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--accent-commit)] shadow-[var(--fx-shadow-sm)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]'
              )}
              key={view.id}
              onClick={() => onViewChange(view.id)}
              role="tab"
              type="button"
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  'size-3.5 shrink-0',
                  selected ? 'text-[var(--accent-commit)]' : 'text-[var(--text-tertiary)]'
                )}
              />
              <span>{view.label}</span>
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {activeView === 'structure' ? (
          <label className="group relative h-8 w-[min(280px,32vw)] min-w-[190px] rounded-[6px] bg-[var(--surface-app)] p-[2px] transition-colors focus-within:bg-[var(--accent-commit)]/10">
            <span className="pointer-events-none absolute left-[9px] top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-[4px] text-[var(--text-tertiary)] transition-colors group-focus-within:text-[var(--accent-commit)]">
              <Search aria-hidden="true" className="size-3.5" />
            </span>
            <input
              className="h-full w-full rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] pl-8 pr-3 text-[13px] leading-[18px] text-[var(--text-primary)] outline-none shadow-[var(--fx-shadow-sm)] transition-[border-color,box-shadow,color] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-commit)]"
              onChange={(event) => onPathQueryChange(event.target.value)}
              placeholder="Search state..."
              value={pathQuery}
            />
          </label>
        ) : null}
        <Button
          aria-label="Export PDF"
          className="h-8 rounded-[5px] px-2.5 text-[13px] font-medium leading-[18px] shadow-[var(--fx-shadow-sm)]"
          disabled={!exportPdfReady}
          onClick={onExportPdf}
          size="sm"
          title={
            exportPdfReady
              ? 'Export the rendered state as PDF'
              : 'PDF export is available for rendered state documents'
          }
          type="button"
          variant="canvas-outline"
        >
          <FileDown aria-hidden="true" className="size-3.5" />
          Export PDF
        </Button>
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

export function StateStructureView({
  branch,
  changeReason,
  diffChanges,
  headCommit,
  modifiedLabel,
  pathQuery,
  rows,
  schemaName,
  validationIssues,
  validationReady,
  readOnly = false,
  inlineDiff = false,
  nodeHistoryEnabled = false,
}: {
  branch: string;
  changeReason: string;
  diffChanges: StructuredDiffChange[];
  headCommit: ApiCommit;
  modifiedLabel: string;
  pathQuery: string;
  rows: StatePointRow[];
  schemaName: string;
  validationIssues: StateInspectorValidationIssue[];
  validationReady: boolean;
  readOnly?: boolean;
  inlineDiff?: boolean;
  nodeHistoryEnabled?: boolean;
}) {
  const [expansionOverrides, setExpansionOverrides] = useState<Record<string, boolean>>({});
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const structureRows = useMemo(
    () => buildStateStructureRows(rows, diffChanges),
    [diffChanges, rows]
  );
  const expandedChanges = useMemo(() => {
    const expanded = new Set<string>();
    if (!inlineDiff) return expanded;
    const rowsByPath = new Map(structureRows.map((row) => [row.path, row]));
    for (const row of structureRows) {
      if (!row.diff) continue;
      let ancestor: StateStructureRow | undefined = row;
      while (ancestor) {
        expanded.add(ancestor.id);
        ancestor = ancestor.parentPath ? rowsByPath.get(ancestor.parentPath) : undefined;
      }
    }
    return expanded;
  }, [inlineDiff, structureRows]);
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
            isStateStructureRowExpanded(row, expansionOverrides, expandedChanges.has(row.id))
          ),
    [expandedChanges, expansionOverrides, filteredRows, searching, structureRows]
  );
  const selectedRow = useMemo(
    () =>
      (selectedRowId ? visibleRows.find((row) => row.id === selectedRowId) : null) ??
      visibleRows.find((row) => row.diff?.exact) ??
      visibleRows.find((row) => row.diff) ??
      visibleRows[0] ??
      null,
    [selectedRowId, visibleRows]
  );
  const changedRows = useMemo(() => visibleRows.filter((row) => row.diff), [visibleRows]);
  const selectedPositionLabel = useMemo(() => {
    if (!selectedRow) return null;
    const positionRows = selectedRow.diff ? changedRows : visibleRows;
    const selectedIndex = positionRows.findIndex((row) => row.id === selectedRow.id);
    if (selectedIndex < 0 || positionRows.length === 0) return null;
    return `${selectedIndex + 1} of ${positionRows.length}`;
  }, [changedRows, selectedRow, visibleRows]);

  const toggleRow = useCallback(
    (row: StateStructureRow) => {
      setExpansionOverrides((current) => ({
        ...current,
        [row.id]: !isStateStructureRowExpanded(row, current, expandedChanges.has(row.id)),
      }));
    },
    [expandedChanges]
  );
  return (
    <section
      aria-label="Structured state tree"
      className="grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(260px,38vh)] overflow-hidden bg-[var(--surface-app)] min-[1180px]:grid-cols-[minmax(0,1fr)_340px] min-[1180px]:grid-rows-1"
    >
      <StateScrollArea
        className="min-h-0 min-w-0 flex-1 border-x border-t border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
        label="State rows"
      >
        <table className="w-full min-w-0 table-fixed border-separate border-spacing-0 text-left">
          <colgroup>
            <col className={inlineDiff ? 'w-[27%]' : 'w-[29%]'} />
            <col className={inlineDiff ? 'w-[42%]' : 'w-[34%]'} />
            <col className={inlineDiff ? 'w-[22%]' : 'w-[28%]'} />
            <col className="w-[9%]" />
          </colgroup>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-[13px] text-[var(--text-tertiary)]">
                  {searching ? 'No matching state nodes.' : 'No state nodes in this snapshot.'}
                </td>
              </tr>
            )}
            {visibleRows.map((row) => (
              <StatePointTableRow
                changeReason={changeReason}
                expanded={
                  searching ||
                  isStateStructureRowExpanded(row, expansionOverrides, expandedChanges.has(row.id))
                }
                inlineDiff={inlineDiff}
                key={row.id}
                modifiedLabel={modifiedLabel}
                onSelect={() => setSelectedRowId(row.id)}
                onToggle={() => toggleRow(row)}
                row={row}
                selected={selectedRow?.id === row.id}
              />
            ))}
          </tbody>
        </table>
      </StateScrollArea>
      <StateSelectedNodeInspector
        readOnly={readOnly}
        nodeHistoryEnabled={nodeHistoryEnabled}
        branch={branch}
        changeReason={changeReason}
        headCommit={headCommit}
        modifiedLabel={modifiedLabel}
        positionLabel={selectedPositionLabel}
        row={selectedRow}
        schemaName={schemaName}
        validationIssues={validationIssues}
        validationReady={validationReady}
      />
    </section>
  );
}

interface StateStructureRow extends StatePointRow {
  childCount?: number;
  collapseByDefault?: boolean;
  diff?: StateStructureDiffMeta;
  parentPath: string | null;
  removedFromParent?: boolean;
  virtualGroup?: boolean;
}

interface StateStructureDiffMeta {
  afterValue: string;
  beforeValue: string;
  count: number;
  evidence?: string;
  evidenceSource?: string;
  exact: boolean;
  kind: StructuredDiffKind;
  op: string;
  reason: string;
  summary: string;
}

type NormalizedStructuredDiffChange = StructuredDiffChange & { path: string };

function StatePointTableRow({
  changeReason,
  expanded,
  modifiedLabel,
  onSelect,
  onToggle,
  row,
  selected,
  inlineDiff = false,
}: {
  changeReason: string;
  expanded: boolean;
  modifiedLabel: string;
  onSelect: () => void;
  onToggle: () => void;
  row: StateStructureRow;
  selected: boolean;
  inlineDiff?: boolean;
}) {
  const expandableLabel = `${expanded ? 'Collapse' : 'Expand'} ${row.key}`;
  const changedInCommit = Boolean(row.diff);
  const showModifiedLabel =
    row.diff?.exact ||
    (changedInCommit && row.depth === 0) ||
    row.diff?.kind === 'added' ||
    row.diff?.kind === 'removed' ||
    (!changedInCommit && row.status !== 'unchanged' && row.status !== 'missing');
  const rowHeightClass = stateStructureRowHeightClass(row);

  return (
    <tr
      aria-selected={selected}
      data-diff-exact={row.diff?.exact ? 'true' : undefined}
      data-diff-kind={row.diff?.kind}
      data-selected={selected ? 'true' : undefined}
      className={cn(
        'group cursor-pointer text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]/45',
        rowHeightClass,
        stateStructureRowToneClass(row),
        !changedInCommit && row.depth > 0 && row.expandable && 'bg-[var(--surface-app)]/55',
        !changedInCommit && row.status === 'missing' && 'bg-[var(--status-warning-muted)]/25',
        selected && '[&>td]:bg-[var(--panel)]'
      )}
      onClick={() => {
        onSelect();
        if (row.expandable) onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect();
        if (row.expandable) onToggle();
      }}
      tabIndex={0}
    >
      <td className="sticky left-0 z-10 border-b border-[var(--stroke-divider)] bg-inherit py-0 pl-4 pr-5">
        <StateDiffGutter diff={row.diff} />
        <span
          className={cn('flex min-w-0 items-center gap-1.5', rowHeightClass)}
          style={{ paddingLeft: row.depth * 16 }}
        >
          {row.expandable ? (
            <button
              aria-expanded={expanded}
              aria-label={expandableLabel}
              className="-m-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40"
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
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
            <span aria-hidden="true" className="size-5 shrink-0" />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              stateStructureKeyTypographyClass(row),
              row.status === 'missing' && 'text-[var(--status-warning)]'
            )}
            title={row.path}
          >
            {row.key}
          </span>
          {row.expandable && row.childCount ? (
            <span className="ml-1 shrink-0 font-mono text-xs font-medium leading-4 tabular-nums text-[var(--text-tertiary)]">
              {row.childCount}
            </span>
          ) : null}
        </span>
      </td>
      <td className="border-b border-[var(--stroke-divider)] bg-inherit px-4 py-0">
        {inlineDiff && row.diff?.exact ? (
          <StateInlineDiffValue diff={row.diff} />
        ) : (
          <StateValueCell row={row} />
        )}
      </td>
      <td className="border-b border-[var(--stroke-divider)] bg-inherit px-4 py-0">
        <StateEffectCell changeReason={changeReason} row={row} />
      </td>
      <td className="relative whitespace-nowrap border-b border-[var(--stroke-divider)] bg-inherit py-0 pl-3 pr-8 text-right font-sans text-xs font-normal italic leading-4 tracking-[0.01em] tabular-nums text-[var(--text-tertiary)]">
        {selected ? (
          <span
            aria-hidden="true"
            className="-translate-y-1/2 absolute right-2 top-1/2 z-20 hidden size-2.5 rounded-full border border-[var(--surface-card)] bg-[var(--accent-commit)] min-[1180px]:block"
          />
        ) : null}
        {showModifiedLabel ? modifiedLabel : null}
      </td>
    </tr>
  );
}

function stateStructureKeyTypographyClass(row: StateStructureRow): string {
  const machineKey = stateStructureMachineKey(row.key);
  if (machineKey) {
    return cn(
      'font-mono text-[13px] leading-5 tracking-normal',
      row.diff?.kind === 'removed'
        ? 'font-medium text-[var(--diff-removed-text)]'
        : row.expandable
          ? 'font-medium text-[var(--text-primary)]'
          : 'font-medium text-[var(--text-secondary)]'
    );
  }
  if (row.expandable && row.depth === 0) {
    return 'font-sans text-[14px] font-semibold leading-5 tracking-normal text-[var(--text-primary)]';
  }
  if (row.expandable && row.depth === 1) {
    return 'font-sans text-[14px] font-semibold leading-5 tracking-normal text-[var(--text-primary)]';
  }
  if (row.expandable) {
    return 'font-sans text-[13px] font-semibold leading-5 tracking-normal text-[var(--text-primary)]';
  }
  if (row.diff?.kind === 'removed') {
    return 'font-sans text-[13px] font-medium leading-5 tracking-normal text-[var(--diff-removed-text)]';
  }
  return 'font-sans text-[13px] font-medium leading-5 tracking-normal text-[var(--text-secondary)]';
}

function stateStructureMachineKey(value: string): boolean {
  return value.includes('_') || value.includes('/') || /\d/.test(value);
}

function stateStructureRowHeightClass(row: StateStructureRow): string {
  if (row.expandable) return 'h-9';
  return 'h-[34px]';
}

function StateInlineDiffValue({ diff }: { diff: StateStructureDiffMeta }) {
  return (
    <div className="min-w-0 py-1 text-[13px] leading-5">
      {diff.kind !== 'added' && (
        // biome-ignore lint/a11y/useSemanticElements: This groups read-only diff text, not form controls for a fieldset.
        <div
          role="group"
          aria-label="Before value"
          className="flex items-start gap-2 text-[var(--diff-removed-text)]"
        >
          <span aria-hidden="true" className="w-3 shrink-0 font-mono">
            −
          </span>
          <span className="sr-only">Before: </span>
          <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {diff.beforeValue}
          </span>
        </div>
      )}
      {diff.kind !== 'removed' && (
        // biome-ignore lint/a11y/useSemanticElements: This groups read-only diff text, not form controls for a fieldset.
        <div
          role="group"
          aria-label="Result value"
          className="flex items-start gap-2 text-[var(--diff-added-text)]"
        >
          <span aria-hidden="true" className="w-3 shrink-0 font-mono">
            +
          </span>
          <span className="sr-only">Result: </span>
          <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {diff.afterValue}
          </span>
        </div>
      )}
    </div>
  );
}

function StateValueCell({ row }: { row: StateStructureRow }) {
  if (row.status === 'missing') {
    return (
      <span className="inline-flex h-5 w-fit items-center rounded-[5px] bg-[var(--status-warning-muted)] px-1.5 font-sans text-xs font-semibold leading-4 text-[var(--status-warning)]">
        Missing
      </span>
    );
  }

  const value = row.diff?.kind === 'removed' ? row.diff.beforeValue : row.value;
  const title =
    row.diff?.exact && row.diff.kind === 'modified'
      ? `${row.diff.beforeValue} -> ${row.diff.afterValue}`
      : value;

  if (value === '-') {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex max-w-full truncate font-normal leading-5 text-[var(--text-primary)]',
        stateStructureValueTypographyClass(value),
        stateStructureValueToneClass(row.diff?.kind),
        !row.diff && value.toLowerCase() === 'empty' && 'text-[var(--text-tertiary)]'
      )}
      title={title}
    >
      {value}
    </span>
  );
}

function stateStructureValueTypographyClass(value: string): string {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === 'empty') {
    return 'font-sans text-xs italic tracking-normal';
  }
  if (!/\s/.test(value.trim())) {
    return 'font-mono text-[13px] tracking-normal';
  }
  if (/^-?\d+(?:\.\d+)?\s+items?$/i.test(value.trim())) {
    return 'font-mono text-[13px] tracking-normal tabular-nums';
  }
  return 'font-sans text-[13px] tracking-normal';
}

function StateDiffGutter({ diff }: { diff?: StateStructureDiffMeta }) {
  if (!diff || (diff.kind === 'modified' && !diff.exact)) return null;
  return (
    <span
      aria-hidden="true"
      className={cn('absolute inset-y-0 left-0 w-[3px]', stateStructureDiffGutterClass(diff.kind))}
    />
  );
}

function StateDiffBadge({ diff, sourceOp }: { diff: StateStructureDiffMeta; sourceOp: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-[5px] px-1.5 font-sans text-xs font-semibold leading-4 tracking-normal',
        stateStructureDiffBadgeClass(diff.kind)
      )}
      title={diff.summary}
    >
      <span aria-hidden="true" className="font-mono text-xs tracking-normal">
        {stateStructureDiffSymbol(diff.kind)}
      </span>
      <span>{stateStructureDiffOperationLabel(diff, sourceOp)}</span>
    </span>
  );
}

function StateDiffSummary({ diff }: { diff: StateStructureDiffMeta }) {
  return (
    <span
      className={cn(
        'inline-flex w-3 shrink-0 items-center justify-center font-mono text-xs font-semibold leading-4 tracking-normal',
        stateStructureDiffTextClass(diff.kind)
      )}
      title={diff.summary}
    >
      <span aria-hidden="true">{stateStructureDiffSymbol(diff.kind)}</span>
      <span className="sr-only">{stateStructureDiffOperationLabel(diff, '-')}</span>
    </span>
  );
}

function stateStructureRowToneClass(row: StateStructureRow): string {
  if (!row.diff) {
    return 'hover:bg-[var(--surface-hover)]';
  }

  if (row.diff?.kind === 'added') {
    return 'bg-[var(--diff-added-bg)] hover:bg-[var(--diff-added-bg)]';
  }
  if (row.diff?.kind === 'removed') {
    return 'bg-[var(--diff-removed-bg)] hover:bg-[var(--diff-removed-bg)]';
  }
  if (!row.diff.exact || row.expandable) {
    return 'hover:bg-[var(--surface-hover)]';
  }
  if (row.diff?.kind === 'modified') {
    return 'bg-[var(--diff-modified-bg)] hover:bg-[var(--diff-modified-bg)]';
  }
  return 'hover:bg-[var(--surface-hover)]';
}

function stateStructureValueToneClass(kind: StructuredDiffKind | undefined): string {
  if (kind === 'added') {
    return 'text-[var(--diff-added-text)]';
  }
  if (kind === 'removed') return 'text-[var(--diff-removed-text)]';
  if (kind === 'modified') return 'text-[var(--diff-modified-text)]';
  return 'text-[var(--text-primary)]';
}

function stateStructureDiffGutterClass(kind: StructuredDiffKind): string {
  if (kind === 'added') return 'bg-[var(--diff-added-accent)]';
  if (kind === 'removed') return 'bg-[var(--diff-removed-accent)]';
  return 'bg-[var(--diff-modified-accent)]';
}

function stateStructureDiffBadgeClass(kind: StructuredDiffKind): string {
  if (kind === 'added') {
    return 'bg-[var(--diff-added-word-bg)] text-[var(--diff-added-text)]';
  }
  if (kind === 'removed') {
    return 'bg-[var(--diff-removed-word-bg)] text-[var(--diff-removed-text)]';
  }
  return 'bg-[var(--diff-modified-word-bg)] text-[var(--diff-modified-text)]';
}

function stateStructureDiffTextClass(kind: StructuredDiffKind): string {
  if (kind === 'added') return 'text-[var(--diff-added-text)]';
  if (kind === 'removed') return 'text-[var(--diff-removed-text)]';
  return 'text-[var(--diff-modified-text)]';
}

function stateStructureDiffSymbol(kind: StructuredDiffKind): string {
  if (kind === 'added') return '+';
  if (kind === 'removed') return '\u2212';
  return '~';
}

function stateStructureDiffOperationLabel(diff: StateStructureDiffMeta, sourceOp: string): string {
  const operation = sourceOp === '-' ? diff.op : sourceOp;
  if (operation) return operation;
  if (diff.kind === 'added') return 'Added';
  if (diff.kind === 'removed') return 'Removed';
  return 'Modified';
}

function StateEffectCell({ changeReason, row }: { changeReason: string; row: StateStructureRow }) {
  if (row.diff) {
    const fullReason = row.diff.reason || row.diff.summary;
    const reason = row.diff.exact
      ? compactStateChangeReason(fullReason)
      : `${String(row.diff.count)} path${row.diff.count === 1 ? '' : 's'} changed`;
    return (
      <span className="flex min-w-0 items-center gap-[7px]">
        {row.diff.exact ? (
          <StateDiffBadge diff={row.diff} sourceOp={row.sourceOp} />
        ) : (
          <StateDiffSummary diff={row.diff} />
        )}
        <span
          className="block min-w-0 truncate font-sans text-xs font-normal leading-[18px] tracking-normal text-[var(--text-secondary)]"
          title={fullReason || reason}
        >
          {reason}
        </span>
      </span>
    );
  }

  if (row.status === 'missing' || row.status === 'unchanged') {
    return null;
  }

  const operationLabel = row.sourceOp === '-' ? row.statusLabel : row.sourceOp;
  const reason = row.statusLabel === operationLabel ? 'Operation applied' : row.statusLabel;

  return (
    <span className="flex min-w-0 items-center gap-[7px]">
      <span className="inline-flex h-5 shrink-0 items-center rounded-[5px] bg-[var(--surface-app)] px-1.5 font-sans text-xs font-semibold leading-4 tracking-normal text-[var(--text-secondary)]">
        {operationLabel}
      </span>
      <span
        className="block min-w-0 truncate font-sans text-xs font-normal leading-[18px] tracking-normal text-[var(--text-secondary)]"
        title={changeReason || reason}
      >
        {reason}
      </span>
    </span>
  );
}

function compactStateChangeReason(reason: string): string {
  const compact = reason.trim().replace(/^This commit\s+/i, '');
  if (!compact) return reason;
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function StateSelectedNodeInspector({
  branch,
  changeReason,
  headCommit,
  modifiedLabel,
  positionLabel,
  row,
  schemaName,
  validationIssues,
  validationReady,
  readOnly,
  nodeHistoryEnabled,
}: {
  branch: string;
  changeReason: string;
  headCommit: ApiCommit;
  modifiedLabel: string;
  positionLabel: string | null;
  row: StateStructureRow | null;
  schemaName: string;
  validationIssues: StateInspectorValidationIssue[];
  validationReady: boolean;
  readOnly: boolean;
  nodeHistoryEnabled: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const authorLabel = stateInspectorAuthorLabel(headCommit);
  const sourceLabel = stateInspectorSourceLabel(row, headCommit);
  const diffTone = stateInspectorDiffTone(row?.diff?.kind);
  const beforeValue = row ? stateInspectorBeforeValue(row) : '';
  const resultValue = row ? stateInspectorResultValue(row) : '';
  const whyText = row ? stateInspectorWhyText(row, changeReason) : '';
  const [editing, setEditing] = useState(false);
  const [draftResult, setDraftResult] = useState(resultValue);
  const [draftSource, setDraftSource] = useState(sourceLabel);
  const [draftWhy, setDraftWhy] = useState(whyText);

  useEffect(() => {
    setEditing(false);
    setDraftResult(resultValue);
    setDraftSource(sourceLabel);
    setDraftWhy(whyText);
  }, [resultValue, row?.id, sourceLabel, whyText]);

  return (
    <aside
      aria-label="State change provenance"
      className="min-h-0 min-w-0 overflow-hidden border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] min-[1180px]:border-l min-[1180px]:border-t-0"
    >
      {historyOpen && nodeHistoryEnabled && row && !row.virtualGroup ? (
        <StateNodeHistoryPanel
          key={`${headCommit.hash}:${row.path}`}
          commit={headCommit}
          path={row.path}
          name={row.key}
          onBack={() => setHistoryOpen(false)}
        />
      ) : editing && !readOnly ? (
        <StateChangeEditPanel
          baseRevisionLabel={shortHash(headCommit.hash)}
          beforeValue={beforeValue}
          draftResult={draftResult}
          draftSource={draftSource}
          draftWhy={draftWhy}
          onCancel={() => {
            setDraftResult(resultValue);
            setDraftSource(sourceLabel);
            setDraftWhy(whyText);
            setEditing(false);
          }}
          onDraftResultChange={setDraftResult}
          onDraftSourceChange={setDraftSource}
          onDraftWhyChange={setDraftWhy}
          onSave={() => setEditing(false)}
          pathLabel={row ? stateInspectorPathLabel(row) : ''}
          row={row}
        />
      ) : (
        <StateChangeReviewPanel
          readOnly={readOnly}
          onViewNodeHistory={nodeHistoryEnabled ? () => setHistoryOpen(true) : undefined}
          authorLabel={authorLabel}
          beforeValue={beforeValue}
          branch={branch}
          diffTone={diffTone}
          headCommit={headCommit}
          modifiedLabel={modifiedLabel}
          onEdit={() => row && setEditing(true)}
          positionLabel={positionLabel}
          resultValue={resultValue}
          row={row}
          schemaName={schemaName}
          sourceLabel={sourceLabel}
          validationIssues={validationIssues}
          validationReady={validationReady}
          whyText={whyText}
        />
      )}
    </aside>
  );
}

function StateChangeReviewPanel({
  authorLabel,
  beforeValue,
  branch,
  diffTone,
  headCommit,
  modifiedLabel,
  onEdit,
  positionLabel,
  resultValue,
  row,
  schemaName,
  sourceLabel,
  validationIssues,
  validationReady,
  whyText,
  readOnly,
  onViewNodeHistory,
}: {
  authorLabel: string;
  beforeValue: string;
  branch: string;
  diffTone: StateInspectorTone;
  headCommit: ApiCommit;
  modifiedLabel: string;
  onEdit: () => void;
  positionLabel: string | null;
  resultValue: string;
  row: StateStructureRow | null;
  schemaName: string;
  sourceLabel: string;
  validationIssues: StateInspectorValidationIssue[];
  validationReady: boolean;
  whyText: string;
  readOnly: boolean;
  onViewNodeHistory?: () => void;
}) {
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const checks =
    row && !readOnly
      ? stateInspectorChecks(row, headCommit, schemaName, validationIssues, validationReady)
      : [];
  const failedChecks = checks.filter((check) => !check.passed);
  const passedCheckCount = checks.length - failedChecks.length;
  const checkSummary = readOnly
    ? 'Verification results not loaded'
    : failedChecks.length > 0
      ? `${passedCheckCount} passed · ${failedChecks.length} ${
          failedChecks.length === 1 ? 'needs review' : 'need review'
        }`
      : 'Replay matched · Schema valid';
  const technicalDetailsId = row
    ? `state-technical-details-${stateInspectorDomToken(row.id)}`
    : undefined;
  const sourceHref = row ? stateInspectorSourceHref(row, headCommit, branch) : null;

  useEffect(() => {
    setTechnicalOpen(false);
  }, [row?.id]);

  return (
    <form
      aria-label="State change provenance form"
      className="flex h-full min-h-0 min-w-0 flex-col"
      onSubmit={(event) => event.preventDefault()}
    >
      <StateScrollArea
        className="min-h-0 flex-1 bg-[var(--surface-card)]"
        label="State change provenance"
      >
        {row ? (
          <div className="min-w-0">
            <header className="min-w-0 border-b border-[var(--stroke-divider)] px-4 pb-8 pt-4">
              <span className="sr-only">
                {stateInspectorPathLabel(row)} · {positionLabel ?? '1 of 1'} · {authorLabel} ·{' '}
                {shortHash(headCommit.hash)} · {modifiedLabel}
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-xs font-semibold uppercase leading-4 text-[var(--text-tertiary)]">
                  Selected change
                </span>
                <span
                  className={cn(
                    'text-xs font-semibold uppercase leading-4',
                    stateInspectorTextToneClass(diffTone)
                  )}
                >
                  {stateInspectorKindLabel(row)}
                </span>
              </div>
              <h2
                className="mt-3 truncate text-[18px] font-semibold leading-7 text-[var(--text-primary)]"
                title={row.path}
              >
                {row.key}
              </h2>
              <StateInspectorInlineChange
                beforeValue={beforeValue}
                resultValue={resultValue}
                tone={diffTone}
              />
            </header>

            <div className="relative px-4 pb-5 pt-9">
              <span
                aria-hidden="true"
                className="absolute bottom-8 left-8 top-10 w-px bg-[var(--stroke-divider)]"
              />
              <StateReviewTimelineItem icon={CircleHelp} title="Why">
                <p className="text-[13px] leading-5 text-[var(--text-primary)]">{whyText}</p>
              </StateReviewTimelineItem>

              <StateReviewTimelineItem icon={Link2} title="Source">
                {sourceHref ? (
                  <Link
                    className="block min-w-0 truncate font-mono text-[13px] font-semibold leading-5 text-[var(--accent-commit)] underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35"
                    href={sourceHref}
                    title={sourceLabel}
                  >
                    {sourceLabel}
                  </Link>
                ) : (
                  <span className="block min-w-0 truncate font-mono text-[13px] font-medium leading-5 text-[var(--text-tertiary)]">
                    {sourceLabel || 'No source material linked'}
                  </span>
                )}
                <p className="mt-3 font-mono text-xs leading-[18px] text-[var(--text-secondary)]">
                  {stateInspectorSourcePreview(row)}
                </p>
              </StateReviewTimelineItem>

              <StateReviewTimelineItem icon={ShieldCheck} title={readOnly ? 'Checks' : 'Verified'}>
                <div className="flex min-w-0 items-center gap-2 text-[13px] leading-5 text-[var(--text-primary)]">
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      readOnly
                        ? 'bg-[var(--text-tertiary)]'
                        : failedChecks.length > 0
                          ? 'bg-[var(--status-error)]'
                          : 'bg-[var(--status-success)]'
                    )}
                  />
                  <span className="truncate">{checkSummary}</span>
                </div>
                {failedChecks.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {failedChecks.map((check) => (
                      <div
                        className="border-l-2 border-[var(--status-error)] bg-[var(--status-error-muted)] py-1 pl-2.5"
                        key={check.id}
                      >
                        <p className="text-[13px] font-semibold leading-5 text-[var(--status-error)]">
                          {check.label}
                        </p>
                        <p className="mt-0.5 text-xs leading-[18px] text-[var(--text-secondary)]">
                          {check.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </StateReviewTimelineItem>
            </div>

            <div className="border-b border-[var(--stroke-divider)]">
              <div className="flex min-h-10 items-center justify-between px-4 text-[13px] leading-5">
                <span className="text-[var(--text-secondary)]">Technical details</span>
                <button
                  aria-controls={technicalDetailsId}
                  aria-expanded={technicalOpen}
                  className="rounded-[4px] px-1 font-medium text-[var(--accent-commit)] transition-colors hover:text-[var(--commit-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/35"
                  onClick={() => setTechnicalOpen((open) => !open)}
                  type="button"
                >
                  {technicalOpen ? 'Hide' : 'View'}
                </button>
              </div>
              {technicalOpen ? (
                <StateTechnicalDetails
                  readOnly={readOnly}
                  headCommit={headCommit}
                  id={technicalDetailsId}
                  row={row}
                  schemaName={schemaName}
                  sourceLabel={sourceLabel}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="p-4">
            <p className="rounded-[6px] border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-app)] px-3 py-4 text-[13px] leading-5 text-[var(--text-secondary)]">
              No state point selected.
            </p>
          </div>
        )}
      </StateScrollArea>
      {readOnly ? (
        <footer className="shrink-0 border-t border-[var(--stroke-divider)] px-4 py-3 text-xs text-[var(--text-tertiary)]">
          {onViewNodeHistory && (
            <button
              type="button"
              disabled={!row || row.virtualGroup}
              onClick={onViewNodeHistory}
              className="mb-2 inline-flex h-8 w-full items-center justify-center gap-2 rounded-[5px] bg-[var(--accent-commit)] px-3 text-[13px] font-medium text-[var(--on-accent)] hover:bg-[var(--commit-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            >
              <History aria-hidden="true" className="size-3.5" /> View node history
            </button>
          )}
          Historical snapshot · Read-only
        </footer>
      ) : (
        <footer className="grid shrink-0 grid-cols-[1fr_96px] gap-2 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-2">
          <button
            className="h-8 rounded-[5px] bg-[var(--accent-commit)] px-3 text-[13px] font-semibold leading-5 text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[var(--commit-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!row}
            onClick={onEdit}
            type="button"
          >
            Edit result
          </button>
          <button
            className="h-8 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 text-[13px] font-semibold leading-5 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
            type="button"
          >
            Comment
          </button>
        </footer>
      )}
    </form>
  );
}

function StateChangeEditPanel({
  baseRevisionLabel,
  beforeValue,
  draftResult,
  draftSource,
  draftWhy,
  onCancel,
  onDraftResultChange,
  onDraftSourceChange,
  onDraftWhyChange,
  onSave,
  pathLabel,
  row,
}: {
  baseRevisionLabel: string;
  beforeValue: string;
  draftResult: string;
  draftSource: string;
  draftWhy: string;
  onCancel: () => void;
  onDraftResultChange: (value: string) => void;
  onDraftSourceChange: (value: string) => void;
  onDraftWhyChange: (value: string) => void;
  onSave: () => void;
  pathLabel: string;
  row: StateStructureRow | null;
}) {
  return (
    <form
      aria-label="State change provenance form"
      className="flex h-full min-h-0 min-w-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <StateScrollArea className="min-h-0 flex-1 bg-[var(--surface-card)]" label="Edit result">
        <header className="flex min-h-[30px] items-center justify-between border-b border-[var(--stroke-divider)] px-3 py-2">
          <h2 className="text-sm font-semibold leading-5 text-[var(--text-primary)]">
            Edit result
          </h2>
          <button
            className="text-xs font-medium leading-4 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </header>
        {row ? (
          <div className="min-w-0 px-3 py-4">
            <p className="truncate font-mono text-xs leading-[18px] text-[var(--text-tertiary)]">
              {pathLabel}
            </p>
            <h3 className="mt-1 text-[16px] font-semibold leading-6 text-[var(--text-primary)]">
              Propose a new result
            </h3>
            <p className="mt-0.5 text-xs leading-[18px] text-[var(--text-tertiary)]">
              History is immutable. Saving adds a new attributed revision.
            </p>

            <div className="mt-4 grid gap-3">
              <StateEditField label="Before" meta="Recorded · locked">
                <output
                  aria-label="Before"
                  className="block min-h-9 rounded-[4px] bg-[var(--surface-app)] px-3 py-2 font-mono text-[13px] leading-5 text-[var(--text-primary)]"
                >
                  {beforeValue}
                </output>
              </StateEditField>

              <StateEditField label="Proposed result" meta="Required">
                <textarea
                  aria-label="Proposed result"
                  className="block min-h-[42px] w-full resize-none rounded-[5px] border border-[var(--accent-pending)] bg-[var(--surface-card)] px-3 py-2 font-mono text-[13px] leading-5 text-[var(--text-primary)] outline-none transition-[box-shadow,border-color] focus-visible:ring-2 focus-visible:ring-[var(--accent-pending)]/25"
                  onChange={(event) => onDraftResultChange(event.target.value)}
                  value={draftResult}
                />
              </StateEditField>

              <StateEditField label="Why is this result different?" meta="Required">
                <textarea
                  aria-label="Why is this result different?"
                  className="block min-h-[72px] w-full resize-none rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 py-2 text-[13px] leading-5 text-[var(--text-primary)] outline-none transition-[box-shadow,border-color] focus-visible:border-[var(--accent-pending)] focus-visible:ring-2 focus-visible:ring-[var(--accent-pending)]/20"
                  onChange={(event) => onDraftWhyChange(event.target.value)}
                  value={draftWhy}
                />
              </StateEditField>

              <StateEditField label="Source" meta="Linked">
                <input
                  aria-label="Source"
                  className="h-10 w-full rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 font-mono text-[13px] font-medium text-[var(--accent-commit)] outline-none transition-[box-shadow,border-color] focus-visible:border-[var(--accent-commit)] focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/20"
                  onChange={(event) => onDraftSourceChange(event.target.value)}
                  value={draftSource}
                />
              </StateEditField>

              <p className="flex min-h-8 items-center gap-2 rounded-[5px] border border-[var(--accent-pending)]/35 bg-[var(--accent-pending-soft)] px-3 text-xs font-medium leading-[18px] text-[var(--accent-pending)]">
                <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent-pending)]" />
                Schema checks run now; replay reruns after save.
              </p>

              <p className="text-xs leading-[18px] text-[var(--text-tertiary)]">
                Creates revision 2 from {baseRevisionLabel} · approval and merge remain at
                pull-request level.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <p className="rounded-[6px] border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-app)] px-3 py-4 text-[12px] leading-5 text-[var(--text-secondary)]">
              No state point selected.
            </p>
          </div>
        )}
      </StateScrollArea>
      <footer className="grid shrink-0 grid-cols-[1fr_72px] gap-2 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-2">
        <button
          className="h-8 rounded-[5px] bg-[var(--accent-pending)] px-3 text-[13px] font-semibold leading-5 text-[var(--on-accent)] shadow-[var(--fx-shadow-sm)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-pending)_88%,black)]"
          type="submit"
        >
          Save revision
        </button>
        <button
          className="h-8 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] px-3 text-[13px] font-semibold leading-5 text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </footer>
    </form>
  );
}

function StateInspectorBadge({ row }: { row: StateStructureRow }) {
  if (row.diff) {
    return (
      <span
        className={cn(
          'inline-flex h-6 max-w-full items-center gap-1.5 rounded-[5px] px-2 font-sans text-xs font-semibold leading-4',
          stateStructureDiffBadgeClass(row.diff.kind)
        )}
        title={row.diff.summary}
      >
        <span aria-hidden="true" className="font-[ui-monospace]">
          {stateStructureDiffSymbol(row.diff.kind)}
        </span>
        <span className="truncate">{stateInspectorCompactOperationLabel(row)}</span>
      </span>
    );
  }

  const warning = row.status === 'missing';
  return (
    <span
      className={cn(
        'inline-flex h-6 max-w-full items-center rounded-[5px] px-2 font-sans text-xs font-semibold leading-4',
        warning
          ? 'bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
          : 'bg-[var(--surface-app)] text-[var(--text-secondary)]'
      )}
      title={row.statusLabel}
    >
      <span className="truncate">{row.statusLabel}</span>
    </span>
  );
}

type StateInspectorTone =
  | 'added'
  | 'branch'
  | 'commit'
  | 'modified'
  | 'neutral'
  | 'removed'
  | 'source'
  | 'success'
  | 'warning';

interface StateInspectorValidationIssue {
  code?: string;
  label?: string;
  message?: string;
  path?: string | null;
}

interface StateInspectorCheck {
  detail: string;
  id: string;
  label: string;
  passed: boolean;
}

function StateInspectorInlineChange({
  beforeValue,
  resultValue,
  tone,
}: {
  beforeValue: string;
  resultValue: string;
  tone: StateInspectorTone;
}) {
  return (
    <div className="mt-3 min-w-0" data-testid="state-value-change">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 px-2">
        <span className="text-[10px] font-semibold uppercase leading-3 text-[var(--text-tertiary)]">
          Before
        </span>
        <span aria-hidden="true" className="w-4" />
        <span className="text-[10px] font-semibold uppercase leading-3 text-[var(--text-tertiary)]">
          Result
        </span>
      </div>
      <div
        className="mt-1 grid h-9 min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 overflow-hidden rounded-[8px] border border-[var(--stroke-default)] bg-[var(--panel)] px-2 py-1 shadow-[var(--fx-shadow-sm)]"
        data-testid="state-value-frame"
      >
        <StateInspectorInlineValueCard
          label="Before"
          value={beforeValue}
          valueClassName="text-[var(--diff-removed-text)]"
        />
        <span
          aria-hidden="true"
          className="flex h-7 items-center font-mono text-xs leading-5 text-[var(--text-tertiary)]"
        >
          -&gt;
        </span>
        <StateInspectorInlineValueCard
          label="Result"
          value={resultValue}
          valueClassName={stateInspectorResultTextToneClass(tone)}
        />
      </div>
    </div>
  );
}

function StateInspectorInlineValueCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName: string;
}) {
  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <button
          aria-label={`${label} full value: ${value}`}
          className="block h-7 w-full min-w-0 overflow-hidden rounded-[6px] px-1.5 text-left transition-[background-color,color] hover:bg-[var(--surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/10"
          data-testid={`state-${label.toLowerCase()}-value`}
          title={value}
          type="button"
        >
          <span
            className={cn(
              'block max-w-full truncate font-mono text-[13px] font-semibold leading-7',
              valueClassName
            )}
          >
            {value}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        align="start"
        className="!w-[380px] !max-w-[calc(100vw-32px)] !rounded-[10px] !border !border-[var(--stroke-default)] !bg-[var(--surface-elevated)] !p-0 !text-[var(--text-primary)] !shadow-[var(--fx-shadow-lg)] [&>svg]:!bg-[var(--surface-elevated)] [&>svg]:!fill-[var(--surface-elevated)]"
        side="bottom"
        sideOffset={8}
      >
        <div className="p-3">
          <span className="block font-sans text-[10px] font-semibold uppercase leading-3 text-[var(--text-tertiary)]">
            {label} full value
          </span>
          <pre
            className={cn(
              'mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-[18px]',
              valueClassName
            )}
          >
            {value}
          </pre>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function StateReviewTimelineItem({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-5">
      <div className="relative z-10 flex justify-center pt-0.5">
        <span className="flex size-8 items-center justify-center rounded-[5px] border border-[color-mix(in_srgb,var(--accent-commit)_18%,var(--stroke-divider))] bg-[color-mix(in_srgb,var(--accent-commit)_10%,var(--surface-card))] text-[var(--accent-commit)]">
          <Icon aria-hidden="true" className="size-[15px] shrink-0" strokeWidth={2.2} />
        </span>
      </div>
      <div className="min-w-0 border-b border-[var(--stroke-divider)] pb-7 pt-2.5">
        <h3 className="mb-2.5 text-xs font-semibold uppercase leading-4 text-[var(--text-secondary)]">
          {title}
        </h3>
        {children}
      </div>
    </section>
  );
}

function StateTechnicalDetails({
  headCommit,
  id,
  row,
  schemaName,
  sourceLabel,
  readOnly = false,
}: {
  headCommit: ApiCommit;
  id?: string;
  row: StateStructureRow;
  schemaName: string;
  sourceLabel: string;
  readOnly?: boolean;
}) {
  const details = [
    { label: 'State path', value: stateInspectorPathLabel(row) },
    { label: 'Type', value: row.type },
    { label: 'Effect', value: stateInspectorOperationPreview(row) },
    {
      label: 'Replay',
      value: readOnly ? 'Not loaded for this revision' : stateInspectorReplayLabel(headCommit),
    },
    { label: 'Schema', value: schemaName },
    { label: 'Commit', value: shortHash(headCommit.hash) },
    { label: 'Source', value: sourceLabel || 'No source material linked' },
  ];

  return (
    <div className="bg-[var(--surface-app)] px-3 pb-3 pt-1.5" id={id}>
      <dl className="grid gap-1.5">
        {details.map((detail) => (
          <div
            className="grid min-h-6 grid-cols-[74px_minmax(0,1fr)] items-start gap-2"
            key={detail.label}
          >
            <dt className="pt-1 text-xs font-medium leading-4 text-[var(--text-tertiary)]">
              {detail.label}
            </dt>
            <dd
              className="min-w-0 truncate rounded-[4px] bg-[var(--surface-card)] px-2 py-1 font-mono text-xs leading-[18px] text-[var(--text-secondary)]"
              title={detail.value}
            >
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StateEditField({
  children,
  label,
  meta,
}: {
  children: ReactNode;
  label: string;
  meta: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex min-h-4 items-center justify-between gap-2 text-xs font-medium leading-4 text-[var(--text-tertiary)]">
        <span>{label}</span>
        <span className="font-medium normal-case tracking-[0] text-[var(--text-quaternary)]">
          {meta}
        </span>
      </span>
      {children}
    </label>
  );
}

function stateInspectorCurrentValue(row: StateStructureRow): string {
  if (row.value && row.value !== '-') return row.value;
  return `${row.type} node`;
}

function stateInspectorBeforeValue(row: StateStructureRow): string {
  if (!row.diff?.exact) return stateInspectorCurrentValue(row);
  if (row.diff.kind === 'added') return 'No parent value';
  return row.diff.beforeValue || 'No parent value';
}

function stateInspectorResultValue(row: StateStructureRow): string {
  if (!row.diff?.exact) return stateInspectorCurrentValue(row);
  if (row.diff.kind === 'removed') return 'No value recorded';
  return row.diff.afterValue || stateInspectorCurrentValue(row);
}

function stateInspectorReplayLabel(headCommit: ApiCommit): string {
  const parentHash = headCommit.parents[0];
  return parentHash
    ? `Base ${shortHash(parentHash)} -> HEAD ${shortHash(headCommit.hash)}`
    : `Genesis -> HEAD ${shortHash(headCommit.hash)}`;
}

function stateInspectorWhyText(row: StateStructureRow, changeReason: string): string {
  if (row.diff?.exact) return row.diff.reason || row.diff.summary;
  if (row.diff) return row.diff.summary;
  if (row.status === 'missing') return row.statusLabel;
  if (row.status !== 'unchanged') return changeReason || row.statusLabel;
  return 'No direct change recorded for this node.';
}

function stateInspectorAuthorLabel(headCommit: ApiCommit): string {
  return (
    headCommit.author?.name?.trim() ||
    headCommit.author?.id?.trim() ||
    headCommit.author?.type?.trim() ||
    'Unrecorded author'
  );
}

function stateInspectorSourceLabel(row: StateStructureRow | null, headCommit: ApiCommit): string {
  const changeSource = row?.diff?.evidenceSource?.trim();
  if (changeSource) return changeSource;

  const sources = headCommit.sources ?? [];
  return sources
    .map((source) => source.title?.trim() || source.id || source.type)
    .filter(Boolean)
    .slice(0, 2)
    .join(', ');
}

function stateInspectorSourceHref(
  row: StateStructureRow,
  headCommit: ApiCommit,
  branch: string
): string | null {
  const sources = headCommit.sources ?? [];
  const evidenceSource = row.diff?.evidenceSource?.trim();
  const conversationSource =
    sources.find(
      (source) =>
        source.type === 'conversation' &&
        (source.id === evidenceSource || source.title?.trim() === evidenceSource)
    ) ?? sources.find((source) => source.type === 'conversation');

  if (!conversationSource?.id) return null;

  return repositoryConversationSourceHref({
    branch,
    commitId: headCommit.hash,
    conversationId: conversationSource.id,
    projectId: headCommit.project_id,
  });
}

function stateInspectorChecks(
  row: StateStructureRow,
  headCommit: ApiCommit,
  schemaName: string,
  validationIssues: StateInspectorValidationIssue[],
  validationReady: boolean
): StateInspectorCheck[] {
  const schemaIssue = stateInspectorValidationIssueForRow(row, validationIssues);
  const replayPassed = Boolean(headCommit.hash);
  const schemaPassed = validationReady || (!schemaIssue && row.status !== 'missing');

  return [
    {
      detail: replayPassed
        ? stateInspectorReplayLabel(headCommit)
        : 'No HEAD commit is available for deterministic replay.',
      id: 'replay',
      label: replayPassed ? 'Replay matched' : 'Replay unavailable',
      passed: replayPassed,
    },
    {
      detail: schemaPassed
        ? `${schemaName} accepts this state path.`
        : stateInspectorSchemaIssueDetail(row, schemaIssue),
      id: 'schema',
      label: schemaPassed ? 'Schema valid' : 'Schema needs review',
      passed: schemaPassed,
    },
  ];
}

function stateInspectorValidationIssueForRow(
  row: StateStructureRow,
  validationIssues: StateInspectorValidationIssue[]
): StateInspectorValidationIssue | null {
  const rowPath = normalizeStateInspectorPath(row.path);
  if (!rowPath) return null;
  return (
    validationIssues.find((issue) => {
      const issuePath = normalizeStateInspectorPath(issue.path);
      if (!issuePath) return false;
      return (
        issuePath === rowPath ||
        issuePath.endsWith(`/${rowPath}`) ||
        rowPath.endsWith(`/${issuePath}`)
      );
    }) ?? null
  );
}

function stateInspectorSchemaIssueDetail(
  row: StateStructureRow,
  issue: StateInspectorValidationIssue | null
): string {
  if (!issue) return row.statusLabel || 'Schema did not accept this state path.';
  const label = issue.label?.trim() || issue.code?.trim() || 'Schema issue';
  const message = issue.message?.trim() || issue.path?.trim() || row.statusLabel;
  return `${label}: ${message}`;
}

function normalizeStateInspectorPath(path: string | null | undefined): string {
  return (path ?? '')
    .split(/[./]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function stateInspectorDomToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'row';
}

function stateInspectorDiffTone(kind: StructuredDiffKind | undefined): StateInspectorTone {
  if (kind === 'added') return 'added';
  if (kind === 'removed') return 'removed';
  if (kind === 'modified') return 'modified';
  return 'neutral';
}

function stateInspectorKindLabel(row: StateStructureRow): string {
  if (row.diff?.kind === 'added') return 'Added';
  if (row.diff?.kind === 'removed') return 'Removed';
  if (row.diff?.kind === 'modified') return 'Modified';
  if (row.status === 'missing') return 'Missing';
  return row.statusLabel;
}

function stateInspectorOperationPreview(row: StateStructureRow): string {
  if (row.diff) {
    return `${stateStructureDiffOperationLabel(row.diff, row.sourceOp)}: ${row.path}`;
  }
  if (row.sourceOp && row.sourceOp !== '-') return `${row.sourceOp}: ${row.path}`;
  return `state: ${row.path}`;
}

function stateInspectorSourcePreview(row: StateStructureRow): string {
  if (!row.diff?.exact) return stateInspectorOperationPreview(row);
  if (row.diff.kind === 'removed') return `remove ${row.key}`;
  if (row.diff.kind === 'added') return `${row.key} = ${row.diff.afterValue}`;
  return `${row.key} = ${row.diff.afterValue || stateInspectorCurrentValue(row)}`;
}

function stateInspectorCompactOperationLabel(row: StateStructureRow): string {
  const operation = row.diff
    ? stateStructureDiffOperationLabel(row.diff, row.sourceOp)
    : row.sourceOp;
  return operation.replace(/^\d+\s+/, '') || stateInspectorKindLabel(row);
}

function stateInspectorPathLabel(row: StateStructureRow): string {
  return row.path.split('/').filter(Boolean).join(' / ') || row.key;
}

function stateInspectorTextToneClass(tone: StateInspectorTone): string {
  if (tone === 'added') return 'text-[var(--diff-added-text)]';
  if (tone === 'removed') return 'text-[var(--diff-removed-text)]';
  if (tone === 'modified') return 'text-[var(--diff-modified-text)]';
  if (tone === 'source') return 'text-[var(--source)]';
  if (tone === 'branch') return 'text-[var(--accent-branch)]';
  if (tone === 'success') return 'text-[var(--status-success)]';
  if (tone === 'warning') return 'text-[var(--status-warning)]';
  return 'text-[var(--text-secondary)]';
}

function stateInspectorResultTextToneClass(tone: StateInspectorTone): string {
  if (tone === 'removed') return 'text-[var(--text-tertiary)]';
  if (tone === 'neutral') return 'text-[var(--text-primary)]';
  return 'text-[var(--diff-added-text)]';
}

function StateEmpty({ message, title }: { message: string; title: string }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center p-8 text-center">
      <div>
        <h2 className="text-[16px] font-semibold leading-6 text-[var(--text-primary)]">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">{message}</p>
      </div>
    </div>
  );
}

export function StateContextRail({
  changedPathCount,
  headCommit,
  modifiedLabel,
  rootKey,
  schemaName,
  warning,
}: {
  changedPathCount: number;
  headCommit: ApiCommit | null;
  modifiedLabel: string;
  rootKey: string;
  schemaName: string;
  warning: string | null;
}) {
  const statusLabel =
    changedPathCount > 0
      ? `${String(changedPathCount)} change${changedPathCount === 1 ? '' : 's'}`
      : 'unchanged';
  const authorLabel =
    headCommit?.author?.name || headCommit?.author?.id || headCommit?.author?.type || '-';

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--surface-card)]">
      <h2 className="sr-only">State details</h2>
      <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 pb-2 pt-12">
        <div
          aria-label="State details views"
          className="grid h-7 grid-cols-3 gap-[3px] rounded-[4px] bg-[var(--surface-app)] p-[1.5px] text-xs font-medium"
          role="tablist"
        >
          <button
            aria-selected="true"
            className="rounded-[4px] border border-[var(--stroke-divider)] bg-[var(--surface-elevated)] text-[var(--text-primary)] outline-none transition-[background-color,border-color,box-shadow,color] focus-visible:border-[var(--accent-commit)] focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/10"
            role="tab"
            type="button"
          >
            Node
          </button>
          <button
            aria-selected="false"
            className="rounded-[4px] border border-transparent text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)] focus-visible:border-[var(--accent-commit)] focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/10"
            role="tab"
            type="button"
          >
            History
          </button>
          <button
            aria-selected="false"
            className="rounded-[4px] border border-transparent text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)] focus-visible:border-[var(--accent-commit)] focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/10"
            role="tab"
            title={`Schema: ${schemaName}`}
            type="button"
          >
            Schema
          </button>
        </div>
      </div>
      <StateScrollArea className="min-h-0 flex-1" label="Node details">
        <div className="px-3 py-3">
          <div className="mb-4 text-sm font-semibold text-[var(--text-primary)]">{rootKey}</div>
          <RailSection title="Details">
            <RailRow label="Path" value={rootKey} />
            <RailRow label="Type" value="object" />
            <RailRow label="Status" value={statusLabel} />
          </RailSection>
          <RailSection title="Meta">
            <RailRow label="Modified" value={modifiedLabel} />
            <RailRow label="Author" value={authorLabel} />
          </RailSection>
        </div>
      </StateScrollArea>
      {warning ? (
        <p className="border-t border-[var(--stroke-divider)] px-3 py-2 text-xs font-medium text-[var(--status-warning)]">
          {warning}
        </p>
      ) : null}
    </section>
  );
}

function RailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="border-t border-[var(--stroke-divider)] py-3">
      <h3 className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
        {title}
      </h3>
      <dl className="grid grid-cols-[82px_minmax(0,1fr)] gap-x-2 gap-y-2 text-xs leading-5">
        {children}
      </dl>
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

function buildStateStructureRows(
  rows: StatePointRow[],
  diffChanges: StructuredDiffChange[] = []
): StateStructureRow[] {
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

  const collapsedRows = collapseCollectionContainers(collapseDenseBooleanGroups(structuredRows));
  const rowsWithRemovedDiffs = insertRemovedDiffRows(collapsedRows, diffChanges);
  return annotateStateStructureRowsWithDiff(rowsWithRemovedDiffs, diffChanges);
}

function insertRemovedDiffRows(
  rows: StateStructureRow[],
  diffChanges: StructuredDiffChange[]
): StateStructureRow[] {
  const normalizedChanges = normalizeStructuredDiffChanges(diffChanges);
  const existingIds = new Set(rows.map((row) => row.id));
  const rowByPath = new Map(rows.map((row) => [row.path, row]));
  const removedRowsByParent = new Map<string | null, StateStructureRow[]>();

  normalizedChanges.forEach((change, index) => {
    if (change.kind !== 'removed' || rowByPath.has(change.path)) return;
    const parentPath = nearestExistingParentPath(change.path, rowByPath);
    const parentRow = parentPath ? rowByPath.get(parentPath) : undefined;
    const key = change.path.split('/').filter(Boolean).at(-1) ?? change.path;
    const removedRow: StateStructureRow = {
      depth: parentRow ? parentRow.depth + 1 : 0,
      expandable: false,
      id: `removed:${change.path}:${String(index)}`,
      issueCount: 0,
      key,
      parentPath,
      path: change.path,
      removedFromParent: true,
      sourceOp: change.op,
      status: 'changed',
      statusLabel: 'removed',
      type: 'removed',
      value: change.beforeValue,
      diff: stateStructureDiffMeta(change, true),
    };
    if (existingIds.has(removedRow.id)) return;
    existingIds.add(removedRow.id);
    const siblings = removedRowsByParent.get(parentPath) ?? [];
    siblings.push(removedRow);
    removedRowsByParent.set(parentPath, siblings);
  });

  if (removedRowsByParent.size === 0) return rows;

  const result: StateStructureRow[] = [];
  for (const row of rows) {
    result.push(row);
    const removedChildren = removedRowsByParent.get(row.path);
    if (removedChildren) result.push(...removedChildren);
  }

  const detachedRemovedRows = removedRowsByParent.get(null);
  if (detachedRemovedRows) result.push(...detachedRemovedRows);
  return result;
}

function annotateStateStructureRowsWithDiff(
  rows: StateStructureRow[],
  diffChanges: StructuredDiffChange[]
): StateStructureRow[] {
  const normalizedChanges = normalizeStructuredDiffChanges(diffChanges);
  if (normalizedChanges.length === 0) return rows;

  const exactChangeByPath = new Map<string, NormalizedStructuredDiffChange>();
  for (const change of normalizedChanges) {
    if (!exactChangeByPath.has(change.path)) exactChangeByPath.set(change.path, change);
  }

  return rows.map((row) => {
    const exactChange = row.diff
      ? null
      : (exactChangeByPath.get(row.path) ?? findArrayAppendDiffForRow(row, normalizedChanges));
    if (exactChange) return { ...row, diff: stateStructureDiffMeta(exactChange, true) };
    if (row.diff) return row;

    const childChanges = normalizedChanges.filter((change) =>
      change.path.startsWith(`${row.path}/`)
    );
    if (childChanges.length === 0) return row;
    return { ...row, diff: aggregateStateStructureDiffMeta(childChanges) };
  });
}

function normalizeStructuredDiffChanges(
  diffChanges: StructuredDiffChange[]
): NormalizedStructuredDiffChange[] {
  return diffChanges.map((change) => ({
    ...change,
    path: normalizeStateStructurePath(change.path),
  }));
}

function stateStructureDiffMeta(
  change: NormalizedStructuredDiffChange,
  exact: boolean
): StateStructureDiffMeta {
  return {
    afterValue: change.afterValue,
    beforeValue: change.beforeValue,
    count: 1,
    evidence: change.evidence,
    evidenceSource: change.evidenceSource,
    exact,
    kind: change.kind,
    op: change.op,
    reason: change.reason,
    summary: change.summary,
  };
}

function aggregateStateStructureDiffMeta(
  changes: NormalizedStructuredDiffChange[]
): StateStructureDiffMeta {
  const kind = aggregateStructuredDiffKind(changes);
  const evidenceSource = aggregateSingleValue(changes.map((change) => change.evidenceSource));
  return {
    afterValue: '',
    beforeValue: '',
    count: changes.length,
    evidence: aggregateSingleValue(changes.map((change) => change.evidence)),
    evidenceSource,
    exact: false,
    kind,
    op: '',
    reason: '',
    summary: `${String(changes.length)} changed path${changes.length === 1 ? '' : 's'}`,
  };
}

function aggregateStructuredDiffKind(
  changes: NormalizedStructuredDiffChange[]
): StructuredDiffKind {
  const kinds = new Set(changes.map((change) => change.kind));
  if (kinds.size === 1) return changes[0]?.kind ?? 'modified';
  return 'modified';
}

function findArrayAppendDiffForRow(
  row: StateStructureRow,
  changes: NormalizedStructuredDiffChange[]
): NormalizedStructuredDiffChange | undefined {
  return changes.find((change) => {
    if (change.kind !== 'added' || !change.path.endsWith('/-')) return false;
    const parentPath = change.path.slice(0, -2);
    return row.parentPath === parentPath && row.value === change.afterValue;
  });
}

function nearestExistingParentPath(
  path: string,
  rowByPath: Map<string, StateStructureRow>
): string | null {
  let parentPath = parentStatePath(path);
  while (parentPath) {
    if (rowByPath.has(parentPath)) return parentPath;
    parentPath = parentStatePath(parentPath);
  }
  return null;
}

function normalizeStateStructurePath(path: string): string {
  return path
    .trim()
    .replace(/^\/+/, '')
    .replace(/\.+/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
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
  overrides: Record<string, boolean>,
  expandChanged = false
): boolean {
  return overrides[row.id] ?? (expandChanged || !row.collapseByDefault);
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

function aggregateSingleValue(values: Array<string | undefined>): string | undefined {
  const unique = Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean)));
  return unique.length === 1 ? unique[0] : undefined;
}

export function inferSchemaName(commit: ApiCommit | null): string {
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

function resolveMainSchemaBindings(
  workspaces: WorkspaceCandidate[],
  mainHeadCommitHash: string | null
) {
  const mainWorkspace = selectWorkspaceForBranch(workspaces, 'main', mainHeadCommitHash);
  return mainWorkspace?.schemaBindings.map((binding) => ({ ...binding })) ?? [];
}

function formatRelativeTime(value: string | undefined): string {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${String(elapsedMinutes)}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${String(elapsedHours)}h ago`;
  return `${String(Math.floor(elapsedHours / 24))}d ago`;
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
