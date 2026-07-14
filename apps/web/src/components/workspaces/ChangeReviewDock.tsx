import { ChevronDown, ChevronRight, CircleAlert, GitCompareArrows, Rows3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type {
  WorkspaceCandidate,
  WorkspaceSchemaCandidateField,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import { cn } from '@/utils/cn';

type ChangeReviewView = 'overview' | 'issues' | 'diff';

interface ChangeReviewFlowState {
  candidateId?: string;
  yopsDraftId?: string;
  commitHash?: string;
  error?: string;
  previewReady?: boolean;
}

interface ChangeReviewDockProps {
  candidate: WorkspaceCandidate;
  flowState?: ChangeReviewFlowState;
}

const CHANGE_REVIEW_TABS: {
  count?: (summary: ChangeReviewSummary) => number;
  icon: typeof Rows3;
  id: ChangeReviewView;
  label: string;
}[] = [
  { id: 'overview', icon: Rows3, label: 'Overview' },
  { id: 'issues', icon: CircleAlert, label: 'Issues', count: (summary) => summary.issueCount },
  { id: 'diff', icon: GitCompareArrows, label: 'Diff' },
];

interface ChangeReviewSummary {
  evidenceCount: number;
  issueCount: number;
  readinessLabel: string;
  readinessVariant: 'success' | 'warning' | 'commit';
  yopsCount: number;
}

interface YamlChangeNode {
  changeCount: number;
  children: YamlChangeNode[];
  issueCount: number;
  key: string;
  ops: WorkspaceYOpsDraftOperation[];
  path: string;
  schemaCount: number;
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
            <Badge variant="commit-subtle">{summary.yopsCount} YOps</Badge>
            <Badge variant={summary.issueCount > 0 ? 'warning' : 'success'}>
              {summary.issueCount} Issues
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
            const count = tab.count?.(summary);
            const selected = activeView === tab.id;
            const label = count === undefined ? tab.label : `${tab.label} ${count}`;

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
                <span>{label}</span>
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
  if (activeView === 'issues') {
    return (
      <ChangeIssuesPanel candidate={candidate} flowState={flowState} onReviewDiff={onReviewDiff} />
    );
  }

  if (activeView === 'diff') {
    return <ChangeDiffPanel candidate={candidate} operation={selectedOperation} />;
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
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(getDefaultExpandedYamlPaths(yamlTree))
  );
  const topIssues = [flowState?.error, ...candidate.schemaReview.gaps].filter(Boolean) as string[];
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
      <div className="grid gap-3 xl:grid-cols-[minmax(11rem,0.38fr)_minmax(28rem,1.25fr)_minmax(18rem,0.75fr)]">
        <section
          aria-label="Overview summary"
          className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
        >
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Summary</h4>
          <dl className="mt-3 grid gap-2 text-xs">
            <ChangeMeta term="Base" value={candidate.baseCommitHash ?? 'No base commit'} />
            <ChangeMeta
              term="Current"
              value={currentState}
            />
            <ChangeMeta term="Change since base" value={`${summary.yopsCount} changes`} />
            <ChangeMeta term="Touched paths" value={`${countYamlLeafChanges(yamlTree)}`} />
            <ChangeMeta term="YOps proposed" value={`${summary.yopsCount}`} />
            <ChangeMeta term="Blocking issues" value={`${summary.issueCount}`} />
            <ChangeMeta term="Replay status" value="Stable" />
            <ChangeMeta term="Commit readiness" value={summary.readinessLabel} />
          </dl>
        </section>

        <section
          aria-label="YAML overview map"
          className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">YAML change map</h4>
            <Badge variant="branch">{countYamlLeafChanges(yamlTree)} touched</Badge>
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

        <aside
          aria-label="Review side panels"
          className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-1"
        >
          <section className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Top issues</h4>
            {topIssues.length > 0 ? (
              <ul className="mt-2 grid gap-2">
                {topIssues.map((issue) => (
                  <li
                    className="min-w-0 rounded-md border border-[var(--status-warning)]/20 bg-[var(--status-warning-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    key={issue}
                    title={issue}
                  >
                    <span className="block truncate font-mono text-xs">{issue}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyPanel message="No blocking issues for this workspace." />
            )}
          </section>

          <section className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Recent YOps</h4>
            {candidate.yopsDraft.operations.length > 0 ? (
              <ol className="mt-2 grid gap-2">
                {candidate.yopsDraft.operations.map((operation, index) => (
                  <li
                    className="grid min-w-0 grid-cols-[1.75rem_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-2"
                    key={operation.id}
                  >
                    <span className="font-mono text-xs font-semibold text-[var(--accent-branch)]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <Badge variant="outline">{operation.op}</Badge>
                    <span
                      className="truncate font-mono text-xs font-semibold text-[var(--accent-branch)]"
                      title={operation.path}
                    >
                      {operation.path}
                    </span>
                    <Badge
                      variant={candidate.schemaReview.verdict === 'ready' ? 'success' : 'warning'}
                    >
                      {candidate.schemaReview.verdict === 'ready' ? 'Ready' : 'Review'}
                    </Badge>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyPanel message="No YOps operations proposed yet." />
            )}
          </section>
        </aside>
      </div>

      <section
        aria-label="State change timeline"
        className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
      >
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          State change timeline <span className="text-[var(--text-tertiary)]">(replay)</span>
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
  const unchangedSchema =
    node.schemaCount > 0 &&
    node.changeCount === 0 &&
    node.issueCount === 0 &&
    node.ops.length === 0;

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
        {node.issueCount > 0 ? <Badge variant="warning">{node.issueCount}</Badge> : null}
        {unchangedSchema ? <Badge variant="outline">unchanged</Badge> : null}
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

function ChangeIssuesPanel({
  candidate,
  flowState,
  onReviewDiff,
}: {
  candidate: WorkspaceCandidate;
  flowState?: ChangeReviewFlowState;
  onReviewDiff: (operation: WorkspaceYOpsDraftOperation) => void;
}) {
  const hasIssues = candidate.schemaReview.gaps.length > 0 || Boolean(flowState?.error);

  return (
    <div
      aria-labelledby="change-track-tab-issues"
      className="grid gap-3 p-4"
      id="change-track-issues"
      role="tabpanel"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
          <PanelHeader
            count={candidate.schemaReview.gaps.length + (flowState?.error ? 1 : 0)}
            title="Issues"
          />
          {hasIssues ? (
            <div className="mt-2 grid gap-2">
              {flowState?.error ? (
                <IssueNotice label="Flow error" message={flowState.error} />
              ) : null}
              {candidate.schemaReview.gaps.map((gap) => (
                <IssueNotice key={gap} label="Schema review gap" message={gap} />
              ))}
            </div>
          ) : (
            <EmptyPanel message="No blocking issues for this workspace." />
          )}
        </section>

        <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
          <PanelHeader count={candidate.yopsDraft.operations.length} title="Ops cards" />
          {candidate.yopsDraft.operations.length > 0 ? (
            <div className="mt-2 grid gap-2">
              {candidate.yopsDraft.operations.map((operation) => (
                <article
                  className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3"
                  key={operation.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{operation.op}</Badge>
                    <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                      {operation.path}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                    {operation.summary}
                  </p>
                  {operation.reason ? (
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{operation.reason}</p>
                  ) : null}
                  <button
                    className="mt-3 inline-flex h-8 items-center rounded-md border border-[var(--accent-branch)]/30 bg-[var(--accent-branch)]/10 px-3 text-xs font-semibold text-[var(--accent-branch)] transition-colors hover:bg-[var(--accent-branch)]/15"
                    onClick={() => onReviewDiff(operation)}
                    type="button"
                  >
                    Review diff for {operation.op}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyPanel message="No YOps operations proposed yet." />
          )}
        </section>
      </div>
    </div>
  );
}

function ChangeDiffPanel({
  candidate,
  operation,
}: {
  candidate: WorkspaceCandidate;
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

  return (
    <div
      aria-labelledby="change-track-tab-diff"
      className="grid gap-3 p-4"
      id="change-track-diff"
      role="tabpanel"
    >
      <section
        aria-label="Node diff detail"
        className="grid gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="branch">{operation.op}</Badge>
              <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                {operation.path}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{operation.summary}</p>
          </div>
          <Badge variant={candidate.schemaReview.verdict === 'ready' ? 'success' : 'warning'}>
            {candidate.schemaReview.verdict === 'ready' ? 'Ready' : 'Review'}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DiffValue title="Before" value={operation.beforeValue ?? 'empty'} variant="before" />
          <DiffValue title="After" value={operation.afterValue ?? 'empty'} variant="after" />
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.75fr)]">
          <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
            <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
              Why this changes
            </h4>
            <p className="mt-2 text-sm text-[var(--text-primary)]">
              {operation.reason ?? 'No operation rationale provided.'}
            </p>
          </section>
          <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
            <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">
              Source evidence
            </h4>
            {operation.sourceRefs && operation.sourceRefs.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {operation.sourceRefs.map((sourceRef) => (
                  <li key={sourceRef}>
                    <Badge variant="conversation">{sourceRef}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                No source references attached.
              </p>
            )}
          </section>
        </div>

        <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
          <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Raw YOp</h4>
          <pre className="mt-2 overflow-auto rounded border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 font-mono text-xs leading-relaxed text-[var(--text-primary)]">
            {formatRawYOp(operation)}
          </pre>
        </section>
      </section>
    </div>
  );
}

function PanelHeader({ count, title }: { count: number; title: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
      <Badge variant={count > 0 ? 'warning' : 'success'}>{count}</Badge>
    </div>
  );
}

function IssueNotice({ label, message }: { label: string; message: string }) {
  return (
    <article className="rounded-md border border-[var(--status-warning)]/20 bg-[var(--status-warning-muted)] px-3 py-2">
      <div className="text-xs font-semibold text-[var(--status-warning)]">{label}</div>
      <p className="mt-1 text-sm text-[var(--text-primary)]">{message}</p>
    </article>
  );
}

function DiffValue({
  title,
  value,
  variant,
}: {
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
      <h4 className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">{title}</h4>
      <p className="mt-2 whitespace-pre-wrap break-words font-mono text-sm text-[var(--text-primary)]">
        {value}
      </p>
    </section>
  );
}

function ChangeMeta({ term, value }: { term: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[var(--text-tertiary)]">{term}</dt>
      <dd className="mt-0.5 truncate font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
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
  const documentRoot = inferYamlRoot(candidate);

  candidate.yopsDraft.operations.forEach((operation) => {
    const path = normalizeYamlPath(operation.path);
    if (path) {
      addYamlPath(root, path, { operation });
    }
  });

  addSchemaFieldPaths(root, candidate.schemaCandidate.fields, documentRoot);

  candidate.schemaReview.gaps.forEach((gap) => {
    const path = normalizeIssuePath(gap, documentRoot);
    if (path) {
      addYamlPath(root, path, { issueCount: 1 });
    }
  });

  return root;
}

function addYamlPath(
  root: YamlChangeNode[],
  rawPath: string,
  options: {
    issueCount?: number;
    operation?: WorkspaceYOpsDraftOperation;
    schemaCount?: number;
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
    node.schemaCount += options.schemaCount ?? 0;

    if (index === parts.length - 1) {
      if (
        options.operation &&
        !node.ops.some((existingOperation) => existingOperation.id === options.operation?.id)
      ) {
        node.ops.push(options.operation);
      }
      node.issueCount += options.issueCount ?? 0;
    }

    siblings = node.children;
  });
}

function createYamlNode(key: string, path: string): YamlChangeNode {
  return {
    changeCount: 0,
    children: [],
    issueCount: 0,
    key,
    ops: [],
    path,
    schemaCount: 0,
  };
}

function addSchemaFieldPaths(
  root: YamlChangeNode[],
  fields: WorkspaceSchemaCandidateField[],
  documentRoot: string | null,
  parentPath?: string
) {
  fields.forEach((field) => {
    const fieldPath =
      parentPath && !(field.path.includes('.') || field.path.includes('/'))
        ? `${parentPath}.${field.path}`
        : field.path;
    const path = normalizeYamlPath(fieldPath, documentRoot);
    if (path) {
      addYamlPath(root, path, { schemaCount: 1 });
    }
    addSchemaFieldPaths(root, field.children ?? [], documentRoot, fieldPath);
  });
}

function inferYamlRoot(candidate: WorkspaceCandidate): string | null {
  const roots = candidate.yopsDraft.operations
    .map((operation) => normalizeYamlPath(operation.path)?.split('/')[0])
    .filter((part): part is string => Boolean(part) && part !== '-');
  const uniqueRoots = Array.from(new Set(roots));
  return uniqueRoots.length === 1 ? uniqueRoots[0] : null;
}

function normalizeIssuePath(issue: string, documentRoot: string | null): string | null {
  const trimmed = issue.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }
  if (!(trimmed.includes('/') || trimmed.includes('.'))) {
    return null;
  }
  return normalizeYamlPath(trimmed, documentRoot);
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
    ...(node.children.length > 0 && (depth === 0 || node.changeCount > 0 || node.issueCount > 0)
      ? [node.path]
      : []),
    ...getDefaultExpandedYamlPaths(node.children, depth + 1),
  ]);
}

function countYamlLeafChanges(nodes: YamlChangeNode[]): number {
  return nodes.reduce((count, node) => {
    const nodeTouches = node.ops.length > 0 || node.issueCount > 0 ? 1 : 0;
    return count + nodeTouches + countYamlLeafChanges(node.children);
  }, 0);
}

function getChangeReviewSummary(
  candidate: WorkspaceCandidate,
  flowState?: ChangeReviewFlowState
): ChangeReviewSummary {
  const issueCount = candidate.schemaReview.gaps.length + (flowState?.error ? 1 : 0);
  const yopsCount = candidate.yopsDraft.operations.length;
  const evidenceCount = candidate.sourceBundle.length;

  if (flowState?.error) {
    return {
      evidenceCount,
      issueCount,
      readinessLabel: 'Blocked',
      readinessVariant: 'warning',
      yopsCount,
    };
  }

  if (candidate.sourceBundle.length === 0) {
    return {
      evidenceCount,
      issueCount,
      readinessLabel: 'Needs source',
      readinessVariant: 'warning',
      yopsCount,
    };
  }

  if (candidate.schemaReview.verdict !== 'ready' || candidate.schemaReview.gaps.length > 0) {
    return {
      evidenceCount,
      issueCount,
      readinessLabel: 'Review schema',
      readinessVariant: 'warning',
      yopsCount,
    };
  }

  if (candidate.yopsDraft.operations.length === 0) {
    return {
      evidenceCount,
      issueCount,
      readinessLabel: 'Needs YOps',
      readinessVariant: 'warning',
      yopsCount,
    };
  }

  if (flowState?.commitHash ?? candidate.lastCommitHash) {
    return {
      evidenceCount,
      issueCount,
      readinessLabel: 'Committed',
      readinessVariant: 'commit',
      yopsCount,
    };
  }

  if (flowState?.previewReady) {
    return {
      evidenceCount,
      issueCount,
      readinessLabel: 'Preview ready',
      readinessVariant: 'success',
      yopsCount,
    };
  }

  return {
    evidenceCount,
    issueCount,
    readinessLabel: 'YOps review',
    readinessVariant: 'success',
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
