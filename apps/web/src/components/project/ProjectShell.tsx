'use client';

import type { RepositoryProfile } from '@t3x-dev/api-client';
import { type ReactNode, useEffect } from 'react';
import { getProjectTabLabel, type ProjectTabId } from '@/components/project/projectTabModel';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import type { YSchemaValidationSummary } from '@/domain/project/yschemaValidation';
import { rememberRepositorySettingsReturn } from '@/utils/repositorySettingsReturn';
import workbench from './RepositoryWorkbench.module.css';
import { repositoryWorkbenchTracks } from './repositoryWorkbenchLayout';

export interface ProjectShellProject {
  id?: string;
  name: string;
  namespace?: string | null;
  canonical_path?: string | null;
  path_status?: 'ready' | 'pending_migration';
  description?: string;
  status?: 'draft' | 'active' | 'paused';
  drafts?: number;
  commitsCount?: number;
  branchesCount?: number;
  outputsCount?: number;
  visibility?: 'private' | 'unlisted' | 'public';
  repositoryProfile?: RepositoryProfile;
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
  pageTitle?: string | null;
}

export function ProjectShell({
  activeTab,
  branch,
  children,
  immersive = false,
  project,
  ownerSlug,
  pullRequestNumber,
  workspaceId,
  pageTitle,
}: ProjectShellProps) {
  const visibilityLabel =
    project.visibility === 'public'
      ? 'Public'
      : project.visibility === 'unlisted'
        ? 'Unlisted'
        : 'Private';
  const repoPath = getProjectRepoPath(project);
  const idNavigation = !project.canonical_path;
  const settingsHref = `${repoPath}/settings`;
  const actualOwner = project.namespace ?? ownerSlug;
  const repositoryName = actualOwner ? `${actualOwner}/${project.name}` : project.name;
  const sectionTitle =
    pageTitle ??
    (activeTab === 'reviews' &&
    pullRequestNumber &&
    Number.isSafeInteger(pullRequestNumber) &&
    pullRequestNumber > 0
      ? `Pull request #${pullRequestNumber}`
      : getProjectTabLabel(activeTab));
  const description = typeof project.description === 'string' ? project.description.trim() : '';
  let title = `${repositoryName} · T3X`;
  if (activeTab !== 'state' || pageTitle) title = `${sectionTitle} · ${title}`;
  else if (description) title = `${repositoryName}: ${description}`;
  useEffect(() => {
    if (pageTitle === null) return;
    // The repository identity is resolved by the client route after access checks.
    const previousTitle = document.title;
    document.title = title;
    return () => {
      if (document.title === title) document.title = previousTitle;
    };
  }, [pageTitle, title]);

  const newRepositoryHref = actualOwner ? `/${encodeURIComponent(actualOwner)}/new` : '/';
  return (
    <div
      className={`${workbench.shell} flex h-dvh min-h-[680px] flex-col overflow-hidden bg-[var(--surface-app)] text-[var(--text-primary)] [--text-base:14px] [--text-lg:16px] [--text-sm:13px] [--text-xs:12px]`}
      style={repositoryWorkbenchTracks}
    >
      <DiscoverHeader
        activeTab={activeTab === 'history' ? 'state' : activeTab}
        owner={actualOwner || undefined}
        projectName={project.name}
        projectIdentity={{ id: project.id ?? repoPath, icon: project.repositoryProfile?.icon }}
        newProjectHref={newRepositoryHref}
        repoPath={repoPath}
        settingsHref={settingsHref}
        onSettingsNavigate={() => {
          if (project.id) rememberRepositorySettingsReturn(project.id, settingsHref);
        }}
        projectIdNavigation={idNavigation}
        branch={branch}
        workspaceId={workspaceId}
        visibility={visibilityLabel}
      />
      {project.path_status === 'pending_migration' && (
        <output className="px-4 py-2 text-sm text-[var(--status-warning)]">
          This repository needs a name or namespace migration. Its Project ID address remains
          available.
        </output>
      )}
      <main
        className={
          immersive ||
          activeTab === 'state' ||
          activeTab === 'workspaces' ||
          activeTab === 'history'
            ? 'relative min-h-0 flex-1 overflow-hidden'
            : activeTab === 'reviews' ||
                activeTab === 'checks' ||
                activeTab === 'community' ||
                activeTab === 'settings'
              ? 'relative min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable_both-edges] bg-[var(--surface-card)]'
              : 'relative min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable_both-edges]'
        }
      >
        {children}
      </main>
    </div>
  );
}
