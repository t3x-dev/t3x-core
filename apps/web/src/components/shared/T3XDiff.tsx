import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { StructuredDiffChange, StructuredDiffKind } from '@/domain/diff/structuredStateDiff';
import { cn } from '@/utils/cn';

interface DiffPathNode {
  change?: StructuredDiffChange;
  children: DiffPathNode[];
  id: string;
  key: string;
  path: string;
}

interface T3XDiffProps {
  baselineLabel: string;
  changes: StructuredDiffChange[];
  headerSubtitle: string;
  onOpenChange?: () => void;
  onSelectChange: (changeId: string) => void;
  open?: boolean;
  pathSubtitle: string;
  projectedLabel: string;
  selectedChangeId: string;
  secondaryStat?: ReactNode;
}

export function T3XDiff({
  baselineLabel,
  changes,
  headerSubtitle,
  onOpenChange,
  onSelectChange,
  open = true,
  pathSubtitle,
  projectedLabel,
  selectedChangeId,
  secondaryStat,
}: T3XDiffProps) {
  const pathTree = useMemo(() => buildDiffPathTree(changes), [changes]);
  const selectedChange =
    changes.find((change) => change.id === selectedChangeId) ?? changes[0] ?? null;
  const evidenceCount = new Set(
    changes.map((change) => change.evidence).filter((value): value is string => Boolean(value))
  ).size;
  const removedCount = changes.filter((change) => change.kind === 'removed').length;

  return (
    <section
      aria-label="T3X Diff"
      className="border-t border-[var(--stroke-divider)] bg-[var(--surface-card)]"
    >
      <header className="flex min-h-[54px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] px-4 py-2.5">
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">T3X Diff</h4>
          <p className="mt-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
            {headerSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="branch-subtle">
            {changes.length} field {changes.length === 1 ? 'change' : 'changes'}
          </Badge>
          {secondaryStat ?? <Badge variant="success">{evidenceCount} evidence matched</Badge>}
          <Badge variant="success">{removedCount} removed</Badge>
        </div>
        {onOpenChange ? (
          <button
            aria-expanded={open}
            className="ml-auto text-xs font-semibold text-[var(--accent-commit)] hover:underline"
            onClick={onOpenChange}
            type="button"
          >
            {open ? 'Hide Diff' : 'Show Diff'}
          </button>
        ) : null}
      </header>

      {open ? (
        selectedChange ? (
          <div className="grid min-h-[400px] grid-cols-1 overflow-hidden lg:h-[400px] lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(500px,1fr)_340px]">
            <aside className="min-h-0 overflow-auto border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] lg:border-r lg:border-b-0">
              <div className="sticky top-0 z-10 flex min-h-[54px] items-center justify-between gap-2 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2.5">
                <div>
                  <h5 className="text-xs font-semibold text-[var(--text-primary)]">
                    Changed paths
                  </h5>
                  <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{pathSubtitle}</p>
                </div>
                <Badge variant="warning">{changes.length} touched</Badge>
              </div>
              <div className="p-2" role="tree" aria-label="Changed state paths">
                {pathTree.map((node) => (
                  <DiffPathTreeNode
                    key={node.id}
                    node={node}
                    onSelectChange={onSelectChange}
                    selectedChangeId={selectedChange.id}
                  />
                ))}
              </div>
            </aside>

            <section className="min-h-0 min-w-0 overflow-auto border-b border-[var(--stroke-divider)] lg:border-b-0 2xl:border-r">
              <header className="border-b border-[var(--stroke-divider)] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  Node / field
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <ChangeKindBadge kind={selectedChange.kind} />
                  <Badge variant="outline">{selectedChange.op}</Badge>
                  <h5 className="text-sm font-semibold text-[var(--text-primary)]">
                    {selectedChange.summary}
                  </h5>
                </div>
                <p className="mt-1 break-all font-mono text-[10px] text-[var(--text-tertiary)]">
                  {selectedChange.path}
                </p>
              </header>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                <DiffValue
                  meta={baselineLabel}
                  title="Before"
                  value={selectedChange.beforeValue}
                  variant="before"
                />
                <DiffValue
                  meta={projectedLabel}
                  title="After"
                  value={selectedChange.afterValue}
                  variant="after"
                />
              </div>
            </section>

            <aside className="min-h-0 min-w-0 overflow-auto bg-[var(--surface-card)] p-4 lg:col-span-2 lg:border-t lg:border-[var(--stroke-divider)] 2xl:col-span-1 2xl:border-t-0">
              <SectionLabel>Reason</SectionLabel>
              <p className="mt-2 text-sm leading-6 text-[var(--text-primary)]">
                {selectedChange.reason}
              </p>
              <div className="mt-4 border-t border-[var(--stroke-divider)] pt-4">
                <SectionLabel>Evidence</SectionLabel>
                {selectedChange.evidence ? (
                  <blockquote className="mt-2 rounded-md border border-[var(--accent-conversation)]/20 bg-[var(--accent-conversation)]/5 p-3 text-xs leading-5 text-[var(--text-primary)]">
                    “{selectedChange.evidence}”
                  </blockquote>
                ) : (
                  <p className="mt-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
                    No source evidence was recorded for this change.
                  </p>
                )}
                <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">
                  {selectedChange.evidenceSource ?? 'Commit provenance'}
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="flex min-h-[240px] items-center justify-center p-6 text-sm text-[var(--text-secondary)]">
            No fields changed between these states.
          </div>
        )
      ) : null}
    </section>
  );
}

function DiffPathTreeNode({
  node,
  onSelectChange,
  selectedChangeId,
}: {
  node: DiffPathNode;
  onSelectChange: (changeId: string) => void;
  selectedChangeId: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const selected = node.change?.id === selectedChangeId;

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
        {node.change ? (
          <button
            aria-current={selected ? 'true' : undefined}
            className="min-w-0 flex-1 truncate text-left font-mono font-semibold hover:underline"
            onClick={() => onSelectChange(node.change?.id ?? '')}
            type="button"
          >
            {node.key}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono font-semibold text-[var(--text-primary)]">
            {node.key}
          </span>
        )}
        {node.change ? (
          <span className={cn('text-[10px] font-medium', changeTone(node.change.kind))}>
            {changeLabel(node.change)}
          </span>
        ) : null}
      </div>
      {hasChildren && expanded ? (
        // biome-ignore lint/a11y/useSemanticElements: ARIA tree child containers use role="group".
        <div className="ml-3 border-l border-[var(--stroke-divider)] pl-2" role="group">
          {node.children.map((child) => (
            <DiffPathTreeNode
              key={child.id}
              node={child}
              onSelectChange={onSelectChange}
              selectedChangeId={selectedChangeId}
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

function ChangeKindBadge({ kind }: { kind: StructuredDiffKind }) {
  return (
    <Badge variant={kind === 'removed' ? 'destructive' : kind === 'added' ? 'success' : 'warning'}>
      {kind[0].toUpperCase() + kind.slice(1)}
    </Badge>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h5 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
      {children}
    </h5>
  );
}

function buildDiffPathTree(changes: StructuredDiffChange[]): DiffPathNode[] {
  const roots: DiffPathNode[] = [];

  for (const change of changes) {
    const segments = change.path.split('/').filter(Boolean);
    let siblings = roots;
    let parentPath = '';

    segments.forEach((segment, index) => {
      const visiblePath = `${parentPath}/${segment}`;
      const finalSegment = index === segments.length - 1;
      let node = siblings.find(
        (candidate) => candidate.path === visiblePath && (!finalSegment || !candidate.change)
      );
      if (!node) {
        node = {
          children: [],
          id: finalSegment ? `${visiblePath}:${change.id}` : visiblePath,
          key: segment,
          path: visiblePath,
        };
        siblings.push(node);
      }
      if (finalSegment) node.change = change;
      siblings = node.children;
      parentPath = visiblePath;
    });
  }

  return roots;
}

function changeLabel(change: StructuredDiffChange): string {
  if (change.path.endsWith('/-') && change.kind === 'added') return '+1 item';
  return change.kind;
}

function changeTone(kind: StructuredDiffKind): string {
  if (kind === 'removed') return 'text-[var(--diff-removed-accent)]';
  if (kind === 'modified') return 'text-[var(--status-success)]';
  return 'text-[var(--status-success)]';
}
