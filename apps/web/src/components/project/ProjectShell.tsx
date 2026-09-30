import type { ReactNode } from 'react';
import { getProjectTabSegment, type ProjectTabId } from '@/components/project/projectTabModel';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
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
  const newRepositoryHref = ownerSlug ? `/${encodeURIComponent(ownerSlug)}/new` : '/';
  return (
    <div className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-[var(--surface-app)] text-[var(--text-primary)] [--text-base:14px] [--text-lg:16px] [--text-sm:13px] [--text-xs:12px]">
      <DiscoverHeader
        activeTab={activeTab}
        owner={ownerLabel}
        projectName={project.name}
        newProjectHref={newRepositoryHref}
        repoPath={repoPath}
        settingsHref={settingsHref}
        projectIdNavigation={projectIdNavigation}
        branch={branch}
        workspaceId={workspaceId}
        visibility={visibilityLabel}
      />
      <main
        className={
          immersive || activeTab === 'state' || activeTab === 'workspaces'
            ? 'relative min-h-0 flex-1 overflow-hidden'
            : activeTab === 'reviews' || activeTab === 'community' || activeTab === 'settings'
              ? 'relative min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable_both-edges] bg-white'
              : 'relative min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable_both-edges]'
        }
      >
        {children}
      </main>
    </div>
  );
}
