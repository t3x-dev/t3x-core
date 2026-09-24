import {
  Bell,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  Database,
  Globe2,
  Plus,
  Search,
} from 'lucide-react';
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
  const composeChrome = activeTab === 'workspaces';

  if (composeChrome) {
    return (
      <div className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-[var(--surface-app)] text-[var(--text-primary)]">
        <header className="flex h-[92px] shrink-0 flex-col border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-5">
          <div className="flex h-[52px] min-w-0 shrink-0 items-center gap-2 whitespace-nowrap">
            <Link
              aria-label="Back to projects"
              className="inline-flex shrink-0 items-center gap-2.5 font-bold text-[15px]"
              href="/"
            >
              <span className="inline-flex size-[26px] [&_svg]:size-[26px]">
                <LogoIcon />
              </span>
              T3X
            </Link>
            <span
              aria-hidden="true"
              className="mx-1 text-[22px] font-extralight text-[var(--text-tertiary)]"
            >
              /
            </span>
            <span className="inline-flex h-8 items-center gap-2 rounded-lg px-1 text-[13px]">
              <span className="grid size-[22px] place-items-center rounded-md bg-[var(--text-primary)] text-[9px] font-bold text-[var(--surface-panel)]">
                TD
              </span>
              {DEFAULT_OWNER_SLUG}
              <ChevronsUpDown aria-hidden="true" className="size-3 text-[var(--text-tertiary)]" />
            </span>
            <span
              aria-hidden="true"
              className="mx-1 text-[22px] font-extralight text-[var(--text-tertiary)]"
            >
              /
            </span>
            <span className="inline-flex h-8 min-w-0 items-center gap-2 rounded-lg px-1 text-[13px]">
              <span className="grid size-[22px] place-items-center rounded-md bg-[var(--accent-conversation-soft)] text-[var(--accent-conversation)]">
                <Database aria-hidden="true" className="size-3" />
              </span>
              <strong className="max-w-52 truncate font-medium">{project.name}</strong>
              <span className="inline-flex h-5 items-center rounded-full bg-[var(--surface-app)] px-2 text-[10px] text-[var(--text-secondary)]">
                {visibilityLabel}
              </span>
              <ChevronsUpDown aria-hidden="true" className="size-3 text-[var(--text-tertiary)]" />
            </span>
            <span className="flex-1" />
            <label className="hidden h-8 w-[280px] items-center gap-2 rounded-lg bg-[var(--surface-app)] px-2.5 text-[12px] text-[var(--text-tertiary)] min-[980px]:flex">
              <Search aria-hidden="true" className="size-3.5" />
              <input
                aria-label="Search repository"
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder="Search…"
                type="search"
              />
              <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-1 text-[9px]">
                ⌘
              </kbd>
              <kbd className="rounded border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-1 text-[9px]">
                K
              </kbd>
            </label>
            <span className="px-2 text-[12px] text-[var(--text-secondary)]">Docs</span>
            <button
              aria-label="Help"
              className="grid size-8 place-items-center text-[var(--text-secondary)]"
              disabled
              title="Help is not available in this local preview"
              type="button"
            >
              <CircleHelp aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label="Notifications"
              className="relative grid size-8 place-items-center text-[var(--text-secondary)]"
              disabled
              title="Notifications are not available in this local preview"
              type="button"
            >
              <Bell aria-hidden="true" className="size-4" />
              <span className="absolute right-[7px] top-[7px] size-1.5 rounded-full bg-[var(--accent-commit)] ring-2 ring-[var(--surface-panel)]" />
            </button>
            <span
              aria-label="Current user"
              className="ml-1 grid size-[30px] place-items-center rounded-full bg-[var(--text-primary)] text-[10px] font-semibold text-[var(--surface-panel)]"
              role="img"
            >
              {DEFAULT_OWNER_SLUG.charAt(0).toUpperCase()}
            </span>
          </div>
          <ProjectTabs
            activeTab={activeTab}
            composeChrome
            repoPath={repoPath}
            projectIdNavigation={projectIdNavigation}
            settingsHref={settingsHref}
            stacked
          />
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }

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
