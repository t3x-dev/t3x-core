import { ChevronDown, Globe2, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoIcon } from '@/components/chat/sidebar/LogoIcon';
import { ProjectTabs } from '@/components/project/ProjectTabs';
import type { ProjectTabId } from '@/components/project/projectTabModel';
import {
  DEFAULT_OWNER_SLUG,
  getProjectIdRepoPath,
  getProjectRepoPath,
} from '@/domain/project/repoPath';
import type { YSchemaValidationSummary } from '@/domain/project/yschemaValidation';

export interface ProjectShellProject {
  id?: string;
  name: string;
  description?: string;
  status?: 'draft' | 'active' | 'paused';
  drafts?: number;
  commitsCount?: number;
  branchesCount?: number;
  outputsCount?: number;
  visibility?: 'private' | 'unlisted' | 'public';
  yschemaValidation?: YSchemaValidationSummary | null;
}

export interface ProjectShellProps {
  activeTab: ProjectTabId;
  projectIdNavigation?: boolean;
  immersive?: boolean;
  children: ReactNode;
  project: ProjectShellProject;
}

export function ProjectShell({
  activeTab,
  children,
  immersive = false,
  project,
  projectIdNavigation = false,
}: ProjectShellProps) {
  const visibilityLabel =
    project.visibility === 'public'
      ? 'Public'
      : project.visibility === 'unlisted'
        ? 'Unlisted'
        : 'Private';
  const repoPath =
    projectIdNavigation && project.id
      ? getProjectIdRepoPath(project.id)
      : getProjectRepoPath(project);
  const settingsHref = project.id
    ? `/settings?project=${encodeURIComponent(project.id)}`
    : '/settings';

  return (
    <div className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-[var(--surface-app)] text-[var(--text-primary)] [--text-base:14px] [--text-lg:16px] [--text-sm:13px] [--text-xs:12px]">
      <header className="flex h-24 shrink-0 flex-col border-b border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-3">
        <div className="flex h-14 min-w-0 shrink-0 items-center justify-between gap-6 px-1">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              aria-label="Back to projects"
              className="inline-flex h-8 shrink-0 items-center text-xl font-extrabold leading-none tracking-normal text-[var(--text-primary)] focus-visible:rounded-[var(--radius-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
              href="/"
            >
              T3X
            </Link>
            <span aria-hidden="true" className="inline-flex size-8 shrink-0 [&_svg]:size-8">
              <LogoIcon />
            </span>
            <div className="flex min-w-0 items-center gap-1 text-[13px] leading-5">
              <span className="shrink-0 text-[var(--text-secondary)]">{DEFAULT_OWNER_SLUG}</span>
              <span aria-hidden="true" className="text-[var(--text-tertiary)]">
                /
              </span>
              <h1
                title={project.name}
                className="min-w-0 truncate font-semibold text-[var(--text-primary)]"
              >
                {project.name}
              </h1>
              <ChevronDown
                aria-hidden="true"
                className="size-3.5 shrink-0 text-[var(--accent-commit)]"
              />
            </div>
            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--accent-commit)]/15 bg-[var(--accent-commit-soft)] px-2 text-[11px] font-medium text-[var(--accent-commit)]">
              <Globe2 aria-hidden="true" className="size-3" />
              {visibilityLabel}
            </span>
            <p className="sr-only">{project.description || 'Structured state repository'}</p>
          </div>

          <nav aria-label="Global" className="hidden shrink-0 items-center gap-5 min-[760px]:flex">
            <Link
              className="text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
              href="/templates"
            >
              Explore
            </Link>
            <Link
              className="text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
              href="/"
            >
              Your projects
            </Link>
            <Link
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[5px] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-xs font-medium text-[var(--text-primary)] shadow-[var(--fx-shadow-sm)] transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
              href="/"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Create new
            </Link>
            <span
              aria-label="Current user"
              className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--hover-bg-strong)] text-xs font-semibold text-[var(--text-secondary)]"
              role="img"
            >
              {DEFAULT_OWNER_SLUG.charAt(0).toUpperCase()}
            </span>
          </nav>
        </div>
        <ProjectTabs
          activeTab={activeTab}
          repoPath={repoPath}
          projectIdNavigation={projectIdNavigation}
          settingsHref={settingsHref}
          stacked
        />
      </header>
      <main
        className={
          immersive || activeTab === 'state' || activeTab === 'workspaces'
            ? 'min-h-0 flex-1 overflow-hidden'
            : 'min-h-0 flex-1 overflow-auto'
        }
      >
        {children}
      </main>
    </div>
  );
}
