'use client';

import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FolderGit2,
  LayoutTemplate,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DEFAULT_PROJECT_NAME } from '@/domain/project/defaults';
import {
  DEFAULT_OWNER_SLUG,
  getProjectIdRepoPath,
  getProjectRepoPath,
} from '@/domain/project/repoPath';
import { useProjects } from '@/hooks/projects/useProjects';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';
import { cn } from '@/utils/cn';
import {
  orderProjectsByRecentOpen,
  readRecentProjectIds,
  recordRecentProjectOpen,
} from '@/utils/recentProjects';
import styles from './ProjectDirectoryPage.module.css';

const repoTones = [
  'bg-[var(--status-info)]',
  'bg-[var(--accent-branch)]',
  'bg-[var(--status-success)]',
  'bg-[var(--accent-pending)]',
  'bg-[var(--accent-conversation)]',
];

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50';

function metricValue(value: number | undefined): number {
  return value ?? 0;
}

function RepoMark({ name, size = 'card' }: { name: string; size?: 'card' | 'row' }) {
  const hash = Array.from(name).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center text-[var(--on-status)] shadow-sm',
        size === 'card' ? 'size-10 rounded-lg' : 'size-8 rounded-md',
        repoTones[hash % repoTones.length]
      )}
    >
      <FolderGit2 className={size === 'card' ? 'size-5' : 'size-4'} strokeWidth={1.8} />
    </span>
  );
}

function ProjectMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'source' | 'schema' | 'state';
}) {
  const toneVar = {
    source: 'var(--source)',
    schema: 'var(--accent-extract)',
    state: 'var(--accent-commit)',
  }[tone];

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ backgroundColor: toneVar }}
      />
      <span className="truncate">
        {label} {value}
      </span>
    </span>
  );
}

function ProjectMetrics({ project }: { project: ProjectSummary }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1.5">
      <ProjectMetric label="Commits" value={metricValue(project.commitsCount)} tone="state" />
      <ProjectMetric label="Branches" value={metricValue(project.branchesCount)} tone="schema" />
    </div>
  );
}

