'use client';

import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Ellipsis,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { DEFAULT_PROJECT_NAME } from '@/domain/project/defaults';
import { DEFAULT_OWNER_SLUG, getProjectRepoPath } from '@/domain/project/repoPath';
import { namespaceSettingsHref } from '@/domain/settingsLocation';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { repositoryMutationError } from '@/hooks/projects/useDeletedProjects';
import { useProjects } from '@/hooks/projects/useProjects';
import { useRepositoryName } from '@/hooks/projects/useRepositoryName';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';
import palette from '@/styles/management-palette.module.css';
import { cn } from '@/utils/cn';
import { buildReturnTo } from '@/utils/navigationReturn';
import {
  orderProjectsByRecentOpen,
  readRecentProjectIds,
  recordRecentProjectOpen,
} from '@/utils/recentProjects';
import { rememberRepositorySettingsReturn } from '@/utils/repositorySettingsReturn';
import { DeletedRepositoriesView } from './DeletedRepositoriesView';
import styles from './ProjectDirectoryPage.module.css';
import {
  RepositoryMark,
  RepositoryTag,
  RepositoryVisibility,
  visibilityOptions,
} from './RepositoryIdentity';
import management from './RepositoryManagement.module.css';
import { RepositoryNameFeedback } from './RepositoryNameFeedback';
import { RepositorySelect } from './RepositorySelect';
import { RepositoryTagPicker, repositoryTagOptions } from './RepositoryTagPicker';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50';
const REPOSITORIES_PER_PAGE = 20;

function metricValue(value: number | undefined): number {
  return value ?? 0;
}

