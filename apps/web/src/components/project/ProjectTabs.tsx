import Link from 'next/link';
import {
  getProjectTabSegment,
  PROJECT_TABS,
  type ProjectTabId,
} from '@/components/project/projectTabModel';
import { cn } from '@/utils/cn';

export interface ProjectTabsProps {
  activeTab: ProjectTabId;
  branch?: string | null;
  repoPath: string;
  projectIdNavigation?: boolean;
  settingsHref?: string;
  stacked?: boolean;
  workspaceId?: string | null;
}

export function ProjectTabs({
  activeTab,
  branch,
  repoPath,
  projectIdNavigation = false,
  settingsHref = '/settings',
  stacked = false,
  workspaceId,
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
        const baseHref =
          tab.id === 'settings'
            ? settingsHref
            : tab.id === 'state'
              ? repoPath
              : projectIdNavigation
                ? `${repoPath}?tab=${getProjectTabSegment(tab.id)}`
                : `${repoPath}/${getProjectTabSegment(tab.id)}`;
        const context = new URLSearchParams();
        if (branch && tab.id !== 'settings') {
          context.set('branch', branch);
        }
        if (workspaceId && (tab.id === 'schemas' || tab.id === 'workspaces')) {
          context.set('workspace', workspaceId);
        }
        const contextQuery = context.toString();
        const href = contextQuery
          ? `${baseHref}${baseHref.includes('?') ? '&' : '?'}${contextQuery}`
          : baseHref;
        return (
          <Link
            aria-label={tab.label}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] px-3.5 text-[14px] font-medium leading-5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50',
              selected
                ? 'bg-[var(--accent-commit-soft)] font-semibold !text-[var(--accent-commit)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
            href={href}
            key={tab.id}
            scroll={false}
          >
            <span>{visibleLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