function ProjectActions({
  onDelete,
  onRename,
  project,
}: {
  onDelete: (project: ProjectSummary) => void;
  onRename: (project: ProjectSummary) => void;
  project: ProjectSummary;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
      <Button
        aria-label={`Rename repository ${project.name}`}
        className="size-7"
        onClick={() => onRename(project)}
        size="icon-sm"
        type="button"
        variant="canvas-ghost"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        aria-label={`Delete repository ${project.name}`}
        className="size-7 text-[var(--status-error)] hover:bg-[var(--status-error)]/10 hover:text-[var(--status-error)]"
        onClick={() => onDelete(project)}
        size="icon-sm"
        type="button"
        variant="canvas-ghost"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function PinnedProjectCard({
  onDelete,
  onRename,
  ownerSlug,
  project,
}: {
  onDelete: (project: ProjectSummary) => void;
  onRename: (project: ProjectSummary) => void;
  ownerSlug: string;
  project: ProjectSummary;
}) {
  return (
    <article
      className={cn(
        'group flex min-h-[132px] min-w-0 flex-col gap-3.5 rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-elevated)] p-4 shadow-[var(--fx-shadow-sm)]',
        'transition-[border-color,box-shadow] duration-150',
        'hover:border-[var(--accent-commit)]/35 hover:shadow-[0_2px_5px_rgb(37_99_235/8%)]'
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <RepoMark name={project.name} />
        <Link
          href={getProjectIdRepoPath(project.id)}
          onClick={() => recordRecentProjectOpen(project.id)}
          className={cn('min-w-0 flex-1 rounded-[var(--radius-md)] pt-0.5', focusRing)}
        >
          <h3 className="truncate text-[15px] font-bold leading-[19px] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-commit)]">
            {project.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-[var(--text-secondary)]">
            {project.description || 'Structured state repository.'}
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <ProjectActions onDelete={onDelete} onRename={onRename} project={project} />
          <ArrowRight aria-hidden="true" className="size-4 text-[var(--accent-commit)]" />
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 pl-[52px]">
        <ProjectMetrics project={project} />
        <span className="truncate font-mono text-xs text-[var(--text-tertiary)]">
          {getProjectRepoPath(project, ownerSlug)}
        </span>
      </div>
    </article>
  );
}

function ProjectRow({
  onDelete,
  onRename,
  ownerSlug,
  project,
}: {
  onDelete: (project: ProjectSummary) => void;
  onRename: (project: ProjectSummary) => void;
  ownerSlug: string;
  project: ProjectSummary;
}) {
  return (
    <article className="group flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--hover-bg)]">
      <RepoMark name={project.name} size="row" />
      <Link
        href={getProjectIdRepoPath(project.id)}
        onClick={() => recordRecentProjectOpen(project.id)}
        className={cn('min-w-0 flex-1 rounded-[var(--radius-md)]', focusRing)}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-commit)]">
            {project.name}
          </h3>
          <span className="hidden truncate font-mono text-xs text-[var(--text-tertiary)] sm:inline">
            {getProjectRepoPath(project, ownerSlug)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
          {project.description || 'Structured state repository.'}
        </p>
      </Link>
      <div className="hidden shrink-0 lg:block">
        <ProjectMetrics project={project} />
      </div>
      <span className="hidden w-32 shrink-0 text-right text-xs text-[var(--text-tertiary)] md:block">
        Updated {project.updatedAt}
      </span>
      <ProjectActions onDelete={onDelete} onRename={onRename} project={project} />
    </article>
  );
}

function DirectorySideRail({
  dataAvailable,
  isPersonalNamespace,
  ownerSlug,
  projects,
}: {
  dataAvailable: boolean;
  isPersonalNamespace: boolean;
  ownerSlug: string;
  projects: ProjectSummary[];
}) {
  const commits = projects.reduce((sum, project) => sum + metricValue(project.commitsCount), 0);
  const drafts = projects.filter((project) => project.status === 'draft').length;
  const recent = projects[0];
  const avatarLabel =
    ownerSlug
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 2)
      .toUpperCase() || 'T3';
  const sectionTitle = 'mb-3 text-[15px] font-bold leading-[21px] text-[var(--text-primary)]';

  return (
    <aside
      aria-label="Namespace overview"
      className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-4 py-5 md:w-[280px] md:overflow-y-auto md:border-r md:border-b-0"
    >
      <section className="px-1">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[var(--text-primary)] text-base font-bold text-[var(--surface-card)] shadow-sm">
            {avatarLabel}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold leading-6 text-[var(--text-primary)]">
              {ownerSlug}
            </h1>
            <span className="text-xs font-medium text-[var(--text-tertiary)]">
              {isPersonalNamespace ? 'Personal namespace' : 'Organization namespace'}
            </span>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-[18px] text-[var(--text-secondary)]">
          {isPersonalNamespace
            ? 'Personal namespace for structured state repositories.'
            : 'Organization namespace for structured state repositories.'}
        </p>
      </section>

      <div className="mt-5 flex min-h-[41px] items-center justify-between rounded-lg bg-[var(--accent-commit-soft)] px-3 py-2.5">
        <strong className="text-[15px] font-bold text-[var(--text-primary)]">Repositories</strong>
        <span className="text-sm font-medium text-[var(--accent-commit)]">
          {dataAvailable ? projects.length : '\u2014'} repos
        </span>
      </div>

      <section className="mt-6 px-1">
        <h2 className={sectionTitle}>Repositories at a glance</h2>
        {dataAvailable ? (
          <div className="flex flex-col gap-2.5">
            <ProjectMetric label="Repositories" value={projects.length} tone="state" />
            <ProjectMetric label="Without commits" value={drafts} tone="schema" />
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              {commits} commits
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-[13px] leading-[18px] text-[var(--text-secondary)]">
            <p>Repository data is unavailable.</p>
            <span className="text-xs font-medium">{'\u2014'} commits</span>
          </div>
        )}
      </section>

      <section className="mt-7 border-t border-[var(--stroke-divider)] px-1 pt-6">
        <h2 className={sectionTitle}>Recently created</h2>
        {dataAvailable && recent ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <RepoMark name={recent.name} size="row" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                {recent.name}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">Created {recent.updatedAt}</p>
            </div>
          </div>
        ) : (
          <p className="text-[13px] leading-[18px] text-[var(--text-secondary)]">
            {dataAvailable
              ? 'No repositories yet.'
              : 'Retry loading repositories to see recent creations.'}
          </p>
        )}
      </section>
    </aside>
  );
}

function DirectoryLoadFailure({
  error,
  onRetry,
  retrying,
}: {
  error: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-[var(--status-error)]/25 bg-[var(--surface-elevated)] p-8 text-center"
      role="alert"
    >
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
        Couldn&apos;t load repositories
      </h2>
      <p className="mt-2 max-w-[520px] text-[13px] leading-normal text-[var(--text-secondary)]">
        {error}
      </p>
      <Button
        className="mt-5"
        disabled={retrying}
        onClick={onRetry}
        type="button"
        variant="outline"
      >
        <RefreshCw className={cn('size-4', retrying && 'animate-spin')} />
        {retrying ? 'Retrying...' : 'Retry'}
      </Button>
    </div>
  );
}

function EmptyDirectory({ newRepositoryPath }: { newRepositoryPath: string }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg border border-[var(--accent-commit)]/20 bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]">
        <LayoutTemplate className="size-5" />
      </div>
      <h2 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">No repositories yet</h2>
      <p className="mt-2 max-w-[420px] text-[13px] leading-normal text-[var(--text-secondary)]">
        Create a repository, shape your YAML or JSON in a Workspace, then review, commit, and export
        it.
      </p>
      <Button asChild className="mt-5" variant="commit">
        <Link href={newRepositoryPath}>
          <Plus className="size-4" /> New repository
        </Link>
      </Button>
    </div>
  );
}

