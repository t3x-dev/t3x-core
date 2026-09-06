import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProjectTabs } from '@/components/project/ProjectTabs';
import type { ProjectTabId } from '@/components/project/projectTabModel';
import {
  DEFAULT_OWNER_SLUG,
  getProjectIdRepoPath,
  getProjectRepoPath,
} from '@/domain/project/repoPath';
import type { YSchemaValidationSummary } from '@/domain/project/yschemaValidation';
import { cn } from '@/utils/cn';

export interface ProjectShellProject {
  id?: string;
  name: string;
  description?: string;
  status?: 'draft' | 'active' | 'paused';
  drafts?: number;
  commitsCount?: number;
  branchesCount?: number;
  outputsCount?: number;
  yschemaValidation?: YSchemaValidationSummary | null;
}

export interface ProjectShellProps {
  activeTab: ProjectTabId;
  projectIdNavigation?: boolean;
  children: ReactNode;
  project: ProjectShellProject;
}

export function ProjectShell({
  activeTab,
  children,
  project,
  projectIdNavigation = false,
}: ProjectShellProps) {
  const status = project.status ?? 'draft';
  const repoPath =
    projectIdNavigation && project.id
      ? getProjectIdRepoPath(project.id)
      : getProjectRepoPath(project);

  return (
    <div className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-[var(--surface-app)] text-[var(--text-primary)] [--text-base:14px] [--text-lg:16px] [--text-sm:13px] [--text-xs:12px]">
      <header className="flex shrink-0 flex-col border-b border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-3 min-[1200px]:h-14 min-[1200px]:flex-row min-[1200px]:gap-6 min-[1200px]:px-5">
        <div className="flex h-14 min-w-0 shrink-0 items-center gap-3 min-[1200px]:max-w-[360px]">
          <Link
            aria-label={projectIdNavigation ? 'Back to projects' : `Back to ${DEFAULT_OWNER_SLUG}`}
            className="inline-flex h-8 shrink-0 items-center text-xl font-extrabold leading-none tracking-normal text-[var(--text-primary)] focus-visible:rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
            href="/"
          >
            T3X
          </Link>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--stroke-divider)]" />
          <div className="flex h-7 min-w-0 max-w-[min(360px,55vw)] items-center gap-1.5 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--surface-elevated))] px-2.5 text-[13px] leading-[18px] shadow-[var(--fx-shadow-sm)]">
            <span className="shrink-0 font-medium text-[var(--text-tertiary)]">
              {projectIdNavigation ? 'Project' : DEFAULT_OWNER_SLUG}
            </span>
            <span aria-hidden="true" className="shrink-0 text-[var(--text-tertiary)]">
              /
            </span>
            <h1
              title={project.name}
              className="min-w-0 truncate font-semibold text-[var(--text-primary)]"
            >
              {project.name}
            </h1>
          </div>
          <p className="sr-only">{project.description || 'Structured state repository'}</p>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 text-xs font-medium',
              status === 'active'
                ? 'text-[var(--status-success)]'
                : status === 'paused'
                  ? 'text-[var(--status-warning)]'
                  : 'text-[var(--text-tertiary)]'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 rounded-full',
                status === 'active'
                  ? 'bg-[var(--status-success)]'
                  : status === 'paused'
                    ? 'bg-[var(--status-warning)]'
                    : 'bg-[var(--text-tertiary)]'
              )}
            />
            {status}
          </span>
        </div>
        <ProjectTabs
          activeTab={activeTab}
          repoPath={repoPath}
          projectIdNavigation={projectIdNavigation}
        />
      </header>
      <main
        className={
          activeTab === 'state' || activeTab === 'workspaces'
            ? 'min-h-0 flex-1 overflow-hidden'
            : 'min-h-0 flex-1 overflow-auto'
        }
      >
        {children}
      </main>
    </div>
  );
}
