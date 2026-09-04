import Link from 'next/link';
import {
  getProjectTabSegment,
  PROJECT_TABS,
  type ProjectTabId,
} from '@/components/project/projectTabModel';
import { cn } from '@/utils/cn';

export interface ProjectTabsProps {
  activeTab: ProjectTabId;
  outputCount?: number;
  repoPath: string;
}

export function ProjectTabs({ activeTab, outputCount = 0, repoPath }: ProjectTabsProps) {
  return (
    <nav
      aria-label="Project views"
      className="ml-4 flex min-w-0 flex-1 items-center gap-3 overflow-x-auto min-[900px]:absolute min-[900px]:left-1/2 min-[900px]:top-8 min-[900px]:ml-0 min-[900px]:w-max min-[900px]:max-w-[calc(100%-2.5rem)] min-[900px]:-translate-x-1/2 min-[900px]:-translate-y-1/2 min-[900px]:gap-4 min-[900px]:overflow-visible"
    >
      {PROJECT_TABS.map((tab) => {
        const selected = activeTab === tab.id;
        const visibleLabel = tab.id === 'reviews' ? 'PRs' : tab.label;

        return (
          <Link
            aria-label={tab.label}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 shrink-0 items-center rounded-[var(--radius-md)] px-3.5 text-[14px] font-medium leading-5 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50',
              selected
                ? 'bg-[var(--accent-commit-soft)] font-semibold !text-[var(--accent-commit)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
            )}
            data-output-count={tab.id === 'outputs' ? outputCount : undefined}
            href={tab.id === 'state' ? repoPath : `${repoPath}/${getProjectTabSegment(tab.id)}`}
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
