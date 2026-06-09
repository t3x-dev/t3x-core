'use client';

import { Maximize } from 'lucide-react';
import { useMemo } from 'react';
import { ChatSidebarToggleButton } from '@/components/chat/ChatSidebarToggleButton';
import { Button } from '@/components/ui/button';
import { commitHashLabel } from '@/domain/format/formatters';
import { useCanvasStore } from '@/store/canvasStore';
import { cn } from '@/utils/cn';
import { glass } from '@/utils/theme';

interface CanvasToolbarProps {
  projectName: string;
  onFitView: () => void;
  showChatSidebarToggle?: boolean;
}

export function CanvasToolbar({
  projectName,
  onFitView,
  showChatSidebarToggle = false,
}: CanvasToolbarProps) {
  const nodes = useCanvasStore((state) => state.nodes);
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

  return (
    <header
      data-intro-target="project-toolbar"
      className={cn(
        'relative flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--stroke-divider)] px-4',
        glass.panelBase,
        glass.highlight
      )}
    >
      {showChatSidebarToggle && (
        <ChatSidebarToggleButton className="absolute left-[9px] top-[7px]" />
      )}
      <div className={cn('min-w-0 flex-1', showChatSidebarToggle && 'pl-[34px]')}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate text-base font-semibold tracking-tight text-foreground">
              {projectName}
            </h2>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
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
