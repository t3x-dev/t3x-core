'use client';

import {
  ChevronDown,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  Network,
  Plus,
  RotateCw,
  Rows3,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { commitHashLabel } from '@/domain/format/formatters';
import {
  getYSchemaValidationCommitLabel,
  getYSchemaValidationPrimaryLabel,
  type YSchemaValidationSummary,
} from '@/domain/project/yschemaValidation';
import { useBranches } from '@/hooks/shared/useBranches';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import type { CanvasNodeData } from '@/types/nodes';
import { cn } from '@/utils/cn';

export type ProjectStateView = 'tree' | 'canvas' | 'diff' | 'history';
type BranchFocus = 'all' | string;

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

interface StateCommit {
  branch: string;
  hash: string;
  id: string;
  leafCount: number;
  summary: string;
  timestamp: string;
  title: string;
}

const STATE_VIEWS: {
  id: ProjectStateView;
  icon: typeof Rows3;
  label: string;
}[] = [
  { id: 'canvas', icon: Network, label: 'Canvas' },
  { id: 'tree', icon: Rows3, label: 'Tree' },
  { id: 'diff', icon: GitCompareArrows, label: 'Diff' },
  { id: 'history', icon: ScrollText, label: 'History' },
];

export function ProjectStateTab({
  children,
  initialView = 'canvas',
  onRunValidation,
  projectId,
  projectName,
  validation,
  validationError,
  validationRunning = false,
}: ProjectStateTabProps) {
  const gapDetailsId = useId();
  const [activeView, setActiveView] = useState<ProjectStateView>(initialView);
  const [branchFocus, setBranchFocus] = useState<BranchFocus>('all');
  const [validationDetailsOpen, setValidationDetailsOpen] = useState(false);
  const activeChatBranch = useChatStore((state) => state.activeBranch);
  const setActiveBranch = useChatStore((state) => state.setActiveBranch);
  const commitBranch = useCommitStore((state) => state.commitBranch);
  const setCommitBranch = useCommitStore((state) => state.setCommitBranch);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const { branches, create, loading, refresh } = useBranches(projectId, true);
  const stateCommits = useMemo(() => collectStateCommits(nodes), [nodes]);
  const fallbackBranch = activeChatBranch || commitBranch || 'main';
  const branchOptions = useMemo(
    () =>
      mergeBranchNames([
        'main',
        fallbackBranch,
        ...branches,
        ...stateCommits.map((commit) => commit.branch),
      ]),
    [branches, fallbackBranch, stateCommits]
  );
  const repoHeadCommit = stateCommits[0] ?? null;
  const focusedCommits = useMemo(
    () =>
      branchFocus === 'all'
        ? stateCommits
        : stateCommits.filter((commit) => commit.branch === branchFocus),
    [branchFocus, stateCommits]
  );
  const focusedHeadCommit = focusedCommits[0] ?? null;
  const leafCount = stateCommits.reduce((count, commit) => count + commit.leafCount, 0);
  const focusLabel = branchFocus === 'all' ? 'All repo' : branchFocus;

  const handleBranchFocusChange = (focus: BranchFocus) => {
    setBranchFocus(focus);
    if (focus !== 'all') {
      setActiveBranch(focus);
      setCommitBranch(focus);
    }
  };

  return (
    <section
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-app)]"
      data-state-view={activeView}
    >
      <StateValidationBar
        detailsId={gapDetailsId}
        detailsOpen={validationDetailsOpen}
        onDetailsOpenChange={setValidationDetailsOpen}
        onRunValidation={onRunValidation}
        validation={validation}
        validationError={validationError}
        validationRunning={validationRunning}
      />
      <StateRepoBar
        branchCount={branchOptions.length}
        commitCount={stateCommits.length}
        edgeCount={edges.length}
        headCommit={repoHeadCommit}
        leafCount={leafCount}
        onCompare={() => setActiveView('diff')}
      />
      <StateViewTabs activeView={activeView} onViewChange={setActiveView} />
      <BranchFocusBar
        branchFocus={branchFocus}
        branchOptions={branchOptions}
        creatingFromBranch={branchFocus === 'all' ? fallbackBranch : branchFocus}
        loading={loading}
        onBranchFocusChange={handleBranchFocusChange}
        onCreateBranch={create}
        onRefresh={refresh}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeView === 'canvas' ? (
          <div className="flex h-full min-h-0 flex-col" role="tabpanel">
            {children}
          </div>
        ) : null}
        {activeView === 'tree' ? (
          <StateTreeView
            branchCount={branchOptions.length}
            edgeCount={edges.length}
            focus={branchFocus}
            focusLabel={focusLabel}
            focusedCommitCount={focusedCommits.length}
            focusedHeadCommit={focusedHeadCommit}
            leafCount={leafCount}
            projectName={projectName}
            repoCommitCount={stateCommits.length}
            repoHeadCommit={repoHeadCommit}
          />
        ) : null}
        {activeView === 'diff' ? (
          <StateDiffView
            focusLabel={focusLabel}
            focusedCommitCount={focusedCommits.length}
            focusedHeadCommit={focusedHeadCommit}
            repoHeadCommit={repoHeadCommit}
          />
        ) : null}
        {activeView === 'history' ? (
          <StateHistoryView commits={focusedCommits} focusLabel={focusLabel} />
        ) : null}
      </div>
    </section>
  );
}

