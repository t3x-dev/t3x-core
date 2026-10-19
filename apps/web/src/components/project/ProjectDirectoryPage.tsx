'use client';

import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock3,
  FolderGit2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DEFAULT_OWNER_SLUG, getProjectRepoPath } from '@/domain/project/repoPath';
import { useProjects } from '@/hooks/projects/useProjects';
import { repositoryMutationError } from '@/hooks/projects/useDeletedProjects';
import { useRepositoryName } from '@/hooks/projects/useRepositoryName';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';
import { cn } from '@/utils/cn';
import {
  orderProjectsByRecentOpen,
  readRecentProjectIds,
  recordRecentProjectOpen,
} from '@/utils/recentProjects';
import styles from './ProjectDirectoryPage.module.css';
import { DeletedRepositoriesView } from './DeletedRepositoriesView';
import { RepositoryNameFeedback } from './RepositoryNameFeedback';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50';

function metricValue(value: number | undefined): number {
  return value ?? 0;
}

function RepoMark({ size = 'card' }: { size?: 'card' | 'row' }) {
  return (
    <span aria-hidden="true" className={cn(styles.repoMark, size === 'row' && styles.rowMark)}>
      <FolderGit2 className={size === 'card' ? 'size-5' : 'size-4'} strokeWidth={1.8} />
    </span>
  );
}

