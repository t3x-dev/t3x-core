import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileWarning,
  GitCompareArrows,
  Rows3,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type {
  WorkspaceCandidate,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type { WorkspaceYOpsTreeNode, WorkspaceYOpsValue } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';

type ChangeReviewView = 'overview' | 'diff';

interface ChangeReviewFlowState {
  candidateId?: string;
  yopsDraftId?: string;
  commitHash?: string;
  error?: string;
  appliedCount?: number;
  baselineTrees?: WorkspaceYOpsTreeNode[] | null;
  previewReady?: boolean;
  previewTrees?: WorkspaceYOpsTreeNode[] | null;
  validationPassed?: boolean;
}

interface ChangeReviewDockProps {
  candidate: WorkspaceCandidate;
  flowState?: ChangeReviewFlowState;
}

const CHANGE_REVIEW_TABS: {
  icon: typeof Rows3;
  id: ChangeReviewView;
  label: string;
}[] = [
  { id: 'overview', icon: Rows3, label: 'Overview' },
  { id: 'diff', icon: GitCompareArrows, label: 'Diff' },
];

interface ChangeReviewSummary {
  readinessLabel: string;
  readinessVariant: 'success' | 'warning' | 'commit';
  touchedPathCount: number;
  yopsCount: number;
}

interface YamlChangeNode {
  changeCount: number;
  children: YamlChangeNode[];
  key: string;
  ops: WorkspaceYOpsDraftOperation[];
  path: string;
}

export function ChangeReviewDock({ candidate, flowState }: ChangeReviewDockProps) {
  const [activeView, setActiveView] = useState<ChangeReviewView>('overview');
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(
    candidate.yopsDraft.operations[0]?.id ?? null
  );
  const summary = useMemo(
    () => getChangeReviewSummary(candidate, flowState),
    [candidate, flowState]
  );
  const selectedOperation =
    candidate.yopsDraft.operations.find((operation) => operation.id === selectedOperationId) ??
    candidate.yopsDraft.operations[0] ??
    null;

  const handleReviewDiff = (operation: WorkspaceYOpsDraftOperation) => {
    setSelectedOperationId(operation.id);
    setActiveView('diff');
  };

  return (
    <section
      aria-label="Change Review Dock"
      className="overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Change Track Dock</h3>
            <Badge variant="commit-subtle">{summary.touchedPathCount} changes</Badge>
            <Badge variant={flowState?.validationPassed ? 'success' : 'pending-subtle'}>
              {flowState?.validationPassed ? 'YOps valid' : 'Not validated'}
            </Badge>
            <Badge variant={summary.readinessVariant}>{summary.readinessLabel}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">{candidate.title}</p>
        </div>
        <div
          aria-label="Change track views"
          className="inline-flex max-w-full gap-1 overflow-x-auto rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-1"
          role="tablist"
        >
          {CHANGE_REVIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeView === tab.id;

            return (
              <button
                aria-controls={`change-track-${tab.id}`}
                aria-selected={selected}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-semibold transition-colors',
                  selected
                    ? 'bg-[var(--accent-branch)]/10 text-[var(--accent-branch)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                )}
                id={`change-track-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                role="tab"
                type="button"
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ChangeReviewPanel
        activeView={activeView}
        candidate={candidate}
        flowState={flowState}
        onReviewDiff={handleReviewDiff}
        selectedOperation={selectedOperation}
        summary={summary}
      />
    </section>
  );
}

function ChangeReviewPanel({
  activeView,
  candidate,
  flowState,
  onReviewDiff,
  selectedOperation,
  summary,
}: {
  activeView: ChangeReviewView;
  candidate: WorkspaceCandidate;
  flowState?: ChangeReviewFlowState;
  onReviewDiff: (operation: WorkspaceYOpsDraftOperation) => void;
  selectedOperation: WorkspaceYOpsDraftOperation | null;
  summary: ChangeReviewSummary;
}) {
  if (activeView === 'diff') {
    return (
      <ChangeDiffPanel
        candidate={candidate}
        flowState={flowState}
        onSelectOperation={onReviewDiff}
        operation={selectedOperation}
      />
    );
  }

  return (
    <ChangeOverviewPanel
      candidate={candidate}
      flowState={flowState}
      onReviewDiff={onReviewDiff}
      summary={summary}
    />
  );
}

function ChangeOverviewPanel({
  candidate,
  flowState,
  onReviewDiff,
  summary,
}: {
  candidate: WorkspaceCandidate;
  flowState?: ChangeReviewFlowState;
  onReviewDiff: (operation: WorkspaceYOpsDraftOperation) => void;
  summary: ChangeReviewSummary;
}) {
  const yamlTree = useMemo(() => buildYamlChangeTree(candidate), [candidate]);
  const currentState = getCurrentStateLabel(candidate, flowState);
  const baselineState = getBaselineStateLabel(candidate);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(getDefaultExpandedYamlPaths(yamlTree))
  );
  const timelineSteps = [
    {
      label: 'Base state',
      value: candidate.baseCommitHash ?? 'No base commit',
      tone: 'muted' as const,
    },
    ...candidate.yopsDraft.operations.map((operation, index) => ({
      label: `${String(index + 1).padStart(2, '0')} ${operation.op.toUpperCase()}`,
      value: operation.path,
      tone: 'change' as const,
    })),
    {
      label: 'Current state',
      value: currentState,
      tone: 'ready' as const,
    },
  ];

  const toggleExpanded = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div
      aria-labelledby="change-track-tab-overview"
      className="grid gap-3 p-4"
      id="change-track-overview"
      role="tabpanel"
    >
      <section aria-label="Review status" className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <ReviewStatusCard
          detail={candidate.baseCommitHash ?? 'No persisted commit'}
          label="Baseline"
          status={baselineState}
          tone="neutral"
        />
        <ReviewStatusCard
          detail={flowState?.yopsDraftId ?? candidate.yopsDraft.id}
          label="YOps proposal"
          status={`${summary.yopsCount} operations`}
          tone="change"
        />
        <ReviewStatusCard
          detail={
            flowState?.validationPassed
              ? `${summary.yopsCount}/${summary.yopsCount} operations executable`
              : 'Run validation to compute the dry-run preview'
          }
          label="YOps validation"
          status={flowState?.validationPassed ? 'Passed' : 'Not run'}
          tone={flowState?.validationPassed ? 'success' : 'neutral'}
        />
        <ReviewStatusCard
          detail={
            flowState?.previewReady
              ? `${flowState.appliedCount ?? summary.yopsCount} operations materialized`
              : 'Apply validated YOps to materialize the preview'
          }
          label="Preview"
          status={flowState?.previewReady ? 'Materialized' : 'Pending'}
          tone={flowState?.previewReady ? 'success' : 'neutral'}
        />
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(28rem,1.3fr)_minmax(19rem,0.7fr)]">
        <section
          aria-label="YAML overview map"
          className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">Changed paths</h4>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                Only YAML paths changed by the proposal are shown here.
              </p>
            </div>
            <Badge variant="branch">{summary.touchedPathCount} touched</Badge>
          </div>
          {yamlTree.length > 0 ? (
            <div
              aria-label="YAML change map"
              className="mt-2 min-h-64 overflow-x-auto rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-2"
              role="tree"
            >
              <div className="min-w-96">
                {yamlTree.map((node) => (
                  <YamlTreeNode
                    expandedPaths={expandedPaths}
                    key={node.path}
                    node={node}
                    onReviewDiff={onReviewDiff}
                    onToggle={toggleExpanded}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyPanel message="No YAML changes to map yet." />
          )}
        </section>

        <aside aria-label="Review gate" className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">Pre-commit status</h4>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                Validation is resolved before this final change review.
              </p>
            </div>
            <Badge variant={summary.readinessVariant}>{summary.readinessLabel}</Badge>
          </div>
          <div className="mt-3 grid gap-2">
            <GateRow
              detail={
                flowState?.validationPassed
                  ? `${summary.yopsCount} operations passed deterministic dry-run`
                  : 'Return to Validation before reviewing this change'
              }
              label="YOps validation"
              passed={Boolean(flowState?.validationPassed)}
            />
            <GateRow
              detail={
                flowState?.previewReady
                  ? 'The validated result is materialized and ready for commit review'
                  : 'Apply validated YOps before committing'
              }
              label="Materialized preview"
              passed={Boolean(flowState?.previewReady)}
            />
          </div>
        </aside>
      </div>

      <section
        aria-label="State change timeline"
        className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
      >
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          Replay sequence <span className="text-[var(--text-tertiary)]">(operation order)</span>
        </h4>
        <ol className="mt-3 flex items-start gap-2 overflow-x-auto pb-1">
          {timelineSteps.map((step, index) => (
            <li className="flex shrink-0 items-start gap-2" key={`${step.label}:${step.value}`}>
              <div className="w-40 min-w-0">
                <div
                  className={cn(
                    'inline-flex h-7 items-center rounded-full border px-2 text-xs font-semibold',
                    step.tone === 'ready'
                      ? 'border-[var(--status-success)]/30 bg-[var(--status-success-muted)] text-[var(--status-success)]'
                      : step.tone === 'change'
                        ? 'border-[var(--accent-branch)]/30 bg-[var(--accent-branch)]/10 text-[var(--accent-branch)]'
                        : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-secondary)]'
                  )}
                >
                  {step.label}
                </div>
                <div
                  className="mt-1 truncate font-mono text-[11px] text-[var(--text-secondary)]"
                  title={step.value}
                >
                  {step.value}
                </div>
              </div>
              {index < timelineSteps.length - 1 ? (
                <span
                  className="mt-3 w-6 shrink-0 text-center text-[var(--accent-branch)]"
                  aria-hidden="true"
                >
                  -&gt;
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function ReviewStatusCard({
  detail,
  label,
  status,
  tone,
}: {
  detail: string;
  label: string;
  status: string;
  tone: 'change' | 'neutral' | 'success' | 'warning';
}) {
  return (
    <article className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--text-tertiary)]">{label}</span>
        <span
          className={cn(
            'size-2 rounded-full',
            tone === 'success'
              ? 'bg-[var(--status-success)]'
              : tone === 'warning'
                ? 'bg-[var(--status-warning)]'
                : tone === 'change'
                  ? 'bg-[var(--accent-branch)]'
                  : 'bg-[var(--text-tertiary)]'
          )}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{status}</div>
      <p className="mt-1 truncate text-xs text-[var(--text-secondary)]" title={detail}>
        {detail}
      </p>
    </article>
  );
}

function GateRow({ detail, label, passed }: { detail: string; label: string; passed: boolean }) {
  const Icon = passed ? CheckCircle2 : FileWarning;
  return (
    <div className="flex items-start gap-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-2.5">
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-4 shrink-0',
          passed ? 'text-[var(--status-success)]' : 'text-[var(--status-warning)]'
        )}
      />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-[var(--text-primary)]">{label}</div>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{detail}</p>
      </div>
    </div>
  );
}

function YamlTreeNode({
  expandedPaths,
  node,
  onReviewDiff,
  onToggle,
}: {
  expandedPaths: Set<string>;
  node: YamlChangeNode;
  onReviewDiff: (operation: WorkspaceYOpsDraftOperation) => void;
  onToggle: (path: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedPaths.has(node.path);
  const operation = node.ops[0];

  return (
    <div aria-expanded={hasChildren ? expanded : undefined} role="treeitem" tabIndex={-1}>
      <div className="flex min-h-8 items-center gap-2 rounded px-1.5 py-1 hover:bg-[var(--hover-bg)]">
        {hasChildren ? (
          <button
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.path}`}
            className="inline-flex size-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]"
            onClick={() => onToggle(node.path)}
            type="button"
          >
            {expanded ? (
              <ChevronDown aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronRight aria-hidden="true" className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-5" aria-hidden="true" />
        )}
        {operation ? (
          <button
            aria-label={`Review diff for ${node.path}`}
            className="min-w-0 flex-1 truncate text-left font-mono text-sm font-semibold text-[var(--accent-branch)] hover:underline"
            onClick={() => onReviewDiff(operation)}
            type="button"
          >
            {node.key}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-[var(--text-primary)]">
            {node.key}
          </span>
        )}
        {operation ? <Badge variant="outline">{operation.op}</Badge> : null}
        {node.changeCount > 0 ? <Badge variant="branch-subtle">{node.changeCount}</Badge> : null}
      </div>
      {hasChildren && expanded ? (
        // biome-ignore lint/a11y/useSemanticElements: ARIA tree child containers use role="group".
        <div className="ml-5 border-l border-[var(--stroke-divider)] pl-2" role="group">
          {node.children.map((child) => (
            <YamlTreeNode
              expandedPaths={expandedPaths}
              key={child.path}
              node={child}
              onReviewDiff={onReviewDiff}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChangeDiffPanel({
  candidate,
  flowState,
  onSelectOperation,
  operation,
}: {
  candidate: WorkspaceCandidate;
  flowState?: ChangeReviewFlowState;
  onSelectOperation: (operation: WorkspaceYOpsDraftOperation) => void;
  operation: WorkspaceYOpsDraftOperation | null;
}) {
  if (!operation) {
    return (
      <div
        aria-labelledby="change-track-tab-diff"
        className="p-4"
        id="change-track-diff"
        role="tabpanel"
      >
        <EmptyPanel message="Select an op card to inspect its YAML node diff." />
      </div>
    );
  }

  const { after, before, source } = getOperationDiffValues(operation, flowState);

  return (
    <div
      aria-labelledby="change-track-tab-diff"
      className="p-4"
      id="change-track-diff"
      role="tabpanel"
    >
      <div className="grid min-h-[440px] overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_300px]">
        <aside className="border-b border-[var(--stroke-divider)] lg:border-r lg:border-b-0" aria-label="Changed paths">
          <div className="border-b border-[var(--stroke-divider)] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">Changed paths</h4>
              <Badge variant="branch-subtle">{candidate.yopsDraft.operations.length}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Select a path to inspect.</p>
          </div>
          <ol className="grid gap-1 p-2">
            {candidate.yopsDraft.operations.map((candidateOperation, index) => {
              const selected = candidateOperation.id === operation.id;
              return (
                <li key={candidateOperation.id}>
                  <button
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'grid w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
                      selected
                        ? 'border-[var(--accent-branch)]/30 bg-[var(--accent-branch)]/10'
                        : 'border-transparent hover:border-[var(--stroke-divider)] hover:bg-[var(--surface-card)]'
                    )}
                    onClick={() => onSelectOperation(candidateOperation)}
                    type="button"
                  >
                    <span className="font-mono text-xs font-semibold text-[var(--accent-branch)]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <Badge variant="outline">{candidateOperation.op}</Badge>
                      </span>
                      <span className="mt-1 block break-all font-mono text-[11px] leading-4 text-[var(--text-primary)]">
                        {candidateOperation.path}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section aria-label="Node diff detail" className="min-w-0 border-b border-[var(--stroke-divider)] lg:border-b-0 xl:border-r">
          <div className="border-b border-[var(--stroke-divider)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="branch">{operation.op}</Badge>
              <span className="break-all font-mono text-sm font-semibold text-[var(--text-primary)]">
                {operation.path}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{operation.summary}</p>
          </div>
          {!flowState?.validationPassed ? (
            <div className="border-b border-[var(--status-warning)]/20 bg-[var(--status-warning-muted)] px-4 py-2 text-xs text-[var(--text-secondary)]">
              Run validation to replace proposal metadata with the deterministic dry-run values.
            </div>
          ) : null}
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <DiffValue meta="Candidate baseline" title="Before" value={before} variant="before" />
            <DiffValue meta="Dry-run preview" title="After" value={after} variant="after" />
          </div>
        </section>

        <aside
          aria-label="Change context"
          className="min-w-0 bg-[var(--surface-card)] p-3 lg:col-span-2 lg:border-t lg:border-[var(--stroke-divider)] xl:col-span-1 xl:border-t-0"
        >
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Change context</h4>
          <section className="mt-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              Why this changes
            </h5>
            <p className="mt-2 text-sm leading-5 text-[var(--text-primary)]">
              {operation.reason ?? 'No operation rationale provided.'}
            </p>
          </section>
          <section className="mt-4 border-t border-[var(--stroke-divider)] pt-4">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              Source evidence
            </h5>
            {operation.sourceRefs && operation.sourceRefs.length > 0 ? (
              <ul className="mt-2 grid gap-2">
                {operation.sourceRefs.map((sourceRef) => (
                  <li
                    className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2.5 py-2"
                    key={sourceRef}
                  >
                    <div className="text-xs font-medium text-[var(--text-primary)]">
                      {getSourceTitle(candidate, sourceRef)}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-tertiary)]" title={sourceRef}>
                      {sourceRef}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">No source references attached.</p>
            )}
          </section>
          <section className="mt-4 border-t border-[var(--stroke-divider)] pt-4">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              Value source
            </h5>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">{source}</p>
          </section>
          <section className="mt-4 border-t border-[var(--stroke-divider)] pt-4">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Raw YOp</h5>
            <pre className="mt-2 overflow-auto rounded border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 font-mono text-xs leading-relaxed text-[var(--text-primary)]">
              {formatRawYOp(operation)}
            </pre>
          </section>
        </aside>
      </div>
    </div>
  );
}

function DiffValue({
  meta,
  title,
  value,
  variant,
}: {
  meta: string;
  title: string;
  value: string;
  variant: 'after' | 'before';
}) {
  return (
    <section
      className={cn(
        'rounded-md border p-3',
        variant === 'after'
          ? 'border-[var(--status-success)]/30 bg-[var(--status-success-muted)]'
          : 'border-[var(--status-warning)]/20 bg-[var(--surface-card)]'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">{title}</h4>
        <span className="text-[10px] text-[var(--text-tertiary)]">{meta}</span>
      </div>
      <pre className="mt-3 min-h-28 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-[var(--text-primary)]">
        {value}
      </pre>
    </section>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="mt-2 rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-card)] p-6 text-center text-sm text-[var(--text-secondary)]">
      {message}
    </div>
  );
}

function formatRawYOp(operation: WorkspaceYOpsDraftOperation): string {
  const lines = [`- ${operation.op}:`, `    path: ${operation.path}`];

  if (operation.afterValue !== undefined) {
    lines.push(`    value: ${JSON.stringify(operation.afterValue)}`);
  }

  return lines.join('\n');
}

function buildYamlChangeTree(candidate: WorkspaceCandidate): YamlChangeNode[] {
  const root: YamlChangeNode[] = [];

  candidate.yopsDraft.operations.forEach((operation) => {
    const path = normalizeYamlPath(operation.path);
    if (path) {
      addYamlPath(root, path, { operation });
    }
  });

  return root;
}

function addYamlPath(
  root: YamlChangeNode[],
  rawPath: string,
  options: {
    operation?: WorkspaceYOpsDraftOperation;
  } = {}
) {
  const parts = rawPath
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  let siblings = root;
  let currentPath = '';

  parts.forEach((part, index) => {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    let node = siblings.find((candidateNode) => candidateNode.key === part);
    if (!node) {
      node = createYamlNode(part, currentPath);
      siblings.push(node);
    }

    node.changeCount += options.operation ? 1 : 0;

    if (index === parts.length - 1) {
      if (
        options.operation &&
        !node.ops.some((existingOperation) => existingOperation.id === options.operation?.id)
      ) {
        node.ops.push(options.operation);
      }
    }

    siblings = node.children;
  });
}

function createYamlNode(key: string, path: string): YamlChangeNode {
  return {
    changeCount: 0,
    children: [],
    key,
    ops: [],
    path,
  };
}

function normalizeYamlPath(rawPath: string, documentRoot?: string | null): string | null {
  const normalized = rawPath
    .trim()
    .replaceAll('.', '/')
    .replace(/^\/+|\/+$/g, '');
  if (!normalized) {
    return null;
  }

  if (documentRoot) {
    const firstPart = normalized.split('/')[0];
    if (firstPart !== documentRoot) {
      return `${documentRoot}/${normalized}`;
    }
  }

  return normalized;
}

function getDefaultExpandedYamlPaths(nodes: YamlChangeNode[], depth = 0): string[] {
  return nodes.flatMap((node) => [
    ...(node.children.length > 0 && (depth === 0 || node.changeCount > 0)
      ? [node.path]
      : []),
    ...getDefaultExpandedYamlPaths(node.children, depth + 1),
  ]);
}

function getChangeReviewSummary(
  candidate: WorkspaceCandidate,
  flowState?: ChangeReviewFlowState
): ChangeReviewSummary {
  const yopsCount = candidate.yopsDraft.operations.length;
  const touchedPathCount = new Set(
    candidate.yopsDraft.operations
      .map((operation) => normalizeYamlPath(operation.path))
      .filter((path): path is string => Boolean(path))
  ).size;

  if (flowState?.error) {
    return {
      readinessLabel: 'Return to validation',
      readinessVariant: 'warning',
      touchedPathCount,
      yopsCount,
    };
  }

  if (!flowState?.validationPassed) {
    return {
      readinessLabel: 'Validation required',
      readinessVariant: 'warning',
      touchedPathCount,
      yopsCount,
    };
  }

  if (candidate.yopsDraft.operations.length === 0) {
    return {
      readinessLabel: 'Needs YOps',
      readinessVariant: 'warning',
      touchedPathCount,
      yopsCount,
    };
  }

  if (flowState?.commitHash ?? candidate.lastCommitHash) {
    return {
      readinessLabel: 'Committed',
      readinessVariant: 'commit',
      touchedPathCount,
      yopsCount,
    };
  }

  if (flowState?.previewReady) {
    return {
      readinessLabel: 'Ready to commit',
      readinessVariant: 'success',
      touchedPathCount,
      yopsCount,
    };
  }

  return {
    readinessLabel: 'Preview pending',
    readinessVariant: 'warning',
    touchedPathCount,
    yopsCount,
  };
}

function getCurrentStateLabel(
  candidate: WorkspaceCandidate,
  flowState?: ChangeReviewFlowState
): string {
  return (
    flowState?.commitHash ??
    candidate.lastCommitHash ??
    (flowState?.previewReady ? 'Materialized preview' : 'Pending')
  );
}

function getBaselineStateLabel(candidate: WorkspaceCandidate): string {
  return candidate.lastCommitHash ? 'Committed baseline' : 'Candidate baseline';
}

function getOperationDiffValues(
  operation: WorkspaceYOpsDraftOperation,
  flowState?: ChangeReviewFlowState
): { after: string; before: string; source: string } {
  const beforeValue = resolveTreePathValue(flowState?.baselineTrees ?? null, operation.path);
  const afterValue = resolveTreePathValue(flowState?.previewTrees ?? null, operation.path);
  const hasValidatedValues = beforeValue !== undefined || afterValue !== undefined;

  return {
    after: formatDiffValue(afterValue ?? operation.afterValue),
    before: formatDiffValue(beforeValue ?? operation.beforeValue),
    source: hasValidatedValues
      ? 'Deterministic YOps dry-run'
      : 'Proposal metadata — validate to confirm the actual preview value',
  };
}

function resolveTreePathValue(
  trees: WorkspaceYOpsTreeNode[] | null,
  rawPath: string
): WorkspaceYOpsValue | undefined {
  if (!trees) return undefined;
  const path = normalizeYamlPath(rawPath.replace(/\/-$/, ''));
  const parts = path?.split('/').filter(Boolean) ?? [];
  if (parts.length < 2) return undefined;

  let node = trees.find((tree) => tree.key === parts[0]);
  if (!node) return undefined;

  for (const childKey of parts.slice(1, -1)) {
    node = node.children.find((child) => child.key === childKey);
    if (!node) return undefined;
  }

  return node.slots[parts.at(-1) ?? ''];
}

function formatDiffValue(value: WorkspaceYOpsValue | string | undefined): string {
  if (value === undefined) return '∅ Not present';
  if (value === '') return '∅ Empty string';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function getSourceTitle(candidate: WorkspaceCandidate, sourceRef: string): string {
  return candidate.sourceBundle.find((source) => source.id === sourceRef)?.title ?? 'Source evidence';
}
