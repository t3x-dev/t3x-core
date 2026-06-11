'use client';

import type { Node } from '@xyflow/react';
import { Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { commitHashLabel, relativeTime } from '@/domain/format/formatters';
import type { CanvasNodeData } from '@/types/nodes';
import { cn } from '@/utils/cn';
import type { CommitAction } from './CommitActionPanel';

type CanvasUnitNode = Node<CanvasNodeData, 'unit'>;

interface CanvasSelectionPanelProps {
  node: CanvasUnitNode | null;
  actions: CommitAction[];
  parentHash?: string;
  canMerge?: boolean;
}

function formatBranchLabel(node: CanvasUnitNode): string {
  if (node.data.branchType !== 'branch') return 'main';
  const raw = node.data.branchName?.trim();
  if (!raw) return 'branch';
  return /^branch\b/i.test(raw) ? raw : `branch ${raw}`;
}

function formatAge(value?: string): string {
  if (!value) return 'unknown';
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? relativeTime(value) : value;
}

function getSummary(node: CanvasUnitNode, firstTree?: string): string {
  const message = node.data.commit?.message?.trim();
  if (message && message !== node.data.title) return message;
  const summary = node.data.summary?.trim();
  if (summary && summary !== 'No facets') return summary;
  return firstTree ? `${firstTree} updated in this version` : 'state tree updated';
}

function treeLabel(count: number): string {
  return `${count} tree${count === 1 ? '' : 's'}`;
}

function relationLabel(count: number): string {
  return `${count} relation${count === 1 ? '' : 's'}`;
}

function getStatus(node: CanvasUnitNode, hasParent: boolean, canMerge: boolean): string {
  if (node.data.commitStatus !== 'committed') {
    return node.data.commitStatus ?? 'pending';
  }
  if (!hasParent) {
    return 'root commit · verified';
  }
  if (node.data.branchType === 'branch' && canMerge) {
    return 'branch head · verified';
  }
  if (node.data.branchType === 'branch') {
    return 'branch commit · verified';
  }
  return 'main commit · verified';
}

function getActionNote(node: CanvasUnitNode, hasParent: boolean, canMerge: boolean): string {
  const hasLeaf = (node.data.leaves?.length ?? 0) > 0;
  if (!hasParent) {
    return hasLeaf
      ? 'Root commit has no parent, so View Diff is hidden. Open Leaf keeps existing output one click away; New Leaf creates another output from this exact version.'
      : 'Root commit has no parent, so View Diff is hidden. New Leaf creates output from this exact version.';
  }
  if (node.data.branchType === 'branch' && canMerge) {
    return 'Merge appears because this is the latest branch head. New Leaf still targets this exact commit version.';
  }
  if (node.data.branchType === 'branch') {
    return 'Diff compares this branch commit with its parent. Merge appears only on the latest branch head.';
  }
  return 'Diff compares this commit with its parent. Merge is hidden on main; New Leaf targets this exact version.';
}

function actionButtonClass(action: CommitAction): string {
  if (action.tone === 'primary') {
    return 'bg-[var(--accent-commit)] text-[var(--on-accent)] hover:bg-[var(--accent-commit)]/90';
  }
  if (action.tone === 'leaf') {
    return 'border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)] hover:bg-[var(--accent-leaf)]/15';
  }
  if (action.tone === 'merge') {
    return 'border-[var(--accent-branch)]/25 bg-[var(--accent-branch-soft)] text-[var(--accent-branch)] hover:bg-[var(--accent-branch)]/15';
  }
  return 'border-[var(--stroke-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]';
}

function panelActionLabel(action: CommitAction): string {
  if (action.label === 'New Leaf') return 'Create Leaf From This Version';
  if (action.label === 'Merge') return 'Start Merge Into Main';
  return action.label;
}

function panelActionClass(action: CommitAction): string {
  return action.label === 'New Leaf' || action.label === 'Merge' ? 'col-span-2' : '';
}

function introTargetForAction(action: CommitAction): string | undefined {
  if (action.label === 'Details') return 'canvas-action-details';
  if (action.label === 'View Diff') return 'canvas-action-diff';
  if (action.label === 'Open Leaf') return 'canvas-action-open-leaf';
  if (action.label === 'New Leaf') return 'canvas-action-new-leaf';
  if (action.label === 'Merge') return 'canvas-action-merge';
  return undefined;
}

function PanelBlock({
  children,
  meta,
  title,
}: {
  children: React.ReactNode;
  meta?: string;
  title: string;
}) {
  return (
    <section className="rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-card)] shadow-[var(--fx-highlight-inset)]">
      <div className="flex items-center justify-between border-b border-[var(--stroke-default)] px-2.5 py-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
          {title}
        </h3>
        {meta && (
          <span className="rounded-full border border-[var(--stroke-default)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
            {meta}
          </span>
        )}
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[68px_1fr] gap-2 text-[11px]">
      <span className="text-[var(--text-tertiary)]">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-[var(--text-secondary)]">
        {value}
      </span>
    </div>
  );
}

function DeltaRow({
  badge,
  children,
  label,
  tone,
}: {
  badge: string;
  children: React.ReactNode;
  label: string;
  tone: 'leaf' | 'branch';
}) {
  const toneClass =
    tone === 'leaf'
      ? 'bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]'
      : 'bg-[var(--accent-branch-soft)] text-[var(--accent-branch)]';
  return (
    <div
      className={cn(
        'grid grid-cols-[22px_1fr_auto] items-start gap-1.5 rounded-lg px-2 py-1.5',
        tone === 'leaf' ? 'bg-[var(--accent-leaf-soft)]/60' : 'bg-[var(--accent-branch-soft)]/60'
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
          toneClass
        )}
      >
        {badge}
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-[var(--text-primary)]">{label}</div>
        <div className="truncate text-[11px] text-[var(--text-tertiary)]">{children}</div>
      </div>
      <span className="rounded-full border border-[var(--stroke-default)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
        {tone === 'leaf' ? 'tree' : 'branch'}
      </span>
    </div>
  );
}

export function CanvasSelectionPanel({
  actions,
  canMerge = false,
  node,
  parentHash,
}: CanvasSelectionPanelProps) {
  if (!node) {
    return null;
  }

  const branchLabel = formatBranchLabel(node);
  const hash = node.data.commitHash || node.data.commit?.hash;
  const hashLabel = hash ? commitHashLabel(hash) : 'none';
  const trees = node.data.commit?.content?.trees ?? [];
  const relations = node.data.commit?.content?.relations ?? [];
  const firstTree = trees[0]?.key ?? node.data.title;
  const summary = getSummary(node, firstTree);
  const source = node.data.sources?.[0]?.label ?? node.data.conversationId ?? 'source not linked';
  const hasParent = Boolean(parentHash);
  const hasLeaf = (node.data.leaves?.length ?? 0) > 0;

  return (
    <aside className="hidden w-80 shrink-0 border-l border-[var(--stroke-default)] bg-[var(--surface-panel)] xl:flex xl:flex-col">
      <div className="border-b border-[var(--stroke-default)] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
            SELECTION
          </div>
          <span className="rounded-full border border-[var(--stroke-default)] px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-[var(--text-tertiary)]">
            {hashLabel}
          </span>
        </div>
        <div className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">
          {node.data.title}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        <PanelBlock meta={branchLabel} title="At a Glance">
          <div className="space-y-1.5">
            <FactRow label="status" value={getStatus(node, hasParent, canMerge)} />
            <FactRow
              label="content"
              value={`${treeLabel(trees.length)} · ${relationLabel(relations.length)}`}
            />
            <FactRow label="source" value={source} />
            <FactRow label="age" value={formatAge(node.data.timestamp)} />
          </div>
        </PanelBlock>

        <PanelBlock meta={hasParent ? 'vs parent' : 'root'} title="State Delta">
          <div className="space-y-1.5">
            <DeltaRow badge={hasParent ? '+' : '•'} label={firstTree} tone="leaf">
              {summary}
            </DeltaRow>
            {node.data.branchType === 'branch' && (
              <DeltaRow badge="~" label="branch path" tone="branch">
                commit diverges from main path
              </DeltaRow>
            )}
          </div>
        </PanelBlock>

        <PanelBlock meta="selected" title="Available Actions">
          <div className="grid grid-cols-2 gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                type="button"
                data-intro-target={introTargetForAction(action)}
                variant="canvas-outline"
                size="sm"
                className={cn(
                  'h-7 min-w-0 text-xs',
                  actionButtonClass(action),
                  panelActionClass(action)
                )}
                onClick={action.onClick}
              >
                <span className="shrink-0 opacity-75">{action.icon}</span>
                <span className="truncate">{panelActionLabel(action)}</span>
              </Button>
            ))}
          </div>
          <div className="mt-2 rounded-lg bg-[var(--surface-muted)] px-2.5 py-1.5 text-[10px] leading-snug text-[var(--text-tertiary)]">
            {getActionNote(node, hasParent, canMerge)}
          </div>
          {hasLeaf && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent-leaf)]">
              <Leaf size={12} />
              <span>Existing leaf remains openable; New Leaf creates another artifact.</span>
            </div>
          )}
        </PanelBlock>

        <PanelBlock meta="prototype" title="Action Logic">
          <div className="space-y-1.5">
            <div className="grid grid-cols-[58px_1fr] gap-2 rounded-lg bg-[var(--surface-muted)] px-2 py-1.5 text-[10px]">
              <span className="font-semibold text-[var(--text-primary)]">root</span>
              <span className="text-[var(--text-tertiary)]">
                Open Leaf + New Leaf. Diff is hidden because root has no parent.
              </span>
            </div>
            <div className="grid grid-cols-[58px_1fr] gap-2 rounded-lg bg-[var(--surface-muted)] px-2 py-1.5 text-[10px]">
              <span className="font-semibold text-[var(--text-primary)]">main child</span>
              <span className="text-[var(--text-tertiary)]">
                Diff + Create Leaf. Merge is hidden on main.
              </span>
            </div>
            <div className="grid grid-cols-[58px_1fr] gap-2 rounded-lg bg-[var(--surface-muted)] px-2 py-1.5 text-[10px]">
              <span className="font-semibold text-[var(--text-primary)]">branch head</span>
              <span className="text-[var(--text-tertiary)]">
                Diff + Create Leaf + Merge. Merge exists only on latest branch head.
              </span>
            </div>
          </div>
        </PanelBlock>
      </div>
    </aside>
  );
}