function SectionHeading({ count, title }: { count?: string; title: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-6">
      <h2 className="text-[22px] font-bold leading-7 tracking-[-0.02em] text-[var(--text-primary)]">
        {title}
      </h2>
      {count && (
        <span className="mb-0.5 text-sm font-medium text-[var(--accent-commit)]">{count}</span>
      )}
    </div>
  );
}

export function ProjectDirectoryPage({ ownerSlug = DEFAULT_OWNER_SLUG }: { ownerSlug?: string }) {
  const projectStoreRemove = useProjectStore((state) => state.removeProject);
  const projectStoreUpdate = useProjectStore((state) => state.updateProject);
  const {
    error,
    loading,
    projects,
    refresh: refreshProjects,
    remove: removeProject,
    rename: renameProject,
  } = useProjects(50, ownerSlug);
  const [query, setQuery] = useState('');
  const [repositoriesExpanded, setRepositoriesExpanded] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recentProjectIds] = useState(() => readRecentProjectIds());
  const isPersonalNamespace = ownerSlug !== DEFAULT_OWNER_SLUG;
  const newRepositoryPath = `/${ownerSlug}/new`;

  const projectSummaries = useMemo(() => projects.map(apiProjectToSummary), [projects]);

  const handleRefreshProjects = useCallback(async () => {
    await refreshProjects();
  }, [refreshProjects]);

  const openRenameDialog = useCallback((project: ProjectSummary) => {
    setRenameTarget(project);
    setRenameValue(project.name);
    setRenameError(null);
  }, []);

  const handleRenameDialogOpenChange = useCallback(
    (open: boolean) => {
      if (renaming) return;
      if (!open) {
        setRenameTarget(null);
        setRenameValue('');
        setRenameError(null);
      }
    },
    [renaming]
  );

  const handleRenameProject = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (!renameTarget || renaming) return;
      const nextName = renameValue.trim();
      if (!nextName) {
        setRenameError('Name is required');
        return;
      }
      if (nextName === renameTarget.name.trim()) {
        handleRenameDialogOpenChange(false);
        return;
      }

      setRenaming(true);
      setRenameError(null);
      try {
        const project = await renameProject(renameTarget.id, nextName);
        projectStoreUpdate(renameTarget.id, { name: project.name ?? nextName });
        setRenameTarget(null);
        setRenameValue('');
      } catch {
        setRenameError('Failed to rename repository');
      } finally {
        setRenaming(false);
      }
    },
    [
      handleRenameDialogOpenChange,
      projectStoreUpdate,
      renameProject,
      renameTarget,
      renameValue,
      renaming,
    ]
  );

  const handleConfirmDeleteProject = useCallback(async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await removeProject(deleteTarget.id);
      projectStoreRemove(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, projectStoreRemove, removeProject]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projectSummaries;
    return projectSummaries.filter((project) => {
      const text = `${project.name} ${project.description} ${project.status}`.toLowerCase();
      return text.includes(normalized);
    });
  }, [projectSummaries, query]);
  const recentProjects = useMemo(
    () => orderProjectsByRecentOpen(filteredProjects, recentProjectIds).slice(0, 2),
    [filteredProjects, recentProjectIds]
  );
  const pinnedProjects = recentProjects.length > 0 ? recentProjects : filteredProjects.slice(0, 2);
  const hasLoadedProjects = projectSummaries.length > 0;
  const dataAvailable = hasLoadedProjects || (!loading && !error);

  return (
    <div className={styles.page}>
      <DiscoverHeader
        owner={ownerSlug}
        namespaceTab="repositories"
        settingsHref={`/settings/provider-credentials?owner=${encodeURIComponent(ownerSlug)}`}
        newProjectHref={newRepositoryPath}
        visibility={isPersonalNamespace ? 'Personal' : 'Organization'}
      />

      <div className={styles.columns}>
        <DirectorySideRail
          dataAvailable={dataAvailable}
          isPersonalNamespace={isPersonalNamespace}
          ownerSlug={ownerSlug}
          projects={projectSummaries}
        />

        <main className={styles.main}>
          <div className={styles.toolbar}>
            <Button
              aria-label="Refresh repositories"
              disabled={loading}
              onClick={handleRefreshProjects}
              size="icon"
              variant="canvas-outline"
            >
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            </Button>
            <label className="relative min-w-[220px] max-w-[800px] flex-1">
              <span className="sr-only">Find a repository</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text-primary)]"
                strokeWidth={2.5}
              />
              <input
                className="h-[45px] w-full rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-elevated)] pl-11 pr-4 text-[15px] text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-commit)]/40 focus:ring-1 focus:ring-[var(--accent-commit)]/40"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setRepositoriesExpanded(false);
                }}
                placeholder="Find a repository..."
                value={query}
              />
            </label>
            <Button asChild variant="commit">
              <Link href={newRepositoryPath}>
                <Plus className="size-4" /> New repository
              </Link>
            </Button>
          </div>

          {error && hasLoadedProjects && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--status-error)]/25 bg-[var(--status-error)]/5 px-4 py-3 text-[13px] font-medium text-[var(--status-error)]"
              role="alert"
            >
              <span>Couldn&apos;t refresh repositories. Showing the last loaded data.</span>
              <Button
                disabled={loading}
                onClick={handleRefreshProjects}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                Retry
              </Button>
            </div>
          )}

          {loading && projectSummaries.length === 0 ? (
            <output className="flex min-h-[70px] items-center text-sm text-[var(--text-secondary)]">
              Loading repositories...
            </output>
          ) : error && projectSummaries.length === 0 ? (
            <DirectoryLoadFailure
              error={error}
              onRetry={handleRefreshProjects}
              retrying={loading}
            />
          ) : projectSummaries.length === 0 ? (
            <EmptyDirectory newRepositoryPath={newRepositoryPath} />
          ) : (
            <>
              {pinnedProjects.length > 0 && (
                <section>
                  <SectionHeading
                    count={`${isPersonalNamespace ? 'Personal' : 'Organization'} repositories with shareable paths`}
                    title="Pinned repositories"
                  />
                  <div className="grid gap-5 min-[1200px]:grid-cols-2">
                    {pinnedProjects.map((project) => (
                      <PinnedProjectCard
                        key={project.id}
                        onDelete={setDeleteTarget}
                        onRename={openRenameDialog}
                        ownerSlug={ownerSlug}
                        project={project}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <SectionHeading count={`${filteredProjects.length} repos`} title="Repositories" />
                <div className={styles.repositories} id="repository-list">
                  {filteredProjects.length > 0 ? (
                    <div className="divide-y divide-[var(--stroke-divider)]">
                      {(repositoriesExpanded ? filteredProjects : filteredProjects.slice(0, 6)).map(
                        (project) => (
                          <ProjectRow
                            key={project.id}
                            onDelete={setDeleteTarget}
                            onRename={openRenameDialog}
                            ownerSlug={ownerSlug}
                            project={project}
                          />
                        )
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4 p-5 text-[13px] text-[var(--text-secondary)]">
                      <span>No repositories match this filter.</span>
                      <Button onClick={() => setQuery('')} type="button" variant="canvas-outline">
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
                {filteredProjects.length > 6 ? (
                  <button
                    className={styles.expand}
                    aria-expanded={repositoriesExpanded}
                    aria-controls="repository-list"
                    onClick={() => setRepositoriesExpanded((value) => !value)}
                    type="button"
                  >
                    {repositoriesExpanded ? (
                      <ChevronUp aria-hidden="true" />
                    ) : (
                      <ChevronDown aria-hidden="true" />
                    )}
                    {repositoriesExpanded
                      ? 'Show less'
                      : `Show all ${filteredProjects.length} repositories`}
                  </button>
                ) : null}
              </section>
            </>
          )}
        </main>
      </div>

      <Dialog open={Boolean(renameTarget)} onOpenChange={handleRenameDialogOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <form className="grid gap-4" onSubmit={handleRenameProject}>
            <DialogHeader>
              <DialogTitle>Rename Repository</DialogTitle>
              <DialogDescription>Rename this structured state repository.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[var(--text-primary)]"
                htmlFor="directory-rename-project-name"
              >
                Repository name
              </label>
              <Input
                aria-describedby={renameError ? 'directory-rename-project-error' : undefined}
                aria-invalid={renameError ? 'true' : undefined}
                disabled={renaming}
                id="directory-rename-project-name"
                onChange={(event) => {
                  setRenameValue(event.target.value);
                  if (renameError) setRenameError(null);
                }}
                placeholder={DEFAULT_PROJECT_NAME}
                value={renameValue}
              />
              {renameError && (
                <p
                  className="text-xs text-[var(--status-error)]"
                  id="directory-rename-project-error"
                >
                  {renameError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                disabled={renaming}
                onClick={() => handleRenameDialogOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={renaming || !renameValue.trim()} type="submit" variant="commit">
                {renaming ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Repository</DialogTitle>
            <DialogDescription>
              Delete "{deleteTarget?.name ?? DEFAULT_PROJECT_NAME}" from the backend? This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleting}
              onClick={handleConfirmDeleteProject}
              type="button"
              variant="destructive"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
