'use client';

import { ArrowLeft, Bot, Eye, GitBranch, Loader2, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { lazy, Suspense, useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/layout/ApiStatus';
import { AgentAccessLink } from '@/components/project/agent-access/AgentAccessLink';
import { DeferredSettingsSection } from '@/components/project/settings/DeferredSettingsSection';
import { ProjectDangerZone } from '@/components/project/settings/ProjectDangerZone';
import { ProjectExportSettings } from '@/components/project/settings/ProjectExportSettings';
import { ProjectGeneralSettings } from '@/components/project/settings/ProjectGeneralSettings';
import generalStyles from '@/components/project/settings/ProjectGeneralSettings.module.css';
import { ProjectIntegritySettings } from '@/components/project/settings/ProjectIntegritySettings';
import { ProjectSettingsNav } from '@/components/project/settings/ProjectSettingsNav';
import { RepositoryIconSettings } from '@/components/project/settings/RepositoryIconSettings';
import { SettingsSection } from '@/components/project/settings/SettingsSection';
import {
  getCanonicalRepositoryPath,
  getDeletedRepositoriesPath,
  getProjectIdRepoPath,
  repositoryAgentAccessHref,
  repositoryBranchHref,
} from '@/domain/project/repoPath';
import { useRepositoryRouteParams as useParams } from '@/hooks/projects/repositoryRouteContext';
import { projectDescription, useProjectSettings } from '@/hooks/projects/useProjectSettings';
import { useRepositoryProfile } from '@/hooks/projects/useRepositoryProfile';
import { useProjectStore } from '@/store/projectStore';
import palette from '@/styles/management-palette.module.css';
import { ensureSettingsNavigationTiming, markNavigationTiming } from '@/utils/navigationTiming';
import { readRepositorySettingsReturn } from '@/utils/repositorySettingsReturn';

if (typeof window !== 'undefined') performance.mark?.('t3x:settings:module');

const AgentAccessDemo = lazy(() =>
  import('@/components/project/agent-access/AgentAccessDemo').then((m) => ({
    default: m.AgentAccessDemo,
  }))
);

const ProjectVisibilitySettings = lazy(() =>
  import('@/components/project/ProjectVisibilitySettings').then((m) => ({
    default: m.ProjectVisibilitySettings,
  }))
);
const ProjectCollaborationPanel = lazy(() =>
  import('@/components/project/ProjectCollaborationPanel').then((m) => ({
    default: m.ProjectCollaborationPanel,
  }))
);
const ProjectBranchRulesSettings = lazy(() =>
  import('@/components/project/settings/ProjectBranchRulesSettings').then((m) => ({
    default: m.ProjectBranchRulesSettings,
  }))
);
const ProjectAiSettings = lazy(() =>
  import('@/components/project/settings/ProjectAiSettings').then((m) => ({
    default: m.ProjectAiSettings,
  }))
);
const AutopilotSettings = lazy(() =>
  import('@/components/autopilot/AutopilotSettings').then((m) => ({ default: m.AutopilotSettings }))
);

export default function ProjectSettingsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectSettingsPageContent />
    </Suspense>
  );
}

function ProjectSettingsPageContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const idPath = getProjectIdRepoPath(projectId);
  const repositoryPath = getCanonicalRepositoryPath(pathname) ?? idPath;
  const settings = useProjectSettings(projectId);
  // Resolve an ID bookmark before validating its legacy source against the repository address.
  const awaitingAddress =
    repositoryPath === idPath &&
    (settings.project?.project_id !== projectId || Boolean(settings.project.canonical_path));
  const [returnSource, setReturnSource] = useState<{ projectId: string; href: string }>();
  const source = returnSource?.projectId === projectId ? returnSource.href : '';
  const returnHref = source && source !== idPath ? source : repositoryPath;
  useEffect(() => {
    if (awaitingAddress) return;
    const restore = () => {
      const current = window.location;
      if (current.pathname !== pathname || new URLSearchParams(current.search).toString() !== query)
        return;
      setReturnSource({ projectId, href: readRepositorySettingsReturn(projectId) });
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [awaitingAddress, pathname, projectId, query]);
  const saveRepositoryProfile = useRepositoryProfile(projectId);
  const repositoryProfile = useProjectStore((state) => state.details[projectId]?.repositoryProfile);
  const handleDelete = async () => {
    await settings.remove();
    router.push(getDeletedRepositoriesPath(settings.project?.namespace));
  };

  const project = settings.project;
  useEffect(() => {
    ensureSettingsNavigationTiming();
    markNavigationTiming('settings', 'shell');
  }, []);
  useEffect(() => {
    if (!project) return;
    markNavigationTiming('settings', 'data');
    const frame = requestAnimationFrame(() => markNavigationTiming('settings', 'ready'));
    return () => cancelAnimationFrame(frame);
  }, [project]);

  if (process.env.NODE_ENV === 'development' && searchParams.get('view') === 'agent-access') {
    if (settings.loading) return <LoadingSpinner message="Loading repository access…" />;
    if (project?.can_edit !== true) {
      return (
        <div className="mx-auto grid max-w-lg gap-3 p-8 text-sm">
          <h1 className="text-lg font-semibold">Agent access unavailable</h1>
          <p>{settings.error ?? 'Opening Agent access requires edit access to this repository.'}</p>
          <Link className="underline" href={repositoryPath}>
            Back to repository
          </Link>
        </div>
      );
    }
    const branch = searchParams.get('targetBranch')?.trim() || 'main';
    return (
      <AgentAccessDemo
        key={`${projectId}:${branch}`}
        repository={project.namespace ? `${project.namespace}/${project.name}` : project.name}
        branch={branch}
        backHref={repositoryBranchHref(repositoryPath, '', branch)}
      />
    );
  }

  return (
    <div className={`${palette.scope} ${generalStyles.layout}`}>
      <aside className={generalStyles.sidebar}>
        <ProjectSettingsNav />
      </aside>

      <div className={generalStyles.content}>
        <header className={generalStyles.pageHeading}>
          <Link
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:underline"
            href={returnHref}
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            {returnHref === repositoryPath ? 'Back to repository' : 'Back to previous page'}
          </Link>
          {project ? (
            <span className={generalStyles.scope}>
              {project.namespace ? `${project.namespace} / ` : ''}
              {project.name}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1>Repository settings</h1>
            {project?.can_edit && (
              <AgentAccessLink href={repositoryAgentAccessHref(repositoryPath)} />
            )}
          </div>
          <p>Manage details, access, and defaults for this repository.</p>
        </header>
        {settings.loading ? (
          <output className="flex min-h-32 items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading General settings…
          </output>
        ) : !project ? (
          <p
            className="rounded-xl border border-[var(--status-error)]/25 bg-[var(--surface-elevated)] p-5 text-[13px] text-[var(--status-error)]"
            role="alert"
          >
            {settings.error ?? 'Repository not found.'}
          </p>
        ) : (
          <>
            <ProjectGeneralSettings
              key={`${project.name}:${projectDescription(project)}`}
              onSave={settings.saveGeneral}
              project={project}
              hasStats={settings.hasStats}
              onLoadStats={settings.loadStats}
              statsError={settings.statsError}
              statsLoading={settings.statsLoading}
            />
            <RepositoryIconSettings
              key={projectId}
              projectId={projectId}
              name={project.name}
              icon={(repositoryProfile ?? project.repository_profile)?.icon}
              canEdit={project.can_edit === true}
              onSave={(icon) => saveRepositoryProfile({ icon })}
            />
          </>
        )}

        {project ? (
          <>
            <DeferredSettingsSection id="visibility" icon={Eye} title="Visibility">
              <ProjectVisibilitySettings projectId={projectId} />
            </DeferredSettingsSection>
            <DeferredSettingsSection id="access" icon={Users} title="Access">
              <ProjectCollaborationPanel projectId={projectId} />
            </DeferredSettingsSection>
            <DeferredSettingsSection id="branch-rules" icon={GitBranch} title="Branch rules">
              <ProjectBranchRulesSettings projectId={projectId} />
            </DeferredSettingsSection>
            <DeferredSettingsSection id="ai" icon={Sparkles} title="AI defaults">
              <ProjectAiSettings
                key={projectId}
                projectId={projectId}
                project={project}
                projectLoading={settings.loading}
              />
            </DeferredSettingsSection>

            <DeferredSettingsSection id="autopilot" icon={Bot} title="Autopilot">
              <SettingsSection
                description="Review extraction threshold suggestions for this project."
                icon={Bot}
                id="autopilot"
                title="Autopilot"
              >
                <AutopilotSettings projectId={projectId} />
              </SettingsSection>
            </DeferredSettingsSection>

            <ProjectIntegritySettings onVerify={settings.verify} />

            <ProjectExportSettings
              onExport={settings.exportArchive}
              projectId={projectId}
              projectName={project.name}
            />
            <ProjectDangerZone onDelete={handleDelete} project={project} />
          </>
        ) : null}
      </div>
    </div>
  );
}
