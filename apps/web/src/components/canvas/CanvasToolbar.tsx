'use client';

import { ArrowLeft, ChevronDown, Clock3, Maximize, Network } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { commitHashLabel } from '@/domain/format/formatters';
import { getProjectIdWorkspacePath } from '@/domain/project/repoPath';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasPendingConversation } from '@/types/nodes';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';

interface CanvasToolbarProps {
  embedded?: boolean;
  branchFilter?: string;
  branchOptions?: string[];
  focusedBranch?: string;
  onBranchFilterChange?: (branch: string) => void;
  projectName: string;
  onFitView: () => void;
  stateHref?: string;
}

function PendingConversationsBadge({
  conversations,
  projectId,
}: {
  conversations: CanvasPendingConversation[];
  projectId: string | null;
}) {
  const count = conversations.length;
  const label = `${count} pending conversation${count === 1 ? '' : 's'}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={label}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--accent-pending)]/35 bg-[var(--accent-pending-soft)] px-2.5 text-[11px] font-semibold text-[var(--accent-pending)] transition-colors enabled:hover:bg-[var(--accent-pending)]/15 disabled:cursor-default"
          disabled={count === 0}
          type="button"
        >
          <Clock3 aria-hidden="true" className="size-3.5" />
          {label}
          {count > 0 ? <ChevronDown aria-hidden="true" className="size-3" /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 overflow-hidden p-0" sideOffset={8}>
        <div className="border-b border-[var(--stroke-divider)] px-3 py-2.5">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Pending conversations</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
            Conversations with content that have not produced a commit.
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {conversations.map((conversation) => {
            const content = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">
                    {conversation.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[var(--text-tertiary)]">
                    {conversation.turnsCount} turn{conversation.turnsCount === 1 ? '' : 's'} ·{' '}
                    {conversation.branch}
                  </span>
                </span>
                <ArrowLeft
                  aria-hidden="true"
                  className="size-3.5 rotate-180 text-[var(--text-tertiary)]"
                />
              </>
            );

            return projectId ? (
              <Link
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-[var(--hover-bg)]"
                href={getProjectIdWorkspacePath(projectId, {
                  branch: conversation.branch,
                  sourceConversationId: conversation.conversationId,
                })}
                key={conversation.conversationId}
              >
                {content}
              </Link>
            ) : (
              <div
                className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                key={conversation.conversationId}
              >
                {content}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CanvasToolbar({
  embedded = false,
  branchFilter = 'all',
  branchOptions = [],
  focusedBranch,
  onBranchFilterChange,
  projectName,
  onFitView,
  stateHref,
}: CanvasToolbarProps) {
  const nodes = useCanvasStore((state) => state.nodes);
  const pendingConversations = useCanvasStore((state) => state.pendingConversations);
  const projectId = useCanvasStore((state) => state.projectId);
  const stats = useMemo(() => {
    let mainCommits = 0;
    let leaves = 0;
    const branchCounts = new Map<string, number>();
    let latestHash = '';
    let latestAt = 0;

    for (const node of nodes) {
      if (node.data.kind !== 'unit' || node.data.commitStatus !== 'committed') continue;
      if (node.data.branchType === 'branch') {
        const raw = node.data.branchName?.trim() || 'branch';
        const branchName = /^branch\b/i.test(raw) ? raw : `branch ${raw}`;
        branchCounts.set(branchName, (branchCounts.get(branchName) ?? 0) + 1);
      } else {
        mainCommits++;
      }
      leaves += node.data.leaves?.length ?? 0;
      const committedAt = new Date(node.data.commit?.committed_at ?? node.data.timestamp).getTime();
      if (Number.isFinite(committedAt) && committedAt > latestAt) {
        latestAt = committedAt;
        const hash = node.data.commitHash ?? node.data.commit?.hash ?? '';
        latestHash = hash ? commitHashLabel(hash) : '';
      }
    }

    return {
      branches: Array.from(branchCounts.entries()),
      latestHash,
      leaves,
      mainCommits,
    };
  }, [nodes]);

  if (embedded) {
    return (
      <header
        className={cn(
          'relative flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-2',
          glass.panelBase,
          glass.highlight
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
            <Network aria-hidden="true" className="size-4 text-[var(--accent-commit)]" />
            State evolution
          </span>
          <label className="relative inline-flex h-7 items-center rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-card)] text-[11px] font-semibold text-[var(--text-secondary)]">
            <select
              aria-label="Canvas branch filter"
              className="h-full appearance-none bg-transparent py-0 pl-2.5 pr-7 outline-none"
              onChange={(event) => onBranchFilterChange?.(event.target.value)}
              value={branchFilter}
            >
              <option value="all">All branches</option>
              {branchOptions.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3.5" />
          </label>
          {focusedBranch ? (
            <span className="rounded-full border border-[var(--accent-branch)]/30 bg-[var(--accent-branch-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-branch)]">
              State focus · {focusedBranch}
            </span>
          ) : null}
          <span className="rounded-full border border-[var(--accent-commit)]/30 bg-[var(--accent-commit-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-commit)]">
            {stats.mainCommits} main commit{stats.mainCommits === 1 ? '' : 's'}
          </span>
          <span className="rounded-full border border-[var(--accent-leaf)]/30 bg-[var(--accent-leaf-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-leaf)]">
            {stats.leaves} output leaf{stats.leaves === 1 ? '' : 's'}
          </span>
          <PendingConversationsBadge conversations={pendingConversations} projectId={projectId} />
          <span
            className="text-[10px] text-[var(--text-tertiary)]"
            title="The server returns at most 100 commits for this canvas."
          >
            latest 100 max
          </span>
        </div>
        {stateHref ? (
          <Button asChild size="sm" variant="canvas-outline">
            <Link data-intro-target="canvas-back-to-state" href={stateHref}>
              <ArrowLeft aria-hidden="true" className="size-4" /> State
            </Link>
          </Button>
        ) : null}
        <Button
          className="h-8 w-8 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          onClick={onFitView}
          size="icon"
          title="Fit View"
          variant="ghost"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </header>
    );
  }

  return (
    <header
      data-intro-target="project-toolbar"
      className={cn(
        'relative flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--stroke-divider)] px-4',
        glass.panelBase,
        glass.highlight
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate text-base font-semibold tracking-tight text-foreground">
              {projectName}
            </h2>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
            <label className="relative inline-flex h-6 shrink-0 items-center rounded-full border border-[var(--stroke-default)] bg-[var(--surface-card)] text-[11px] font-semibold text-[var(--text-secondary)]">
              <select
                aria-label="Canvas branch filter"
                className="h-full appearance-none bg-transparent py-0 pl-2.5 pr-7 outline-none"
                onChange={(event) => onBranchFilterChange?.(event.target.value)}
                value={branchFilter}
              >
                <option value="all">All branches</option>
                {branchOptions.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 size-3" />
            </label>
            <span className="rounded-full border border-[var(--accent-commit)]/30 bg-[var(--accent-commit-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-commit)]">
              main · {stats.mainCommits} commit{stats.mainCommits === 1 ? '' : 's'}
            </span>
            {stats.branches.map(([branch, count]) => (
              <span
                key={branch}
                className="rounded-full border border-[var(--accent-branch)]/30 bg-[var(--accent-branch-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-branch)]"
              >
                {branch} · {count} commit{count === 1 ? '' : 's'}
              </span>
            ))}
            <span className="rounded-full border border-[var(--accent-leaf)]/30 bg-[var(--accent-leaf-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-leaf)]">
              {stats.leaves} output leaf{stats.leaves === 1 ? '' : 's'}
            </span>
            <PendingConversationsBadge conversations={pendingConversations} projectId={projectId} />
            {stats.latestHash && (
              <span className="rounded-full border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--text-secondary)]">
                latest commit {stats.latestHash}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="hidden items-center gap-3 text-xs text-[var(--text-tertiary)] lg:flex">
        <span>Canvas view · not a navigation hub</span>
        {stateHref ? (
          <Button asChild size="sm" variant="canvas-outline">
            <Link data-intro-target="canvas-back-to-state" href={stateHref}>
              <ArrowLeft className="size-4" />
              State
            </Link>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={onFitView}
          title="Fit View"
          className={cn(
            'h-8 w-8 rounded-lg transition-all',
            'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
          )}
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
      {stateHref ? (
        <Button asChild className="lg:hidden" size="icon-sm" variant="canvas-outline">
          <Link
            aria-label="Back to State"
            data-intro-target="canvas-back-to-state"
            href={stateHref}
          >
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        onClick={onFitView}
        title="Fit View"
        className="h-8 w-8 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] lg:hidden"
      >
        <Maximize className="h-4 w-4" />
      </Button>
    </header>
  );
}
