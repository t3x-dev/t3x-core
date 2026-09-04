import Link from 'next/link';
import type { ReactNode } from 'react';
import { ProjectTabs } from '@/components/project/ProjectTabs';
import type { ProjectTabId } from '@/components/project/projectTabModel';
import { DEFAULT_OWNER_SLUG, getProjectRepoPath } from '@/domain/project/repoPath';
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
  children: ReactNode;
  project: ProjectShellProject;
}

export function ProjectShell({ activeTab, children, project }: ProjectShellProps) {
  const status = project.status ?? 'draft';
  const outputCount = Math.max(0, project.outputsCount ?? 0);
  const repoPath = getProjectRepoPath(project);

  return (
    <div className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-[var(--surface-app)] text-[var(--text-primary)] [--text-base:14px] [--text-lg:16px] [--text-sm:13px] [--text-xs:12px]">
      <header className="relative flex h-14 shrink-0 items-center border-b border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-5 pt-2 before:absolute before:inset-x-0 before:top-0 before:h-2 before:bg-[var(--surface-app)]">
        <div className="flex h-full min-w-0 flex-1 items-center gap-3">
          <Link
            aria-label={`Back to ${DEFAULT_OWNER_SLUG}`}
            className="inline-flex h-8 shrink-0 items-center text-xl font-extrabold leading-none tracking-normal text-[var(--text-primary)] focus-visible:rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
            href="/"
          >
            T3X
          </Link>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--stroke-divider)]" />
          <div className="flex h-7 min-w-0 max-w-[min(360px,34vw)] items-center gap-1.5 rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--surface-elevated))] px-2.5 text-[13px] leading-[18px] shadow-[var(--fx-shadow-sm)]">
            <span className="shrink-0 font-medium text-[var(--text-tertiary)]">
              {DEFAULT_OWNER_SLUG}
            </span>
            <span aria-hidden="true" className="shrink-0 text-[var(--text-tertiary)]">
              /
            </span>
            <h1 className="min-w-0 truncate font-semibold text-[var(--text-primary)]">
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
          <ProjectTabs activeTab={activeTab} outputCount={outputCount} repoPath={repoPath} />
        </div>
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
