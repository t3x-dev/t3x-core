import { ArrowRight, ChevronDown, ChevronRight, Code2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import { cn } from '@/utils/cn';

interface ProposalReviewViewProps {
  candidate: WorkspaceCandidate;
  flowError?: string | null;
  onContinueToValidation?: () => void;
  onSendToYOps?: () => Promise<void> | void;
  proposalMode: string;
  sendingToYOps: boolean;
  statusText: string;
  yopsDraftSent: boolean;
  yopsLines: string[];
}

interface ProposalPathNode {
  children: ProposalPathNode[];
  key: string;
  operation?: WorkspaceYOpsDraftOperation;
  path: string;
}

export function ProposalReviewView({
  candidate,
  flowError,
  onContinueToValidation,
  onSendToYOps,
  proposalMode,
  sendingToYOps,
  statusText,
  yopsDraftSent,
  yopsLines,
}: ProposalReviewViewProps) {
  const operations = candidate.yopsDraft.operations;
  const [selectedOperationId, setSelectedOperationId] = useState(operations.at(-1)?.id ?? null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [yopsOpen, setYOpsOpen] = useState(false);
  const selectedOperation =
    operations.find((operation) => operation.id === selectedOperationId) ?? operations[0] ?? null;
  const selectedIndex = Math.max(
    operations.findIndex((operation) => operation.id === selectedOperation?.id),
    0
  );

  useEffect(() => {
    setSelectedOperationId(operations.at(-1)?.id ?? null);
  }, [candidate.id, candidate.yopsDraft.id, operations]);

  return (
    <section aria-label="YOps proposal" className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-[72px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
            Proposal
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Review what T3X recommends and why.
          </p>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Badge variant="branch-subtle">
            {candidate.sourceBundle.length}{' '}
            {candidate.sourceBundle.length === 1 ? 'source' : 'sources'}
          </Badge>
          <Badge variant="secondary">
            {operations.length} {operations.length === 1 ? 'recommendation' : 'recommendations'}
          </Badge>
          <Badge variant="outline">{proposalMode}</Badge>
          {yopsDraftSent ? <Badge variant="pending-subtle">Proposal ready</Badge> : null}
          <span className="max-w-40 truncate text-[10px] font-medium text-[var(--text-tertiary)]">
            {statusText}
          </span>
          <Button
            aria-expanded={yopsOpen}
            onClick={() => setYOpsOpen((current) => !current)}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <Code2 aria-hidden="true" className="size-4" />
            {yopsOpen ? 'Close YOps' : 'Open YOps'}
          </Button>
          <Button
            disabled={operations.length === 0}
            onClick={onContinueToValidation}
            size="sm"
            type="button"
            variant="commit"
          >
            Continue to Validation
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </header>

      {flowError ? (
        <div
          className="border-b border-[var(--status-warning)]/20 bg-[var(--status-warning-muted)] px-4 py-2 text-xs text-[var(--text-secondary)]"
          role="alert"
        >
          {flowError}
        </div>
      ) : null}

      {yopsOpen ? <YOpsScriptPanel lines={yopsLines} /> : null}

      {selectedOperation ? (
        <>
          <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]">
            <aside
              aria-label="Recommendations"
              className="flex min-h-[430px] min-w-0 flex-col border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] lg:border-r lg:border-b-0"
            >
              <div className="flex min-h-[54px] items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-2.5">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                    Recommendations
                  </h4>
                  <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                    Source-backed suggestions · replay order
                  </p>
                </div>
                <Badge variant="secondary">{operations.length}</Badge>
              </div>
              <ol className="min-h-0 flex-1 overflow-auto">
                {operations.map((operation, index) => (
                  <li key={operation.id}>
                    <button
                      aria-current={operation.id === selectedOperation.id ? 'true' : undefined}
                      className={cn(
                        'grid min-h-[82px] w-full grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b border-[var(--stroke-divider)] px-3 py-3 text-left transition-colors',
                        operation.id === selectedOperation.id
                          ? 'border-l-2 border-l-[var(--accent-branch)] bg-[var(--diff-modified-bg)]'
                          : 'border-l-2 border-l-transparent bg-[var(--surface-card)] hover:bg-[var(--hover-bg)]'
                      )}
                      onClick={() => setSelectedOperationId(operation.id)}
                      type="button"
                    >
                      <span className="pt-0.5 font-mono text-xs font-semibold text-[var(--text-tertiary)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-start gap-2">
                          <Badge variant="outline">{operation.op.toUpperCase()}</Badge>
                          <strong className="min-w-0 flex-1 text-sm leading-5 text-[var(--text-primary)]">
                            {operation.summary}
                          </strong>
                        </span>
                        <span className="mt-1 block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                          {operation.path}
                        </span>
                        <span className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                          <span className="font-semibold text-[var(--status-success)]">
                            {operation.sourceRefs?.length ? 'Source matched' : 'Source required'}
                          </span>
                          <span className="text-[var(--text-tertiary)]">
                            1 YOp · affects 1 field
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {onSendToYOps ? (
                <footer className="border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
                  <Button
                    className="w-full"
                    disabled={sendingToYOps}
                    onClick={onSendToYOps}
                    size="sm"
                    type="button"
                    variant="canvas-outline"
                  >
                    {sendingToYOps
                      ? 'Generating proposal...'
                      : yopsDraftSent
                        ? 'Regenerate YOps proposal'
                        : 'Generate YOps proposal'}
                  </Button>
                </footer>
              ) : null}
            </aside>

            <ProposalDetail
              candidate={candidate}
              index={selectedIndex}
              operation={selectedOperation}
            />
          </div>

          <WorkspaceDiff
            candidate={candidate}
            onOpenChange={() => setDiffOpen((current) => !current)}
            onSelectOperation={setSelectedOperationId}
            open={diffOpen}
            phase="proposal"
            selectedOperation={selectedOperation}
          />
        </>
      ) : (
        <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">No proposed YOps operations yet.</strong>
          <span>Add source evidence and generate a YOps proposal before validating.</span>
          {onSendToYOps ? (
            <Button
              className="mt-2"
              disabled={sendingToYOps}
              onClick={onSendToYOps}
              size="sm"
              type="button"
              variant="canvas-outline"
            >
              {sendingToYOps ? 'Generating proposal...' : 'Generate YOps proposal'}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ProposalDetail({
  candidate,
  index,
  operation,
}: {
  candidate: WorkspaceCandidate;
  index: number;
  operation: WorkspaceYOpsDraftOperation;
}) {
  const source = getPrimaryOperationSource(candidate, operation);
  const sourceExcerpt = getSourceExcerpt(source, operation);

  return (
    <article aria-label="Selected recommendation" className="min-w-0 bg-[var(--surface-card)]">
      <header className="flex min-h-[78px] flex-wrap items-start gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
            Recommendation {String(index + 1).padStart(2, '0')}
          </p>
          <h4 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
            {operation.summary}
          </h4>
          <p className="mt-1 break-all font-mono text-[10px] text-[var(--text-tertiary)]">
            {operation.path}
          </p>
        </div>
        <Badge variant="pending-subtle">Proposed</Badge>
      </header>

      <section className="border-b border-[var(--stroke-divider)] px-4 py-4">
        <SectionLabel>1 · Source</SectionLabel>
        <div className="mt-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
          <blockquote className="text-sm leading-6 text-[var(--text-primary)]">
            “{sourceExcerpt}”
          </blockquote>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--stroke-divider)] pt-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {source?.title ?? 'Workspace source bundle'}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                {source?.id ?? operation.sourceRefs?.[0] ?? 'source reference unavailable'}
              </p>
            </div>
            <Badge variant={source ? 'success' : 'warning'}>{source ? 'Matched' : 'Review'}</Badge>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--stroke-divider)] px-4 py-4">
        <SectionLabel>2 · Reason</SectionLabel>
        <div className="mt-2 border-l-2 border-l-[var(--accent-branch)] bg-[var(--diff-modified-bg)] px-3 py-2.5">
          <p className="text-sm leading-6 text-[var(--text-primary)]">
            {operation.reason ?? 'This recommendation is derived from the matched source evidence.'}
          </p>
        </div>
      </section>

      <section className="px-4 py-4">
        <SectionLabel>3 · Proposed value</SectionLabel>
        <div className="mt-2 overflow-hidden rounded-md border border-[var(--status-success)]/30 bg-[var(--status-success-muted)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--status-success)]/20 px-3 py-2 text-[10px]">
            <strong className="uppercase tracking-[0.08em] text-[var(--status-success)]">
              Proposed
            </strong>
            <span className="text-[var(--text-tertiary)]">Recommendation · not applied</span>
          </div>
          <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-[var(--text-primary)]">
            {formatDisplayValue(operation.afterValue)}
          </pre>
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--status-success)]/20 px-3 py-2">
            <Badge variant="outline">{operation.op.toUpperCase()}</Badge>
            <Badge variant="outline">affects 1 field</Badge>
          </div>
        </div>
      </section>
    </article>
  );
}

export function WorkspaceDiff({
  candidate,
  onOpenChange,
  onSelectOperation,
  open,
  phase,
  schemaPassed = false,
  selectedOperation,
}: {
  candidate: WorkspaceCandidate;
  onOpenChange: () => void;
  onSelectOperation: (operationId: string) => void;
  open: boolean;
  phase: 'proposal' | 'validation';
  schemaPassed?: boolean;
  selectedOperation: WorkspaceYOpsDraftOperation;
}) {
  const operations = candidate.yopsDraft.operations;
  const pathTree = useMemo(() => buildProposalPathTree(operations), [operations]);
  const evidenceCount = new Set(operations.flatMap((operation) => operation.sourceRefs ?? [])).size;
  const removedCount = operations.filter((operation) => /delete|remove/i.test(operation.op)).length;
  const source = getPrimaryOperationSource(candidate, selectedOperation);

  return (
    <section
      aria-label="T3X Diff"
      className="border-t border-[var(--stroke-divider)] bg-[var(--surface-card)]"
    >
      <header className="flex min-h-[54px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] px-4 py-2.5">
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">T3X Diff</h4>
          <p className="mt-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
            {phase === 'validation'
              ? 'Validated projection · Baseline → Projected'
              : 'Proposal · Baseline → Projected'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="branch-subtle">{operations.length} field changes</Badge>
          {phase === 'validation' ? (
            <Badge variant={schemaPassed ? 'success' : 'pending-subtle'}>
              YSchema {schemaPassed ? 'pass' : 'pending'}
            </Badge>
          ) : (
            <Badge variant="success">{evidenceCount} evidence matched</Badge>
          )}
          <Badge variant="success">{removedCount} removed</Badge>
        </div>
        <button
          aria-expanded={open}
          className="ml-auto text-xs font-semibold text-[var(--accent-commit)] hover:underline"
          onClick={onOpenChange}
          type="button"
        >
          {open ? 'Hide Diff' : 'Show Diff'}
        </button>
      </header>

      {open ? (
        <div className="grid min-h-[330px] grid-cols-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          <aside className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] lg:border-r lg:border-b-0">
            <div className="flex min-h-[54px] items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-3 py-2.5">
              <div>
                <h5 className="text-xs font-semibold text-[var(--text-primary)]">Changed paths</h5>
                <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
                  Preview component · node-level result
                </p>
              </div>
              <Badge variant="warning">{operations.length} touched</Badge>
            </div>
            <div className="overflow-auto p-2" role="tree" aria-label="Proposal changed paths">
              {pathTree.map((node) => (
                <ProposalPathTreeNode
                  key={node.path}
                  node={node}
                  onSelectOperation={onSelectOperation}
                  selectedOperationId={selectedOperation.id}
                />
              ))}
            </div>
          </aside>

          <section className="min-w-0 border-b border-[var(--stroke-divider)] lg:border-b-0 xl:border-r">
            <header className="border-b border-[var(--stroke-divider)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                Node / field
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="warning">Modified</Badge>
                <Badge variant="outline">{selectedOperation.op.toUpperCase()}</Badge>
                <h5 className="text-sm font-semibold text-[var(--text-primary)]">
                  {selectedOperation.summary}
                </h5>
              </div>
              <p className="mt-1 break-all font-mono text-[10px] text-[var(--text-tertiary)]">
                {selectedOperation.path}
              </p>
            </header>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              <DiffValue
                meta="Baseline"
                title="Before"
                value={formatDisplayValue(selectedOperation.beforeValue)}
                variant="before"
              />
              <DiffValue
                meta="Projected"
                title="After"
                value={formatDisplayValue(selectedOperation.afterValue)}
                variant="after"
              />
            </div>
          </section>

          <aside className="min-w-0 bg-[var(--surface-card)] p-4 lg:col-span-2 lg:border-t lg:border-[var(--stroke-divider)] xl:col-span-1 xl:border-t-0">
            <SectionLabel>3 · Reason</SectionLabel>
            <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">
              {selectedOperation.reason ?? 'No operation rationale provided.'}
            </p>
            <div className="mt-4 border-t border-[var(--stroke-divider)] pt-4">
              <SectionLabel>4 · Evidence</SectionLabel>
              <blockquote className="mt-2 rounded-md border border-[var(--accent-conversation)]/20 bg-[var(--accent-conversation)]/5 p-3 text-xs leading-5 text-[var(--text-primary)]">
                “{getSourceExcerpt(source, selectedOperation)}”
              </blockquote>
              <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">
                {source?.title ?? 'Source reference unavailable'}
              </p>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function ProposalPathTreeNode({
  node,
  onSelectOperation,
  selectedOperationId,
}: {
  node: ProposalPathNode;
  onSelectOperation: (operationId: string) => void;
  selectedOperationId: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const selected = node.operation?.id === selectedOperationId;

  return (
    <div aria-expanded={hasChildren ? expanded : undefined} role="treeitem" tabIndex={-1}>
      <div
        className={cn(
          'flex min-h-8 items-center gap-1.5 rounded px-1.5 text-xs',
          selected ? 'bg-[var(--diff-modified-bg)] text-[var(--accent-branch)]' : ''
        )}
      >
        {hasChildren ? (
          <button
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.path}`}
            className="inline-flex size-5 items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)]"
            onClick={() => setExpanded((current) => !current)}
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
        {node.operation ? (
          <button
            aria-current={selected ? 'true' : undefined}
            className="min-w-0 flex-1 truncate text-left font-mono font-semibold hover:underline"
            onClick={() => onSelectOperation(node.operation?.id ?? '')}
            type="button"
          >
            {node.key}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono font-semibold text-[var(--text-primary)]">
            {node.key}
          </span>
        )}
        {node.operation ? (
          <span className="text-[10px] font-medium text-[var(--status-success)]">
            {getOperationChangeLabel(node.operation)}
          </span>
        ) : null}
      </div>
      {hasChildren && expanded ? (
        // biome-ignore lint/a11y/useSemanticElements: ARIA tree child containers use role="group".
        <div className="ml-3 border-l border-[var(--stroke-divider)] pl-2" role="group">
          {node.children.map((child) => (
            <ProposalPathTreeNode
              key={child.path}
              node={child}
              onSelectOperation={onSelectOperation}
              selectedOperationId={selectedOperationId}
            />
          ))}
        </div>
      ) : null}
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
        'min-h-32 overflow-hidden rounded-md border',
        variant === 'after'
          ? 'border-[var(--status-success)]/30 bg-[var(--status-success-muted)]'
          : 'border-[var(--stroke-divider)] bg-[var(--surface-panel)]'
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-inherit px-3 py-2 text-[10px] uppercase tracking-[0.08em]">
        <strong
          className={
            variant === 'after' ? 'text-[var(--status-success)]' : 'text-[var(--text-tertiary)]'
          }
        >
          {title}
        </strong>
        <span className="normal-case tracking-normal text-[var(--text-tertiary)]">{meta}</span>
      </header>
      <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-[var(--text-primary)]">
        {value}
      </pre>
    </section>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h5 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
      {children}
    </h5>
  );
}

function YOpsScriptPanel({ lines }: { lines: string[] }) {
  return (
    <section aria-label="YOps script" className="border-b border-[var(--stroke-divider)]">
      <div className="flex items-center justify-between bg-[var(--editor-gutter)] px-4 py-2">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">YOps plan</span>
        <Badge variant="secondary">Read only</Badge>
      </div>
      <pre className="max-h-80 overflow-auto bg-[var(--editor-bg)] p-4 font-mono text-xs leading-5 text-[var(--text-code)]">
        {lines.join('\n')}
      </pre>
    </section>
  );
}

function getPrimaryOperationSource(
  candidate: WorkspaceCandidate,
  operation: WorkspaceYOpsDraftOperation
): SourceBundleItem | undefined {
  const sourceRefs = operation.sourceRefs ?? [];
  return candidate.sourceBundle.find((source) => sourceRefs.includes(source.id));
}

function getSourceExcerpt(
  source: SourceBundleItem | undefined,
  operation: WorkspaceYOpsDraftOperation
): string {
  const userTurn = source?.previewTurns?.find((turn) => turn.role === 'user');
  const previewTurn = userTurn ?? source?.previewTurns?.at(-1);
  return (
    previewTurn?.content ??
    source?.previewText ??
    source?.description ??
    operation.reason ??
    'No source excerpt is available for this recommendation.'
  );
}

function formatDisplayValue(value: string | undefined): string {
  if (value === undefined || value === '') return 'Empty';
  return value;
}

function getOperationChangeLabel(operation: WorkspaceYOpsDraftOperation): string {
  if (/append|add/i.test(operation.op)) return '+1 item';
  if (/delete|remove/i.test(operation.op)) return 'removed';
  return 'modified';
}

function buildProposalPathTree(operations: WorkspaceYOpsDraftOperation[]): ProposalPathNode[] {
  const roots: ProposalPathNode[] = [];

  for (const operation of operations) {
    const segments = operation.path.split('/').filter(Boolean);
    let siblings = roots;
    let parentPath = '';

    segments.forEach((segment, index) => {
      const path = `${parentPath}/${segment}`;
      let node = siblings.find((candidate) => candidate.path === path);
      if (!node) {
        node = { children: [], key: segment, path };
        siblings.push(node);
      }
      if (index === segments.length - 1) node.operation = operation;
      siblings = node.children;
      parentPath = path;
    });
  }

  return roots;
}
