'use client';

import { LayoutTemplate, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import { LogoIcon } from '@/components/chat/sidebar/LogoIcon';
import styles from '@/components/project/ProjectDirectoryPage.module.css';
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

function metricValue(value: number | undefined): number {
  return value ?? 0;
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

function ProjectCard({
  project,
  compact = false,
  onDelete,
  onRename,
  ownerSlug,
}: {
  project: ProjectSummary;
  compact?: boolean;
  onDelete: (project: ProjectSummary) => void;
  onRename: (project: ProjectSummary) => void;
  ownerSlug: string;
}) {
  return (
    <article
      className={cn(
        'group',
        compact ? cn(styles.card, styles.cardInteractive, 'p-4') : 'px-5 py-4'
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <Link
          href={getProjectIdRepoPath(project.id)}
          onClick={() => recordRecentProjectOpen(project.id)}
          className="min-w-0 flex-1 rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
        >
          <h3 className="truncate text-[15px] font-semibold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-commit)]">
            {project.name}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-[13px] font-normal leading-relaxed text-[var(--text-secondary)]">
            {project.description || 'Structured state repository.'}
          </p>
          <span className={styles.pathChip}>{getProjectRepoPath(project, ownerSlug)}</span>
        </Link>
        {!compact && (
          <span className="mt-1 shrink-0 text-xs font-medium text-[var(--text-tertiary)]">
            Updated {project.updatedAt}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <Button
            aria-label={`Rename repository ${project.name}`}
            className="size-8"
            onClick={() => onRename(project)}
            size="icon-sm"
            type="button"
            variant="canvas-ghost"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            aria-label={`Delete repository ${project.name}`}
            className="size-8 text-[var(--status-error)] hover:bg-[var(--status-error)]/10 hover:text-[var(--status-error)]"
            onClick={() => onDelete(project)}
            size="icon-sm"
            type="button"
            variant="canvas-ghost"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3">
        <ProjectMetrics project={project} />
      </div>
    </article>
  );
}

function DirectoryTopBar({
  isPersonalNamespace,
  onRefresh,
  ownerSlug,
  refreshing,
}: {
  isPersonalNamespace: boolean;
  onRefresh: () => void;
  ownerSlug: string;
  refreshing: boolean;
}) {
  const settingsPath = isPersonalNamespace ? '/settings/profile' : `/${ownerSlug}/settings`;
  const newRepositoryPath = `/${ownerSlug}/new`;

  return (
    <header className={styles.topBar}>
      <div className={styles.topBarInner}>
        <div className={styles.brand}>
          <span className={styles.wordmark}>T3X</span>
          <span className={styles.brandMark}>
            <LogoIcon />
          </span>
          <span className={styles.ownerPath}>{ownerSlug}</span>
        </div>
        <nav aria-label="Namespace navigation" className="hidden items-center gap-1 md:flex">
          <Link className={styles.navLink} href={settingsPath}>
            Settings
          </Link>
        </nav>
        <div className="ml-auto" />
        <Link aria-label="New repository" className={styles.createLink} href={newRepositoryPath}>
          <Plus aria-hidden="true" className="size-3.5" />
          New repository
        </Link>
        <Button
          aria-label="Refresh repositories"
          className="size-9"
          disabled={refreshing}
          onClick={onRefresh}
          size="icon"
          type="button"
          variant="canvas-outline"
        >
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
        </Button>
        <span aria-hidden="true" className={styles.userMark}>
          {ownerSlug.charAt(0).toUpperCase()}
        </span>
      </div>
    </header>
  );
}

function NamespaceHeader({
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
  const avatarLabel =
    ownerSlug
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 2)
      .toUpperCase() || 'T3';

  return (
    <section className={styles.hero}>
      <div aria-hidden="true" className={styles.heroMark}>
        {avatarLabel}
      </div>
      <div className="min-w-0">
        <p className={styles.eyebrow}>Owner namespace</p>
        <h1 className={styles.heroTitle}>{ownerSlug}</h1>
        <p className={styles.heroCopy}>
          {isPersonalNamespace
            ? 'Personal namespace for structured state repositories.'
            : 'Organization namespace for structured state repositories.'}
        </p>
        <div className={styles.heroStats}>
          <span className={styles.statChip}>
            {isPersonalNamespace ? 'Personal namespace' : 'Organization namespace'}
          </span>
          <span className={styles.statChip}>{dataAvailable ? projects.length : '—'} repos</span>
          <span className={styles.statChip}>{dataAvailable ? commits : '—'} commits</span>
        </div>
      </div>
    </section>
  );
}

function DirectorySideRail({
  dataAvailable,
  projects,
}: {
  dataAvailable: boolean;
  projects: ProjectSummary[];
}) {
  const drafts = projects.filter((project) => project.status === 'draft').length;
  const recent = projects[0];

  if (!dataAvailable) {
    return (
      <aside className={styles.rail}>
        <section className={cn(styles.card, styles.railCard)}>
          <div className={styles.railHead}>
            <h2 className={styles.railTitle}>Repositories at a glance</h2>
          </div>
          <div className={styles.railBody}>
            <p className={styles.railCopy}>Repository data is unavailable.</p>
          </div>
        </section>
        <section className={cn(styles.card, styles.railCard)}>
          <div className={styles.railHead}>
            <h2 className={styles.railTitle}>Recently created</h2>
          </div>
          <div className={styles.railBody}>
            <p className={styles.railCopy}>Retry loading repositories to see recent creations.</p>
          </div>
        </section>
      </aside>
    );
  }

  return (
    <aside className={styles.rail}>
      <section className={cn(styles.card, styles.railCard)}>
        <div className={styles.railHead}>
          <h2 className={styles.railTitle}>Repositories at a glance</h2>
        </div>
        <div className={styles.railBody}>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Repositories</div>
            <div className={styles.tileValue}>{projects.length}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Without commits</div>
            <div className={styles.tileValue}>{drafts}</div>
          </div>
        </div>
      </section>
      <section className={cn(styles.card, styles.railCard)}>
        <div className={styles.railHead}>
          <h2 className={styles.railTitle}>Recently created</h2>
        </div>
        <div className={styles.railBody}>
          <p className={styles.railCopy}>
            {recent ? `${recent.name} created ${recent.updatedAt}.` : 'No repositories yet.'}
          </p>
        </div>
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
    <div className={cn(styles.card, styles.blank)} role="alert">
      <h2 className="text-lg font-bold text-[var(--text-primary)]">
        Couldn&apos;t load repositories
      </h2>
      <p className="mt-2 max-w-[520px] text-sm leading-normal text-[var(--text-secondary)]">
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
    <div className={cn(styles.card, styles.blank)}>
      <div className="flex size-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--accent-commit)]/20 bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]">
        <LayoutTemplate className="size-5" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-[var(--text-primary)]">No repositories yet</h2>
      <p className="mt-2 max-w-[420px] text-sm leading-normal text-[var(--text-secondary)]">
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
      <DirectoryTopBar
        isPersonalNamespace={isPersonalNamespace}
        onRefresh={handleRefreshProjects}
        ownerSlug={ownerSlug}
        refreshing={loading}
      />
      <main className={styles.main}>
        <div className="min-w-0 space-y-8">
          <NamespaceHeader
            dataAvailable={dataAvailable}
            isPersonalNamespace={isPersonalNamespace}
            ownerSlug={ownerSlug}
            projects={projectSummaries}
          />

          {error && hasLoadedProjects && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--status-error)]/25 bg-[var(--surface-card)] p-4 text-sm font-semibold text-[var(--status-error)]"
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
            <div
              className={cn(styles.card, 'p-8 text-sm font-semibold text-[var(--text-secondary)]')}
            >
              Loading repositories...
            </div>
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
              <section>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Pinned repositories</h2>
                  <span className={cn(styles.sectionMeta, 'hidden md:block')}>
                    {isPersonalNamespace ? 'Personal' : 'Organization'} repositories with shareable
                    paths
                  </span>
                </div>
                <div className={styles.pinnedGrid}>
                  {pinnedProjects.map((project) => (
                    <ProjectCard
                      compact
                      key={project.id}
                      onDelete={setDeleteTarget}
                      onRename={openRenameDialog}
                      ownerSlug={ownerSlug}
                      project={project}
                    />
                  ))}
                </div>
              </section>

              <section>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Repositories</h2>
                  <span className={styles.sectionMeta}>{filteredProjects.length} repos</span>
                </div>
                <div className={styles.toolbar}>
                  <label className={styles.search}>
                    <span className="sr-only">Find a repository</span>
                    <Search className={styles.searchIcon} />
                    <input
                      className={styles.searchInput}
                      onChange={(event) => setQuery(event.target.value)}
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
                <div className={cn(styles.card, styles.repoPanel)}>
                  {filteredProjects.length > 0 ? (
                    filteredProjects.map((project) => (
                      <div className={styles.repoRow} key={project.id}>
                        <ProjectCard
                          onDelete={setDeleteTarget}
                          onRename={openRenameDialog}
                          ownerSlug={ownerSlug}
                          project={project}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-between gap-4 p-5 text-sm font-semibold text-[var(--text-secondary)]">
                      <span>No repositories match this filter.</span>
                      <Button onClick={() => setQuery('')} type="button" variant="canvas-outline">
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
        <DirectorySideRail dataAvailable={dataAvailable} projects={projectSummaries} />
      </main>

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