function StateValidationBar({
  detailsId,
  detailsOpen,
  onDetailsOpenChange,
  onRunValidation,
  validation,
  validationError,
  validationRunning,
}: {
  detailsId: string;
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  onRunValidation?: () => Promise<void> | void;
  validation?: YSchemaValidationSummary | null;
  validationError?: string | null;
  validationRunning: boolean;
}) {
  const validationBadge = getYSchemaBadge(validation);
  const validationGaps = validation?.gaps ?? [];
  const validationGapCount = validation?.gapCount ?? validationGaps.length;
  const hasValidationGaps = validationGapCount > 0;
  const validationHasRun = Boolean(validation?.runId);
  const validationReady = validation?.status === 'verified';
  const schemaName = validation?.schemaName ?? 't3x/prd';
  const validationGapLabel = `${validationGapCount} validation ${
    validationGapCount === 1 ? 'gap' : 'gaps'
  }`;
  const validationUseLabel = validationReady
    ? 'Ready to use'
    : validationHasRun
      ? 'Use blocked until YSchema passes'
      : 'Run YSchema validation before use';

  return (
    <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--hover-bg)] text-[var(--text-secondary)]">
            <ShieldCheck aria-hidden="true" className="size-4" />
          </span>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">State status</h2>
          <Badge variant={validationBadge.variant}>{validationBadge.label}</Badge>
          <Badge variant="outline">{getYSchemaValidationCommitLabel(validation)}</Badge>
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {validationUseLabel}
          </span>
          <span className="text-xs font-semibold text-[var(--text-tertiary)]">
            Schema {schemaName}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {hasValidationGaps ? (
            <Button
              aria-controls={detailsId}
              aria-expanded={detailsOpen}
              onClick={() => onDetailsOpenChange(!detailsOpen)}
              size="sm"
              type="button"
              variant="canvas-outline"
            >
              <ChevronDown
                aria-hidden="true"
                className={
                  detailsOpen
                    ? 'size-4 rotate-180 transition-transform'
                    : 'size-4 transition-transform'
                }
              />
              {validationGapLabel}
            </Button>
          ) : null}
          <Button
            disabled={!onRunValidation || validationRunning}
            onClick={onRunValidation}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <RotateCw className={validationRunning ? 'size-4 animate-spin' : 'size-4'} />
            {validationRunning ? 'Running...' : 'Run validation'}
          </Button>
        </div>
      </div>

      {detailsOpen && validationGaps.length > 0 ? (
        <div className="mt-2 grid gap-2 md:grid-cols-2" id={detailsId}>
          {validationGaps.slice(0, 2).map((gap) => (
            <div
              className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2"
              key={`${gap.code}:${gap.path}:${gap.message}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-[var(--text-primary)]">{gap.label}</span>
                {gap.path ? <Badge variant="outline">{gap.path}</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{gap.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      {detailsOpen && hasValidationGaps && validationGaps.length === 0 ? (
        <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]" id={detailsId}>
          Validation gap details are not available for this run.
        </p>
      ) : null}

      {validationError ? (
        <p className="mt-2 text-xs font-semibold text-[var(--status-warning)]">{validationError}</p>
      ) : null}
    </div>
  );
}

function StateRepoBar({
  branchCount,
  commitCount,
  edgeCount,
  headCommit,
  leafCount,
  onCompare,
}: {
  branchCount: number;
  commitCount: number;
  edgeCount: number;
  headCommit: StateCommit | null;
  leafCount: number;
  onCompare: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <Network aria-hidden="true" className="h-4 w-4 text-[var(--accent-commit)]" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                Repo canvas
              </h2>
              <p className="text-xs text-[var(--text-tertiary)]">Whole repo state graph</p>
            </div>
          </div>
          <Badge className="font-mono" variant="commit">
            HEAD {headCommit?.hash ? commitHashLabel(headCommit.hash) : 'empty'}
          </Badge>
          <Badge variant="outline">
            {commitCount} commit{commitCount === 1 ? '' : 's'}
          </Badge>
          <Badge variant="branch">
            {branchCount} branch{branchCount === 1 ? '' : 'es'}
          </Badge>
          <Badge variant="outline">
            {edgeCount} relation{edgeCount === 1 ? '' : 's'}
          </Badge>
          <Badge variant="leaf">
            {leafCount} leaf{leafCount === 1 ? '' : 's'}
          </Badge>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent-commit)] px-3 text-sm font-semibold text-[var(--on-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-commit)_88%,black)]"
            onClick={onCompare}
            type="button"
          >
            <GitCompareArrows aria-hidden="true" className="h-4 w-4" />
            Compare
          </button>
        </div>
      </div>
    </header>
  );
}

function BranchFocusBar({
  branchFocus,
  branchOptions,
  creatingFromBranch,
  loading,
  onBranchFocusChange,
  onCreateBranch,
  onRefresh,
}: {
  branchFocus: BranchFocus;
  branchOptions: string[];
  creatingFromBranch: string;
  loading: boolean;
  onBranchFocusChange: (focus: BranchFocus) => void;
  onCreateBranch: (name: string, parentBranch: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const createBranch = async () => {
    const branch = normalizeBranchName(newBranchName);
    if (!branch) return;
    await onCreateBranch(branch, creatingFromBranch);
    onBranchFocusChange(branch);
    setCreating(false);
    setNewBranchName('');
  };

  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2">
      <label className="inline-flex h-8 min-w-0 items-center gap-2 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 text-sm font-semibold text-[var(--text-primary)]">
        <GitBranch aria-hidden="true" className="h-4 w-4 text-[var(--accent-branch)]" />
        <span className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
          Branch focus
        </span>
        <select
          aria-label="Branch focus"
          className="min-w-28 bg-transparent font-mono text-sm font-semibold text-[var(--text-primary)] outline-none"
          onChange={(event) => onBranchFocusChange(event.target.value)}
          value={branchFocus}
        >
          <option value="all">All repo</option>
          {branchOptions.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
        </select>
      </label>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {creating ? (
          <form
            className="flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2"
            onSubmit={(event) => {
              event.preventDefault();
              void createBranch();
            }}
          >
            <input
              aria-label="New branch name"
              className="h-6 w-40 min-w-0 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              onChange={(event) => setNewBranchName(event.target.value)}
              placeholder="feature/branch"
              value={newBranchName}
            />
            <button
              className="inline-flex h-6 items-center rounded-md bg-[var(--accent-branch)] px-2 text-xs font-semibold text-[var(--on-accent)]"
              type="submit"
            >
              Create
            </button>
          </form>
        ) : (
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)]"
            onClick={() => setCreating(true)}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4 text-[var(--accent-branch)]" />
            New branch
          </button>
        )}
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] disabled:cursor-wait disabled:opacity-60"
          disabled={loading}
          onClick={() => void onRefresh()}
          type="button"
        >
          {loading ? 'Refreshing' : 'Refresh'}
        </button>
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
      className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4"
      role="tablist"
    >
      {STATE_VIEWS.map((view) => {
        const Icon = view.icon;
        const selected = activeView === view.id;

        return (
          <button
            aria-selected={selected}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors',
              selected
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
            key={view.id}
            onClick={() => onViewChange(view.id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {view.label}
          </button>
        );
      })}
    </div>
  );
}

function StateTreeView({
  branchCount,
  edgeCount,
  focus,
  focusLabel,
  focusedCommitCount,
  focusedHeadCommit,
  leafCount,
  projectName,
  repoCommitCount,
  repoHeadCommit,
}: {
  branchCount: number;
  edgeCount: number;
  focus: BranchFocus;
  focusLabel: string;
  focusedCommitCount: number;
  focusedHeadCommit: StateCommit | null;
  leafCount: number;
  projectName: string;
  repoCommitCount: number;
  repoHeadCommit: StateCommit | null;
}) {
  const yamlLines = [
    'repo:',
    `  name: ${projectName}`,
    `  view: ${focus === 'all' ? 'all' : 'branch'}`,
    `  focus: ${focusLabel}`,
    `  head: ${repoHeadCommit?.hash ?? 'empty'}`,
    'state:',
    `  branches: ${branchCount}`,
    `  commits: ${repoCommitCount}`,
    `  relations: ${edgeCount}`,
    `  leaves: ${leafCount}`,
    'focus:',
    `  commits: ${focusedCommitCount}`,
    `  head: ${focusedHeadCommit?.hash ?? 'empty'}`,
    `  latest_title: ${focusedHeadCommit?.title ?? 'No committed state'}`,
    `  latest_summary: ${focusedHeadCommit?.summary ?? 'Create a workspace and commit YOps to populate state.'}`,
  ];

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section
        aria-label="State tree"
        className="min-h-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--editor-bg)]"
      >
        <div className="flex h-10 items-center justify-between border-b border-[var(--stroke-divider)] px-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">State tree</h2>
          <Badge variant={focus === 'all' ? 'commit' : 'branch'}>{focusLabel}</Badge>
        </div>
        <pre className="overflow-auto p-4 font-mono text-sm leading-relaxed text-[var(--text-primary)]">
          {yamlLines.join('\n')}
        </pre>
      </section>
      <StateInspector
        focusLabel={focusLabel}
        focusedCommitCount={focusedCommitCount}
        headCommit={focusedHeadCommit ?? repoHeadCommit}
        repoCommitCount={repoCommitCount}
      />
    </div>
  );
}

function StateInspector({
  focusLabel,
  focusedCommitCount,
  headCommit,
  repoCommitCount,
}: {
  focusLabel: string;
  focusedCommitCount: number;
  headCommit: StateCommit | null;
  repoCommitCount: number;
}) {
  return (
    <aside
      aria-label="State inspector"
      className="min-h-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <div className="flex items-center gap-2">
        <GitCommitHorizontal aria-hidden="true" className="h-4 w-4 text-[var(--accent-commit)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Inspector</h2>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <InspectorRow label="Focus" value={focusLabel} mono />
        <InspectorRow
          label="HEAD"
          value={headCommit?.hash ? commitHashLabel(headCommit.hash) : 'empty'}
          mono
        />
        <InspectorRow label="Latest commit" value={headCommit?.title ?? 'No committed state'} />
        <InspectorRow label="Focused commits" value={`${focusedCommitCount}`} />
        <InspectorRow label="Repo commits" value={`${repoCommitCount}`} />
        <InspectorRow label="Source relation" value="Workspace commit provenance" />
        <InspectorRow label="Leaf outputs" value={`${headCommit?.leafCount ?? 0}`} />
      </dl>
    </aside>
  );
}

function StateDiffView({
  focusLabel,
  focusedCommitCount,
  focusedHeadCommit,
  repoHeadCommit,
}: {
  focusLabel: string;
  focusedCommitCount: number;
  focusedHeadCommit: StateCommit | null;
  repoHeadCommit: StateCommit | null;
}) {
  return (
    <div className="h-full overflow-auto p-4">
      <section
        aria-label="State diff"
        className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
      >
        <div className="flex h-10 items-center justify-between border-b border-[var(--stroke-divider)] px-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Diff</h2>
          <Badge variant="outline">compare branch focus</Badge>
        </div>
        <div className="grid gap-3 p-4 text-sm">
          <DiffRow label="scope" tone="modified" value={focusLabel} />
          <DiffRow label="focus_head" tone="added" value={focusedHeadCommit?.hash ?? 'empty'} />
          <DiffRow label="repo_head" tone="identical" value={repoHeadCommit?.hash ?? 'empty'} />
          <DiffRow label="focus_commits" tone="identical" value={`${focusedCommitCount}`} />
        </div>
      </section>
    </div>
  );
}

function StateHistoryView({ commits, focusLabel }: { commits: StateCommit[]; focusLabel: string }) {
  return (
    <div className="h-full overflow-auto p-4">
      <section
        aria-label="Commit history"
        className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
      >
        <div className="flex h-10 items-center justify-between border-b border-[var(--stroke-divider)] px-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">History</h2>
          <Badge variant={focusLabel === 'All repo' ? 'commit' : 'branch'}>{focusLabel}</Badge>
        </div>
        <div className="divide-y divide-[var(--stroke-divider)]">
          {commits.map((commit) => (
            <article className="grid gap-1 px-4 py-3" key={commit.id}>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-[var(--accent-commit)]">
                  {commitHashLabel(commit.hash)}
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {commit.title}
                </span>
                <Badge variant={commit.branch === 'main' ? 'commit' : 'branch'}>
                  {commit.branch}
                </Badge>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{commit.summary}</p>
            </article>
          ))}
          {commits.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
              No commits on this branch yet.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function InspectorRow({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">{label}</dt>
      <dd className={cn('mt-1 text-[var(--text-primary)]', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}

function DiffRow({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'added' | 'identical' | 'modified';
  value: string;
}) {
  const toneClass =
    tone === 'added'
      ? 'border-[var(--diff-added-border)] bg-[var(--diff-added-bg)] text-[var(--diff-added-text)]'
      : tone === 'modified'
        ? 'border-[var(--diff-modified-border)] bg-[var(--diff-modified-bg)] text-[var(--diff-modified-text)]'
        : 'border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--text-secondary)]';

  return (
    <div
      className={cn('grid grid-cols-[140px_minmax(0,1fr)] rounded-md border px-3 py-2', toneClass)}
    >
      <span className="font-mono text-xs font-semibold">{label}</span>
      <span className="min-w-0 truncate font-mono text-xs">{value}</span>
    </div>
  );
}

function collectStateCommits(nodes: Array<{ id: string; data: CanvasNodeData }>): StateCommit[] {
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

function normalizeBranchName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-/.]/g, '');
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getYSchemaBadge(validation: YSchemaValidationSummary | null | undefined) {
  if (!validation) {
    return { label: 'YSchema pending', variant: 'pending' as const };
  }
  if (validation.status === 'verified') {
    return { label: getYSchemaValidationPrimaryLabel(validation), variant: 'success' as const };
  }
  if (validation.status === 'failed' || validation.status === 'stale') {
    return { label: getYSchemaValidationPrimaryLabel(validation), variant: 'warning' as const };
  }
  return { label: getYSchemaValidationPrimaryLabel(validation), variant: 'pending' as const };
}
