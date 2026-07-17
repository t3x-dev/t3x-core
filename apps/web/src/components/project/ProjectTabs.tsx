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
import { PROJECT_TABS, type ProjectTabId } from '@/components/project/projectTabModel';
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
  repoPath: string;
}

export function ProjectTabs({ activeTab, repoPath }: ProjectTabsProps) {
  return (
    <nav
      aria-label="Project views"
      className="flex min-h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3"
    >
      {PROJECT_TABS.map((tab) => {
        const Icon = tabIcons[tab.id];
        const selected = activeTab === tab.id;

        return (
          <Link
            aria-label={tab.label}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--status-info)]/30',
              selected
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
            href={tab.id === 'state' ? repoPath : `${repoPath}/${tab.id}`}
            key={tab.id}
            scroll={false}
          >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
