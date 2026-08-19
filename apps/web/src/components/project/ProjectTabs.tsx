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
  return (
    <nav
      aria-label="Project views"
      className="flex min-h-8 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-1"
    >
      {PROJECT_TABS.map((tab) => {
        const Icon = tabIcons[tab.id];
        const selected = activeTab === tab.id;

        return (
          <Link
            aria-label={tab.label}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-info)]/30',
              selected
                ? 'border-[var(--accent-commit)] font-medium text-[var(--text-primary)]'
                : 'border-transparent font-normal text-[var(--text-secondary)] hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
            href={tab.id === 'state' ? repoPath : `${repoPath}/${getProjectTabSegment(tab.id)}`}
            key={tab.id}
            scroll={false}
          >
            <Icon
              aria-hidden="true"
              className={cn('size-3.5', selected ? 'opacity-90' : 'opacity-60')}
            />
            <span>{tab.label}</span>
            {tab.id === 'outputs' ? (
              <span className="ml-0.5 min-w-4 rounded-full border border-[var(--stroke-default)] bg-[var(--surface-card)] px-1.5 py-0.5 text-center text-[10px] font-mono leading-none text-[var(--text-secondary)]">
                {outputCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
