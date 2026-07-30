import {
  Boxes,
  FileCode2,
  GitCommitHorizontal,
  GitPullRequestArrow,
  MessageCircle,
  PanelTop,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';
import {
  getProjectTabSegment,
  PROJECT_TABS,
  type ProjectTabId,
} from '@/components/project/projectTabModel';
import { cn } from '@/utils/cn';

const tabIcons: Record<ProjectTabId, ComponentType<{ className?: string }>> = {
  state: GitCommitHorizontal,
  schemas: FileCode2,
  workspaces: Boxes,
  reviews: GitPullRequestArrow,
  outputs: PanelTop,
  community: MessageCircle,
  settings: Settings,
};

export interface ProjectTabsProps {
  activeTab: ProjectTabId;
  outputCount?: number;
  repoPath: string;
}

export function ProjectTabs({ activeTab, outputCount = 0, repoPath }: ProjectTabsProps) {
  const compact = activeTab === 'state';

  return (
    <nav
      aria-label="Project views"
      className={cn(
        'flex shrink-0 items-stretch gap-0 overflow-x-auto border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]',
        compact ? 'min-h-8 px-0' : 'min-h-10 px-3'
      )}
    >
      {PROJECT_TABS.map((tab) => {
        const Icon = tabIcons[tab.id];
        const selected = activeTab === tab.id;

        return (
          <Link
            aria-label={tab.label}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 border-b-2 font-medium transition-colors',
              compact ? 'h-8 px-3 text-[10.5px] font-semibold' : 'h-10 px-3 text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-info)]/30',
              selected
                ? 'border-[var(--accent-commit)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
            href={tab.id === 'state' ? repoPath : `${repoPath}/${getProjectTabSegment(tab.id)}`}
            key={tab.id}
            scroll={false}
          >
            <Icon aria-hidden="true" className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            <span>{tab.label}</span>
            {compact && tab.id === 'outputs' ? (
              <span className="min-w-[18px] rounded-full bg-[var(--hover-bg-strong)] px-1.5 py-px text-center text-[9px] leading-none">
                {outputCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