function ProjectMetrics({ project }: { project: ProjectSummary }) {
  const commits = metricValue(project.commitsCount);
  const branches = metricValue(project.branchesCount);
  return (
    <div className={styles.metrics}>
      <span>
        {commits} {commits === 1 ? 'commit' : 'commits'}
      </span>
      <span>
        {branches} {branches === 1 ? 'branch' : 'branches'}
      </span>
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
    <div className={styles.actions}>
      <Button
        aria-label={`Rename repository ${project.name}`}
        title={`Rename repository ${project.name}`}
        onClick={() => onRename(project)}
        size="icon"
        type="button"
        variant="canvas-ghost"
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        aria-label={`Delete repository ${project.name}`}
        title={`Delete repository ${project.name}`}
        className="hover:bg-[var(--status-error)]/10 hover:text-[var(--status-error)]"
        onClick={() => onDelete(project)}
        size="icon"
        type="button"
        variant="canvas-ghost"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function RecentProjectCard({
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
    <article className={styles.recentCard}>
      <div className={styles.cardTop}>
        <RepoMark />
        <ProjectActions onDelete={onDelete} onRename={onRename} project={project} />
      </div>
      <div className={styles.cardContent}>
        <Link
          href={getProjectRepoPath(project)}
          onClick={() => recordRecentProjectOpen(project.id)}
          className={cn(styles.repositoryLink, focusRing)}
        >
          <h3>{project.name}</h3>
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        <p className={styles.repositoryPath}>{getProjectRepoPath(project, ownerSlug)}</p>
        {project.description && <p className={styles.description}>{project.description}</p>}
      </div>
      <div className={styles.cardFooter}>
        <ProjectMetrics project={project} />
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
    <article className={styles.repositoryRow}>
      <RepoMark size="row" />
      <div className={styles.rowContent}>
        <Link
          href={getProjectRepoPath(project)}
          onClick={() => recordRecentProjectOpen(project.id)}
          className={cn(styles.repositoryLink, focusRing)}
        >
          <h3>{project.name}</h3>
        </Link>
        <p className={styles.repositoryPath}>{getProjectRepoPath(project, ownerSlug)}</p>
        {project.description && <p className={styles.description}>{project.description}</p>}
        <div className={styles.rowMeta}>
          <ProjectMetrics project={project} />
          <span>Created {project.updatedAt}</span>
        </div>
      </div>
      <ProjectActions onDelete={onDelete} onRename={onRename} project={project} />
    </article>
  );
}

function DirectoryIntroduction({
  isPersonalNamespace,
  ownerSlug,
}: {
  isPersonalNamespace: boolean;
  ownerSlug: string;
}) {
  const avatarLabel =
    ownerSlug
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 2)
      .toUpperCase() || 'T3';
  return (
    <header className={styles.introduction}>
      <span className={styles.avatar} aria-hidden="true">
        {avatarLabel}
      </span>
      <div className={styles.introductionCopy}>
        <p className={styles.eyebrow}>
          {isPersonalNamespace ? 'Personal namespace' : 'Organization namespace'}
        </p>
        <h1>{ownerSlug}</h1>
        <p className={styles.introductionDescription}>
          A home for your structured state. Pick up a repository or start something new.
        </p>
      </div>
    </header>
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
    <div className={styles.emptyState} role="alert">
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
        <RefreshCw
          className={cn('size-4', retrying && 'animate-spin motion-reduce:animate-none')}
        />
        {retrying ? 'Retrying...' : 'Retry'}
      </Button>
    </div>
  );
}

function EmptyDirectory({ newRepositoryPath }: { newRepositoryPath: string }) {
  return (
    <div className={styles.emptyState}>
      <RepoMark />
      <h2>No repositories yet</h2>
      <p>
        Give your next project a place to grow. Create a repository, then bring your source material
        into its Workspace.
      </p>
      <Button asChild className="mt-5">
        <Link href={newRepositoryPath} className={styles.primaryLink}>
          <Plus className="size-4" /> New repository
        </Link>
      </Button>
    </div>
  );
}

function SectionHeading({ count, title }: { count?: string; title: string }) {
  return (
    <div className={styles.sectionHeading}>
      <h2>{title}</h2>
      {count && <span>{count}</span>}
    </div>
  );
}

export function ProjectDirectoryPage({ ownerSlug = DEFAULT_OWNER_SLUG }: { ownerSlug?: string }) {
  return (
    <Suspense fallback={null}>
      <ProjectDirectoryContent key={ownerSlug} ownerSlug={ownerSlug} />
    </Suspense>
  );
}

function ProjectDirectoryContent({ ownerSlug }: { ownerSlug: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deletedView = searchParams.get('view') === 'deleted';
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pageRef.current) pageRef.current.scrollTop = 0;
  }, [deletedView]);
  const deletedParams = new URLSearchParams(searchParams.toString());
  deletedParams.set('view', 'deleted');
  const deletedHref = `${pathname}?${deletedParams.toString()}`;
  const activeParams = new URLSearchParams(searchParams.toString());
  activeParams.delete('view');
  const activeHref = `${pathname}${activeParams.size ? `?${activeParams.toString()}` : ''}`;
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
  const nameCheck = useRepositoryName(renameTarget?.namespace, renameValue, renameTarget?.id);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<ReturnType<typeof repositoryMutationError> | null>(
    null
  );
  const [deletedName, setDeletedName] = useState<string | null>(null);
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
      if (!nameCheck.canSubmit || !nameCheck.result) return;
      const nextName = nameCheck.result.name;
      if (nextName === renameTarget.name.trim()) {
        handleRenameDialogOpenChange(false);
        return;
      }

      setRenaming(true);
      setRenameError(null);
      try {
        const project = await renameProject(renameTarget.id, nextName);
        projectStoreUpdate(renameTarget.id, apiProjectToSummary(project));
        setRenameTarget(null);
        setRenameValue('');
      } catch (cause) {
        setRenameError(cause instanceof Error ? cause.message : 'Failed to rename repository');
      } finally {
        setRenaming(false);
      }
    },
    [
      handleRenameDialogOpenChange,
      projectStoreUpdate,
      renameProject,
      renameTarget,
      nameCheck.canSubmit,
      nameCheck.result,
      renaming,
    ]
  );

  const handleConfirmDeleteProject = useCallback(async () => {
    if (!deleteTarget || deleting || deleteError?.refreshRequired) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeProject(deleteTarget.id);
      projectStoreRemove(deleteTarget.id);
      setDeletedName(deleteTarget.name);
      setDeleteTarget(null);
    } catch (cause) {
      setDeleteError(repositoryMutationError(cause));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, deleteError, projectStoreRemove, removeProject]);

  const openDeleteDialog = useCallback((project: ProjectSummary) => {
    setDeleteError(null);
    setDeleteTarget(project);
  }, []);

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
  const hasLoadedProjects = projectSummaries.length > 0;

  return (
    <div className={styles.page} ref={pageRef}>
      <DiscoverHeader
        owner={ownerSlug}
        namespaceTab="repositories"
        settingsHref={`/settings/provider-credentials?owner=${encodeURIComponent(ownerSlug)}`}
        newProjectHref={newRepositoryPath}
        visibility={isPersonalNamespace ? 'Personal' : 'Organization'}
      />

      <main className={styles.main}>
        {deletedView ? (
          <DeletedRepositoriesView namespace={ownerSlug} backHref={activeHref} />
        ) : (
          <>
            <DirectoryIntroduction
              isPersonalNamespace={isPersonalNamespace}
              ownerSlug={ownerSlug}
            />
            <div className={styles.toolbar}>
              <label className={styles.search}>
                <span className="sr-only">Find a repository</span>
                <Search aria-hidden="true" className="size-4" />
                <input
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setRepositoriesExpanded(false);
                  }}
                  placeholder="Find a repository..."
                  value={query}
                />
              </label>
              <Button
                aria-label="Refresh repositories"
                title="Refresh repositories"
                disabled={loading}
                onClick={handleRefreshProjects}
                size="icon-lg"
                variant="canvas-ghost"
              >
                <RefreshCw
                  className={cn('size-4', loading && 'animate-spin motion-reduce:animate-none')}
                />
              </Button>
              <Button asChild size="lg">
                <Link href={newRepositoryPath} className={styles.primaryLink}>
                  <Plus className="size-4" /> New repository
                </Link>
              </Button>
            </div>

            {deletedName && (
              <p role="status" className={styles.notice}>
                {deletedName} was deleted. Its data and names are kept.{' '}
                <Link
                  href={deletedHref}
                  scroll={false}
                  className="text-[var(--accent-commit)] underline"
                >
                  Manage deleted repositories
                </Link>
              </p>
            )}

            {error && hasLoadedProjects && (
              <div className={styles.refreshError} role="alert">
                <span>Couldn&apos;t refresh repositories. Showing the last loaded data.</span>
                <Button
                  disabled={loading}
                  onClick={handleRefreshProjects}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RefreshCw
                    className={cn('size-4', loading && 'animate-spin motion-reduce:animate-none')}
                  />
                  Retry
                </Button>
              </div>
            )}

            {loading && projectSummaries.length === 0 ? (
              <output className={styles.loading}>Loading repositories...</output>
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
                {recentProjects.length > 0 && !query.trim() && (
                  <section className={styles.section} aria-labelledby="recent-repositories-heading">
                    <div className={styles.sectionHeading}>
                      <h2 id="recent-repositories-heading">
                        <Clock3 aria-hidden="true" className="size-4" /> Recently opened
                      </h2>
                      <span>On this browser</span>
                    </div>
                    <div className={styles.recentGrid}>
                      {recentProjects.map((project) => (
                        <RecentProjectCard
                          key={project.id}
                          onDelete={openDeleteDialog}
                          onRename={openRenameDialog}
                          ownerSlug={ownerSlug}
                          project={project}
                        />
                      ))}
                    </div>
                  </section>
                )}

                <section className={styles.section}>
                  <SectionHeading
                    count={
                      query.trim()
                        ? `${filteredProjects.length} matches`
                        : `${projectSummaries.length} loaded`
                    }
                    title="Repositories"
                  />
                  {projectSummaries.length === 50 && (
                    <p className={styles.listScope}>
                      Showing the first 50 repositories. Search filters this loaded list.
                    </p>
                  )}
                  <div className={styles.repositories} id="repository-list">
                    {filteredProjects.length > 0 ? (
                      <div>
                        {(repositoriesExpanded
                          ? filteredProjects
                          : filteredProjects.slice(0, 6)
                        ).map((project) => (
                          <ProjectRow
                            key={project.id}
                            onDelete={openDeleteDialog}
                            onRename={openRenameDialog}
                            ownerSlug={ownerSlug}
                            project={project}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className={styles.noResults}>
                        <Search aria-hidden="true" className="size-5" />
                        <h3>No repositories match this filter.</h3>
                        <p>Try another name or description, or clear your search.</p>
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
          </>
        )}
      </main>

      {!deletedView && (
        <footer className={styles.footer}>
          <p>Deleted repositories keep their data until permanently deleted.</p>
          <Link href={deletedHref} scroll={false} className={cn(styles.deletedLink, focusRing)}>
            <Trash2 aria-hidden="true" className="size-4" /> Deleted repositories
          </Link>
        </footer>
      )}

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
              <RepositoryNameFeedback check={nameCheck} />
              <p className="text-xs text-[var(--text-secondary)]">
                Previous addresses stay reserved and redirect to the new address.
              </p>
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
              <Button disabled={renaming || !nameCheck.canSubmit} type="submit" variant="commit">
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
            <DialogTitle>Delete repository?</DialogTitle>
            <DialogDescription className="break-words">
              Delete "{deleteTarget?.name ?? DEFAULT_PROJECT_NAME}"? Collaborators lose access. Its
              data and all names stay reserved. Use Deleted repositories to restore it or
              permanently delete it and release its names.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-[var(--status-error)]">
              {deleteError.message}
            </p>
          )}
          <DialogFooter>
            <Button
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            {deleteError?.refreshRequired ? (
              <Button
                variant="canvas-outline"
                onClick={() => {
                  setDeleteTarget(null);
                  void refreshProjects();
                }}
              >
                Refresh list
              </Button>
            ) : (
              <Button
                disabled={deleting}
                onClick={handleConfirmDeleteProject}
                type="button"
                variant="destructive"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