function ProjectMetrics({ project }: { project: ProjectSummary }) {
  const commits = metricValue(project.commitsCount);
  const branches = metricValue(project.branchesCount);
  return (
    <div className={styles.metrics}>
      <span className={styles.commitMetric}>
        <GitCommitHorizontal aria-hidden="true" size={14} />
        {commits} {commits === 1 ? 'commit' : 'commits'}
      </span>
      <span>
        <GitBranch aria-hidden="true" size={14} />
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
  const path = getProjectRepoPath(project);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={`Actions for ${project.name}`} size="icon-sm" variant="ghost">
          <Ellipsis aria-hidden="true" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn(palette.scope, styles.menu)}>
        <DropdownMenuItem asChild>
          <Link href={path} onClick={() => recordRecentProjectOpen(project.id)}>
            <FolderOpen aria-hidden="true" size={15} />
            Open repository
          </Link>
        </DropdownMenuItem>
        {project.canEdit === true && (
          <>
            <DropdownMenuItem
              aria-label={`Rename repository ${project.name}`}
              onSelect={() => onRename(project)}
            >
              <Pencil aria-hidden="true" size={15} />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={`${path}/settings`}
                onNavigate={() => rememberRepositorySettingsReturn(project.id, `${path}/settings`)}
              >
                <Settings aria-hidden="true" size={15} />
                Repository settings
              </Link>
            </DropdownMenuItem>
          </>
        )}
        {project.canDelete === true && (
          <DropdownMenuItem
            className={styles.dangerAction}
            aria-label={`Delete repository ${project.name}`}
            onSelect={() => onDelete(project)}
          >
            <Trash2 aria-hidden="true" size={15} />
            Delete repository
          </DropdownMenuItem>
        )}
        {project.canEdit === false && project.canDelete === false && (
          <p className={styles.menuNote}>You have read access.</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectRow({
  onDelete,
  onRename,
  project,
  selectedTags,
  onTag,
  showAccess,
}: {
  onDelete: (project: ProjectSummary) => void;
  onRename: (project: ProjectSummary) => void;
  project: ProjectSummary;
  selectedTags: string[];
  onTag: (tag: string) => void;
  showAccess: boolean;
}) {
  return (
    <article className={styles.repositoryRow}>
      <RepositoryMark id={project.id} icon={project.repositoryProfile?.icon} />
      <div className={styles.rowContent}>
        <div className={styles.rowHeading}>
          <Link
            href={getProjectRepoPath(project)}
            title={getProjectRepoPath(project)}
            onClick={() => recordRecentProjectOpen(project.id)}
            className={cn(styles.repositoryLink, focusRing)}
          >
            <h3>{project.name}</h3>
          </Link>
          {project.visibility && <RepositoryVisibility value={project.visibility} />}
          {project.canEdit === false && <span className={styles.readOnly}>Read only</span>}
        </div>
        {project.description && <p className={styles.description}>{project.description}</p>}
        {Boolean(project.repositoryProfile?.tags.length) && (
          <div className={styles.rowTags}>
            {project.repositoryProfile?.tags.map((tag) => (
              <RepositoryTag
                key={tag}
                name={tag}
                selected={selectedTags.includes(tag)}
                onClick={() => onTag(tag)}
              />
            ))}
          </div>
        )}
        <div className={styles.rowMeta}>
          {showAccess && project.namespace && <span>Owner: {project.namespace}</span>}
          {showAccess && (
            <span>
              {project.canDelete === true
                ? 'Admin access'
                : project.canEdit === true
                  ? 'Editor access'
                  : 'Read access'}
            </span>
          )}
          <ProjectMetrics project={project} />
          <span>Created {project.updatedAt}</span>
        </div>
      </div>
      <ProjectActions onDelete={onDelete} onRename={onRename} project={project} />
    </article>
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
      <p className="mt-2 max-w-[520px] text-[14px] leading-normal text-[var(--text-secondary)]">
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
      <RepositoryMark id="empty-repository" />
      <h2>No repositories yet</h2>
      <p>
        Give your next project a place to grow. Create a repository, then bring your source material
        into its Workspace.
      </p>
      <Button asChild className={cn('mt-5', management.createAction)}>
        <Link href={newRepositoryPath} className={styles.primaryLink}>
          <Plus className="size-4" /> New repository
        </Link>
      </Button>
    </div>
  );
}

export function ProjectDirectoryPage({
  ownerSlug = DEFAULT_OWNER_SLUG,
  scope = 'namespace',
}: {
  ownerSlug?: string;
  scope?: 'namespace' | 'accessible';
}) {
  return (
    <Suspense fallback={null}>
      <ProjectDirectoryContent key={`${scope}:${ownerSlug}`} ownerSlug={ownerSlug} scope={scope} />
    </Suspense>
  );
}

function ProjectDirectoryContent({
  ownerSlug,
  scope,
}: {
  ownerSlug: string;
  scope: 'namespace' | 'accessible';
}) {
  const accessible = scope === 'accessible';
  const pathname = usePathname();
  const router = useRouter();
  const { accounts, activeAccount, selectNamespace } = useNamespaceAccounts();
  const currentAccount = accounts.find((account) => account.namespace.slug === ownerSlug);
  const namespaceOptions = Array.from(
    new Set([ownerSlug, ...accounts.map((account) => account.namespace.slug)])
  );
  useEffect(() => {
    if (
      !accessible &&
      currentAccount &&
      currentAccount.namespace.namespace_id !== activeAccount?.namespace.namespace_id
    ) {
      selectNamespace(currentAccount.namespace.namespace_id);
    }
  }, [accessible, currentAccount, activeAccount?.namespace.namespace_id, selectNamespace]);
  const searchParams = useSearchParams();
  const deletedView = !accessible && searchParams.get('view') === 'deleted';
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
  } = useProjects(100, accessible ? undefined : ownerSlug, true);
  const [query, setQuery] = useState('');
  const [directoryView, setDirectoryView] = useState<'all' | 'recent'>('all');
  const [visibility, setVisibility] = useState('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState('created');
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (pageRef.current) pageRef.current.scrollTop = 0;
  }, [page]);
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
  const [notice, setNotice] = useState<{ message: string; deleted?: boolean } | null>(null);
  const [recentProjectIds] = useState(() => readRecentProjectIds());
  const isPersonalNamespace = ownerSlug !== DEFAULT_OWNER_SLUG;
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
  const newRepositoryOwner = accessible
    ? (activeAccount?.namespace.slug ?? (authDisabled ? DEFAULT_OWNER_SLUG : null))
    : ownerSlug;
  const newRepositoryPath = newRepositoryOwner
    ? `/${newRepositoryOwner}/new`
    : '/onboarding/namespace';

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
        setNotice({ message: `${renameTarget.name} was renamed to ${project.name}.` });
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
      setNotice({
        message: `${deleteTarget.name} was deleted. Its data and names are kept.`,
        deleted: true,
      });
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

  const recentProjects = useMemo(
    () => orderProjectsByRecentOpen(projectSummaries, recentProjectIds),
    [projectSummaries, recentProjectIds]
  );
  const tags = useMemo(() => repositoryTagOptions(projects), [projects]);
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const source = directoryView === 'recent' ? recentProjects : projectSummaries;
    const filtered = source.filter(
      (project) =>
        (!normalized ||
          `${project.namespace ?? ''} ${project.name} ${project.description} ${(project.repositoryProfile?.tags ?? []).join(' ')}`
            .toLowerCase()
            .includes(normalized)) &&
        (visibility === 'all' || project.visibility === visibility) &&
        (!selectedTags.length ||
          selectedTags.some((tag) => project.repositoryProfile?.tags.includes(tag)))
    );
    return sort === 'name' ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : filtered;
  }, [projectSummaries, recentProjects, directoryView, query, visibility, selectedTags, sort]);
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / REPOSITORIES_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const displayed = filteredProjects.slice(
    (currentPage - 1) * REPOSITORIES_PER_PAGE,
    currentPage * REPOSITORIES_PER_PAGE
  );
  const hasLoadedProjects = projectSummaries.length > 0;
  const hasFilter = Boolean(query.trim() || selectedTags.length || visibility !== 'all');
  function clearFilters() {
    setQuery('');
    setSelectedTags([]);
    setVisibility('all');
    setPage(1);
  }
  function changeTag(next: string) {
    setSelectedTags((current) =>
      current.includes(next) ? current.filter((tag) => tag !== next) : [...current, next]
    );
    setPage(1);
  }

  return (
    <div className={cn(palette.scope, management.shell)}>
      <DiscoverHeader
        owner={accessible ? undefined : ownerSlug}
        namespaceTab={accessible ? undefined : 'repositories'}
        repositoriesNavigation={accessible}
        settingsHref={namespaceSettingsHref(
          accessible ? null : ownerSlug,
          buildReturnTo(pathname, searchParams)
        )}
        contextLabel={accessible ? undefined : isPersonalNamespace ? 'Personal' : 'Organization'}
      />

      <div className={cn(management.content, deletedView && styles.deletedSurface)} ref={pageRef}>
        <main
          className={cn(
            management.scope,
            management.container,
            styles.page,
            deletedView && styles.deletedPage
          )}
        >
          {deletedView ? (
            <DeletedRepositoriesView namespace={ownerSlug} backHref={activeHref} />
          ) : (
            <>
              {accessible ? (
                <div className={styles.namespaceContext}>
                  Repositories you own or can collaborate on
                </div>
              ) : (
                <div className={styles.namespaceContext}>
                  <span>Namespace</span>
                  {namespaceOptions.length > 1 ? (
                    <RepositorySelect
                      label="Namespace"
                      value={ownerSlug}
                      onValueChange={(value) => router.push(`/${encodeURIComponent(value)}`)}
                      options={namespaceOptions.map((slug) => ({ value: slug, label: slug }))}
                    />
                  ) : (
                    <span>{ownerSlug}</span>
                  )}
                </div>
              )}
              <div className={styles.titleRow}>
                <h1>
                  {accessible ? 'Your repositories' : 'Repositories'}{' '}
                  <span>{loading && !hasLoadedProjects ? '…' : projectSummaries.length}</span>
                </h1>
                <div className={styles.titleActions}>
                  {!accessible && (
                    <Link
                      href={deletedHref}
                      scroll={false}
                      className={cn(styles.deletedLink, focusRing)}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                      Deleted repositories
                    </Link>
                  )}
                  <Button asChild className={management.createAction}>
                    <Link href={newRepositoryPath}>
                      <Plus aria-hidden="true" size={16} />
                      New repository
                    </Link>
                  </Button>
                </div>
              </div>
              {notice && (
                <div className={cn(management.notice, management.successNotice, styles.notice)}>
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  <output>
                    {notice.message}{' '}
                    {notice.deleted && (
                      <Link href={deletedHref} scroll={false}>
                        Manage deleted repositories
                      </Link>
                    )}
                  </output>
                </div>
              )}
              <nav className={styles.viewTabs} aria-label="Repository views">
                <button
                  type="button"
                  aria-current={directoryView === 'all' ? 'page' : undefined}
                  onClick={() => {
                    setDirectoryView('all');
                    setPage(1);
                  }}
                >
                  All repositories <span>{projectSummaries.length}</span>
                </button>
                <button
                  type="button"
                  aria-current={directoryView === 'recent' ? 'page' : undefined}
                  onClick={() => {
                    setDirectoryView('recent');
                    setPage(1);
                  }}
                >
                  Recently opened <span>{recentProjects.length}</span>
                </button>
              </nav>
              <div className={styles.toolbar}>
                <label className={styles.search} htmlFor="directory-search">
                  <span className="sr-only">Find a repository</span>
                  <Search aria-hidden="true" size={16} />
                  <Input
                    id="directory-search"
                    type="search"
                    aria-controls="repository-list"
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search name, description, or tag…"
                    value={query}
                  />
                </label>
                <RepositorySelect
                  className={styles.filterControl}
                  label="Filter by visibility"
                  value={visibility}
                  onValueChange={(value) => {
                    setVisibility(value);
                    setPage(1);
                  }}
                  options={[{ value: 'all', label: 'All visibility' }, ...visibilityOptions]}
                />
                <RepositoryTagPicker
                  className={styles.tagFilter}
                  selected={selectedTags}
                  onChange={(values) => {
                    setSelectedTags(values);
                    setPage(1);
                  }}
                  options={tags}
                />
                <RepositorySelect
                  className={styles.filterControl}
                  label="Sort repositories"
                  value={sort}
                  onValueChange={(value) => {
                    setSort(value);
                    setPage(1);
                  }}
                  options={[
                    {
                      value: 'created',
                      label: directoryView === 'recent' ? 'Recently opened' : 'Recently created',
                    },
                    { value: 'name', label: 'Name A–Z' },
                  ]}
                />
                <Button
                  aria-label="Refresh repositories"
                  title="Refresh repositories"
                  disabled={loading}
                  onClick={handleRefreshProjects}
                  size="icon"
                  variant="outline"
                >
                  <RefreshCw
                    className={cn('size-4', loading && 'animate-spin motion-reduce:animate-none')}
                  />
                </Button>
              </div>
              {directoryView === 'all' && !hasFilter && recentProjects.length > 0 && (
                <section className={styles.recent} aria-label="Recently opened repositories">
                  <h2>
                    <Clock3 aria-hidden="true" size={16} />
                    Recently opened
                  </h2>
                  <div className={styles.recentLinks}>
                    {recentProjects.slice(0, 4).map((project) => (
                      <Link
                        key={project.id}
                        href={getProjectRepoPath(project)}
                        title={`${project.namespace ?? ownerSlug}/${project.name}`}
                        onClick={() => recordRecentProjectOpen(project.id)}
                      >
                        <RepositoryMark id={project.id} icon={project.repositoryProfile?.icon} />
                        <span>
                          <strong>{project.name}</strong>
                          <span>{project.namespace ?? ownerSlug}</span>
                        </span>
                        <ArrowRight aria-hidden="true" size={15} />
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {error && hasLoadedProjects && (
                <div className={cn(management.notice, styles.refreshError)} role="alert">
                  <span>Couldn&apos;t refresh repositories. Showing the last loaded data.</span>
                  <Button
                    disabled={loading}
                    onClick={handleRefreshProjects}
                    size="sm"
                    variant="outline"
                  >
                    Retry
                  </Button>
                </div>
              )}
              {selectedTags.length > 0 && (
                <fieldset className={styles.activeTags} aria-label="Active tag filters">
                  <span>Any of</span>
                  {selectedTags.map((tag) => (
                    <RepositoryTag key={tag} name={tag} onRemove={() => changeTag(tag)} />
                  ))}
                </fieldset>
              )}
              <div className={styles.results}>
                <div className={styles.resultLine}>
                  <output aria-live="polite">
                    {loading
                      ? 'Loading repositories…'
                      : error && !hasLoadedProjects
                        ? 'List unavailable'
                        : `${filteredProjects.length} ${hasFilter ? 'matching ' : ''}repositories`}
                  </output>
                  {hasFilter && (
                    <button type="button" onClick={clearFilters}>
                      Clear filters
                    </button>
                  )}
                </div>
                {loading && !hasLoadedProjects ? (
                  <output className={styles.loading}>Loading repositories...</output>
                ) : error && !hasLoadedProjects ? (
                  <DirectoryLoadFailure
                    error={error}
                    onRetry={handleRefreshProjects}
                    retrying={loading}
                  />
                ) : !hasLoadedProjects ? (
                  <EmptyDirectory newRepositoryPath={newRepositoryPath} />
                ) : (
                  <div className={styles.repositories} id="repository-list" aria-busy={loading}>
                    {displayed.length ? (
                      displayed.map((project) => (
                        <ProjectRow
                          key={project.id}
                          project={project}
                          onDelete={openDeleteDialog}
                          onRename={openRenameDialog}
                          selectedTags={selectedTags}
                          onTag={changeTag}
                          showAccess={accessible}
                        />
                      ))
                    ) : (
                      <div className={styles.noResults}>
                        <Search aria-hidden="true" size={20} />
                        <h3>
                          {directoryView === 'recent' && !hasFilter
                            ? 'No recently opened repositories'
                            : 'No repositories match this filter.'}
                        </h3>
                        <p>
                          {directoryView === 'recent' && !hasFilter
                            ? 'Repositories you open on this browser will appear here.'
                            : 'Try another name, description, or tag.'}
                        </p>
                        {hasFilter && (
                          <Button onClick={clearFilters} variant="outline">
                            Clear filters
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <footer className={styles.pagination}>
                  <span>
                    {error && !hasLoadedProjects
                      ? 'List unavailable'
                      : loading
                        ? 'Loading…'
                        : `${filteredProjects.length ? (currentPage - 1) * REPOSITORIES_PER_PAGE + 1 : 0}–${Math.min(currentPage * REPOSITORIES_PER_PAGE, filteredProjects.length)} of ${filteredProjects.length} repositories`}
                  </span>
                  <nav aria-label="Repository pagination">
                    <Button
                      aria-label="Previous page"
                      disabled={loading || currentPage === 1}
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft aria-hidden="true" size={16} />
                    </Button>
                    <span>
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      aria-label="Next page"
                      disabled={loading || currentPage >= totalPages}
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setPage(currentPage + 1)}
                    >
                      <ChevronRight aria-hidden="true" size={16} />
                    </Button>
                  </nav>
                </footer>
              </div>
            </>
          )}
        </main>
      </div>

      <Dialog open={Boolean(renameTarget)} onOpenChange={handleRenameDialogOpenChange}>
        <DialogContent
          className={cn(palette.scope, management.scope, management.dialog, 'sm:max-w-[480px]')}
          showCloseButton={!renaming}
        >
          <form className="grid gap-4" onSubmit={handleRenameProject}>
            <DialogHeader>
              <DialogTitle>Rename Repository</DialogTitle>
              <DialogDescription>
                Rename {renameTarget ? getProjectRepoPath(renameTarget) : 'this repository'}.
              </DialogDescription>
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
                  role="alert"
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
              <Button disabled={renaming || !nameCheck.canSubmit} type="submit" variant="outline">
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
        <DialogContent
          className={cn(palette.scope, management.scope, management.dialog, 'sm:max-w-[480px]')}
          showCloseButton={!deleting}
        >
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
