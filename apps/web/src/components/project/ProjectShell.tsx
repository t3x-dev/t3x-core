import { ChevronDown, Globe2, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoIcon } from '@/components/chat/sidebar/LogoIcon';
import { ProjectTabs } from '@/components/project/ProjectTabs';
import { getProjectTabSegment, type ProjectTabId } from '@/components/project/projectTabModel';
import { getProjectIdRepoPath, getProjectRepoPath } from '@/domain/project/repoPath';
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
  branch?: string | null;
  projectIdNavigation?: boolean;
  pullRequestNumber?: number;
  ownerSlug?: string;
  immersive?: boolean;
  children: ReactNode;
  project: ProjectShellProject;
  workspaceId?: string | null;
}

export function ProjectShell({
  activeTab,
  branch,
  children,
  immersive = false,
  project,
  projectIdNavigation = false,
  ownerSlug,
  pullRequestNumber,
  workspaceId,
}: ProjectShellProps) {
  const visibilityLabel =
    project.visibility === 'public'
      ? 'Public'
      : project.visibility === 'unlisted'
        ? 'Unlisted'
        : 'Private';
  const repoPath =
    project.id && (projectIdNavigation || !ownerSlug)
      ? getProjectIdRepoPath(project.id)
      : getProjectRepoPath(project, ownerSlug);
  const returnParams = new URLSearchParams();
  if (activeTab !== 'state' && activeTab !== 'settings') {
    returnParams.set('tab', getProjectTabSegment(activeTab));
  }
  if (branch) returnParams.set('branch', branch);
  if (workspaceId && (activeTab === 'workspaces' || activeTab === 'schemas')) {
    returnParams.set('workspace', workspaceId);
  }
  if (pullRequestNumber && activeTab === 'reviews') {
    returnParams.set('pr', String(pullRequestNumber));
  }
  const returnQuery = returnParams.toString();
  const returnTo = returnQuery ? `${repoPath}?${returnQuery}` : repoPath;
  const settingsHref = project.id
    ? `/project/${encodeURIComponent(project.id)}/settings?returnTo=${encodeURIComponent(returnTo)}`
    : '/settings';
  const ownerLabel = ownerSlug || 'Projects';
  const ownerMark = ownerSlug ? ownerSlug.slice(0, 2).toUpperCase() : 'P';
  const newRepositoryHref = ownerSlug ? `/${encodeURIComponent(ownerSlug)}/new` : '/';
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
              <span className="shrink-0 text-[var(--text-secondary)]">{ownerLabel}</span>
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
              href={newRepositoryHref}
            >
              <Plus aria-hidden="true" className="size-3.5" />
              {ownerSlug ? 'Create new' : 'Browse projects'}
            </Link>
            <span
              aria-label={ownerSlug ? `Owner ${ownerSlug}` : 'Projects'}
              className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--hover-bg-strong)] text-xs font-semibold text-[var(--text-secondary)]"
              role="img"
            >
              {ownerMark.charAt(0)}
            </span>
          </nav>
        </div>
        <ProjectTabs
          activeTab={activeTab}
          branch={branch}
          repoPath={repoPath}
          projectIdNavigation={projectIdNavigation}
          settingsHref={settingsHref}
          stacked
          workspaceId={workspaceId}
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
