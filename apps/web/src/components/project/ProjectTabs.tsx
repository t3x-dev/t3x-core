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
      className="flex min-h-8 shrink-0 items-stretch gap-0 overflow-x-auto border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
    >
      {PROJECT_TABS.map((tab) => {
        const Icon = tabIcons[tab.id];
        const selected = activeTab === tab.id;

        return (
          <Link
            aria-label={tab.label}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-info)]/30',
              selected
                ? 'border-[var(--accent-commit)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
            href={tab.id === 'state' ? repoPath : `${repoPath}/${getProjectTabSegment(tab.id)}`}
            key={tab.id}
            scroll={false}
          >
            <Icon aria-hidden="true" className="h-3 w-3" />
            <span>{tab.label}</span>
            {tab.id === 'outputs' ? (
              <span className="min-w-5 rounded-full bg-[var(--hover-bg-strong)] px-1.5 py-px text-center text-xs leading-none">
                {outputCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
