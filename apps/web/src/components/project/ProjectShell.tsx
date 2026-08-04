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
    <div className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-[var(--surface-app)] text-[var(--text-primary)]">
      <header className="h-9 shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2.5">
        <div className="flex h-full min-w-0 items-center gap-2">
          <Link
            aria-label={`Back to ${DEFAULT_OWNER_SLUG}`}
            className="inline-flex h-6 shrink-0 items-center rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
            href="/"
          >
            {DEFAULT_OWNER_SLUG}
          </Link>
          <span
            aria-hidden="true"
            className="text-sm font-semibold leading-none text-[var(--text-tertiary)]"
          >
            /
          </span>
          <h1 className="min-w-0 max-w-[min(720px,58vw)] truncate text-base font-semibold leading-tight text-[var(--text-primary)]">
            {project.name}
          </h1>
          <p className="sr-only">{project.description || 'Structured state repository'}</p>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 text-xs font-semibold',
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
                'h-1.5 w-1.5 rounded-full',
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
      </header>
      <ProjectTabs activeTab={activeTab} outputCount={outputCount} repoPath={repoPath} />
      <main
        className={
          activeTab === 'state' ? 'min-h-0 flex-1 overflow-hidden' : 'min-h-0 flex-1 overflow-auto'
        }
      >
        {children}
      </main>
    </div>
  );
}
