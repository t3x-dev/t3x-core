import { Braces, Database, GitPullRequest, Grid2X2, Layers3, Settings } from 'lucide-react';
import Link from 'next/link';
import {
  getProjectTabSegment,
  PROJECT_TABS,
  type ProjectTabId,
} from '@/components/project/projectTabModel';
import { cn } from '@/utils/cn';

export interface ProjectTabsProps {
  activeTab: ProjectTabId;
  composeChrome?: boolean;
  repoPath: string;
  projectIdNavigation?: boolean;
  settingsHref?: string;
  stacked?: boolean;
}

export function ProjectTabs({
  activeTab,
  composeChrome = false,
  repoPath,
  projectIdNavigation = false,
  settingsHref = '/settings',
  stacked = false,
}: ProjectTabsProps) {
  return (
    <nav
      aria-label="Project views"
      className={cn(
        'flex min-h-10 min-w-0 items-center gap-1 overflow-x-auto pb-1',
        !stacked &&
          'min-[1200px]:flex-1 min-[1200px]:justify-center min-[1200px]:gap-2 min-[1200px]:pb-0'
      )}
    >
      {PROJECT_TABS.map((tab) => {
        const selected = activeTab === tab.id;
        const visibleLabel = tab.id === 'reviews' ? 'PRs' : tab.label;
        const Icon = {
          state: Database,
          schemas: Braces,
          workspaces: Layers3,
          reviews: GitPullRequest,
          outputs: Grid2X2,
          community: Grid2X2,
          settings: Settings,
        }[tab.id];

        return (
          <Link
            aria-label={tab.label}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] px-3.5 text-[14px] font-medium leading-5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50',
              composeChrome
                ? selected
                  ? 'font-semibold text-[var(--text-primary)] after:absolute after:inset-x-3 after:bottom-[-4px] after:h-0.5 after:rounded-full after:bg-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                : selected
                  ? 'bg-[var(--accent-commit-soft)] font-semibold !text-[var(--accent-commit)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
            href={
              tab.id === 'settings'
                ? settingsHref
                : tab.id === 'state'
                  ? repoPath
                  : projectIdNavigation
                    ? `${repoPath}?tab=${getProjectTabSegment(tab.id)}`
                    : `${repoPath}/${getProjectTabSegment(tab.id)}`
            }
            key={tab.id}
            scroll={false}
          >
            {composeChrome ? <Icon aria-hidden="true" className="size-3.5" /> : null}
            <span>{visibleLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
