'use client';

import { LayoutTemplate, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
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
import { useProjects } from '@/hooks/projects/useProjects';
import { apiProjectToSummary, type ProjectSummary, useProjectStore } from '@/store/projectStore';
import { cn } from '@/utils/cn';
import {
  orderProjectsByRecentOpen,
  readRecentProjectIds,
  recordRecentProjectOpen,
} from '@/utils/recentProjects';

const NAV_ITEMS = [{ label: 'Setting', href: '/settings', active: false }] as const;

function metricValue(value: number | undefined): number {
  return value ?? 0;
}

function schemaCount(project: ProjectSummary): number {
  if (project.commitsCount > 0) return Math.max(1, Math.min(3, project.branchesCount + 1));
  if (project.drafts > 0) return 1;
  return 0;
}

function yopsCount(project: ProjectSummary): number {
  return Math.max(project.drafts, project.commitsCount > 0 ? 1 : 0);
}

function outputCount(project: ProjectSummary): number {
  return Math.max(0, project.commitsCount > 0 ? Math.min(project.commitsCount + 1, 6) : 0);
}

function projectPath(project: ProjectSummary): string {
  return `/t3x-dev/${project.name}`;
}

function ProjectMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'source' | 'schema' | 'yops' | 'state' | 'leaf';
}) {
  const toneVar = {
    source: 'var(--source)',
    schema: 'var(--accent-extract)',
    yops: 'var(--accent-pending)',
    state: 'var(--accent-commit)',
    leaf: 'var(--accent-leaf)',
  }[tone];

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
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
    <div className="flex flex-wrap gap-x-3 gap-y-2">
      <ProjectMetric label="Sources" value={metricValue(project.nodes)} tone="source" />
      <ProjectMetric label="YSchema" value={schemaCount(project)} tone="schema" />
      <ProjectMetric label="YOps" value={yopsCount(project)} tone="yops" />
      <ProjectMetric label="State" value={metricValue(project.commitsCount)} tone="state" />
      <ProjectMetric label="Outputs" value={outputCount(project)} tone="leaf" />
    </div>
  );
}

function ProjectCard({
  project,
  compact = false,
  onDelete,
  onRename,
}: {
  project: ProjectSummary;
  compact?: boolean;
  onDelete: (project: ProjectSummary) => void;
  onRename: (project: ProjectSummary) => void;
}) {
  return (
    <article
      className={cn(
        'group rounded-[var(--radius-card)] border border-[var(--stroke-default)] bg-[var(--surface-card)]',
        'transition-colors duration-[var(--motion-base)] ease-[var(--ease-out-soft)]',
        'hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)]',
        compact ? 'p-4' : 'p-5'
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <Link
          href={`/project/${encodeURIComponent(project.id)}`}
          onClick={() => recordRecentProjectOpen(project.id)}
          className="min-w-0 flex-1 rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
        >
          <h3 className="truncate text-lg font-semibold leading-tight text-[var(--accent-commit)]">
            {project.name}
          </h3>
          <p className="mt-3 line-clamp-2 text-sm font-medium leading-snug text-[var(--text-secondary)]">
            {project.description || 'Structured state workflow.'}
          </p>
          <p className="mt-3 truncate text-sm font-semibold text-[var(--text-tertiary)]">
            {projectPath(project)}
          </p>
        </Link>
        {!compact && (
          <span className="mt-1 shrink-0 text-xs font-semibold text-[var(--text-tertiary)]">
            Updated {project.updatedAt}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <Button
            aria-label={`Rename project ${project.name}`}
            className="size-8"
            onClick={() => onRename(project)}
            size="icon-sm"
            type="button"
            variant="canvas-ghost"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            aria-label={`Delete project ${project.name}`}
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
      <div className="mt-4">
        <ProjectMetrics project={project} />
      </div>
    </article>
  );
}

function DirectoryTopBar({
  onCreateProject,
  onRefresh,
  refreshing,
}: {
  onCreateProject: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex items-center gap-3 pr-4">
          <div className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--text-primary)] text-sm font-bold text-[var(--surface-card)]">
            T3
          </div>
          <span className="text-base font-bold text-[var(--text-primary)]">t3x-dev</span>
        </div>
        <nav aria-label="Organization navigation" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold transition-colors',
                item.active
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
              )}
              href={item.href}
              key={item.label}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto" />
        <Button
          aria-label="New project"
          className="size-9"
          onClick={onCreateProject}
          size="icon"
          type="button"
          variant="canvas-outline"
        >
          <Plus className="size-4" />
        </Button>
        <Button
          aria-label="Refresh projects"
          className="size-9"
          disabled={refreshing}
          onClick={onRefresh}
          size="icon"
          type="button"
          variant="canvas-outline"
        >
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
        </Button>
      </div>
    </header>
  );
}

function OrganizationHeader({ projects }: { projects: ProjectSummary[] }) {
  const commits = projects.reduce((sum, project) => sum + metricValue(project.commitsCount), 0);

  return (
    <section className="border-b border-[var(--stroke-divider)] pb-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div className="flex size-28 shrink-0 items-center justify-center rounded-[var(--radius-panel)] bg-[var(--text-primary)] text-3xl font-bold text-[var(--surface-card)]">
          T3
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold leading-tight text-[var(--text-primary)]">t3x-dev</h1>
          <p className="mt-2 text-base font-semibold text-[var(--text-secondary)]">
            Organization-level project directory for structured state workflows.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>3 members</span>
            <span>{projects.length} projects</span>
            <span>{commits} commits</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function DirectorySideRail({ projects }: { projects: ProjectSummary[] }) {
  const openReviews = projects.filter((project) => project.status === 'draft').length;
  const yopsDrafts = projects.reduce((sum, project) => sum + yopsCount(project), 0);
  const outputs = projects.reduce((sum, project) => sum + outputCount(project), 0);
  const recent = projects[0];

  return (
    <aside className="space-y-7">
      <section>
        <h2 className="text-base font-bold text-[var(--text-primary)]">Open work</h2>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-sm font-semibold text-[var(--text-secondary)]">
          <ProjectMetric label="reviews" value={openReviews} tone="schema" />
          <ProjectMetric label="YOps draft" value={yopsDrafts} tone="yops" />
          <ProjectMetric label="outputs" value={outputs} tone="leaf" />
        </div>
      </section>
      <section className="border-t border-[var(--stroke-divider)] pt-6">
        <h2 className="text-base font-bold text-[var(--text-primary)]">Recent activity</h2>
        <p className="mt-3 text-sm font-semibold leading-snug text-[var(--text-secondary)]">
          {recent ? `${recent.name} updated ${recent.updatedAt}.` : 'No recent project activity.'}
        </p>
      </section>
    </aside>
  );
}

function EmptyDirectory({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[var(--radius-card)] border border-[var(--stroke-default)] bg-[var(--surface-card)] p-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--accent-commit)]/20 bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]">
        <LayoutTemplate className="size-5" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-[var(--text-primary)]">No projects yet</h2>
      <p className="mt-2 max-w-[420px] text-sm leading-normal text-[var(--text-secondary)]">
        Create a project first, then enter its workbench to collect sources, validate schema, apply
        YOps, and produce Leaf artifacts.
      </p>
      <Button className="mt-5" onClick={onCreateProject} type="button" variant="commit">
        <Plus className="size-4" /> New project
      </Button>
    </div>
  );
}

export function ProjectDirectoryPage() {
  const router = useRouter();
  const projectStoreAdd = useProjectStore((state) => state.addToProjects);
  const projectStoreRemove = useProjectStore((state) => state.removeProject);
  const projectStoreUpdate = useProjectStore((state) => state.updateProject);
  const {
    create: createProject,
    error,
    loading,
    projects,
    refresh: refreshProjects,
    remove: removeProject,
    rename: renameProject,
  } = useProjects();
  const [query, setQuery] = useState('');
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectError, setNewProjectError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recentProjectIds] = useState(() => readRecentProjectIds());

  const projectSummaries = useMemo(() => projects.map(apiProjectToSummary), [projects]);

  const openNewProjectDialog = useCallback(() => {
    setNewProjectName('');
    setNewProjectError(null);
    setNewProjectDialogOpen(true);
  }, []);

  const handleNewProjectDialogOpenChange = useCallback(
    (open: boolean) => {
      if (creating) return;
      setNewProjectDialogOpen(open);
      if (!open) {
        setNewProjectName('');
        setNewProjectError(null);
      }
    },
    [creating]
  );

  const handleCreateProject = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (creating) return;
      setCreating(true);
      setNewProjectError(null);
      try {
        const project = await createProject(newProjectName.trim() || DEFAULT_PROJECT_NAME);
        projectStoreAdd(apiProjectToSummary(project));
        recordRecentProjectOpen(project.project_id);
        setNewProjectDialogOpen(false);
        setNewProjectName('');
        router.push(`/project/${encodeURIComponent(project.project_id)}`);
      } catch {
        setNewProjectError('Failed to create project');
      } finally {
        setCreating(false);
      }
    },
    [createProject, creating, newProjectName, projectStoreAdd, router]
  );

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
        setRenameError('Failed to rename project');
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

  return (
    <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)]">
      <DirectoryTopBar
        onCreateProject={openNewProjectDialog}
        onRefresh={handleRefreshProjects}
        refreshing={loading}
      />
      <main className="mx-auto grid max-w-[1560px] grid-cols-1 gap-8 px-6 py-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          <OrganizationHeader projects={projectSummaries} />

          {error && (
            <div className="rounded-[var(--radius-card)] border border-[var(--status-error)]/25 bg-[var(--surface-card)] p-4 text-sm font-semibold text-[var(--status-error)]">
              {error}
            </div>
          )}

          {loading && projectSummaries.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--stroke-default)] bg-[var(--surface-card)] p-8 text-sm font-semibold text-[var(--text-secondary)]">
              Loading projects...
            </div>
          ) : projectSummaries.length === 0 ? (
            <EmptyDirectory onCreateProject={openNewProjectDialog} />
          ) : (
            <>
              {recentProjects.length > 0 && (
                <section>
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">
                      Recent projects
                    </h2>
                    <span className="hidden text-xs font-bold text-[var(--text-tertiary)] md:block">
                      Recently opened projects
                    </span>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {recentProjects.map((project) => (
                      <ProjectCard
                        compact
                        key={project.id}
                        onDelete={setDeleteTarget}
                        onRename={openRenameDialog}
                        project={project}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">Projects</h2>
                  <span className="text-xs font-bold text-[var(--text-tertiary)]">
                    {filteredProjects.length} projects
                  </span>
                </div>
                <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="relative min-w-0">
                    <span className="sr-only">Find a project</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    <input
                      className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--stroke-default)] bg-[var(--surface-card)] pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--stroke-strong)] focus:ring-2 focus:ring-[var(--ring)]/30"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Find a project..."
                      value={query}
                    />
                  </label>
                  <Button
                    disabled={creating}
                    onClick={openNewProjectDialog}
                    type="button"
                    variant="commit"
                  >
                    <Plus className="size-4" /> New
                  </Button>
                </div>
                <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--stroke-default)] bg-[var(--surface-card)]">
                  {filteredProjects.length > 0 ? (
                    filteredProjects.map((project) => (
                      <div
                        className="border-b border-[var(--stroke-divider)] last:border-b-0"
                        key={project.id}
                      >
                        <ProjectCard
                          onDelete={setDeleteTarget}
                          onRename={openRenameDialog}
                          project={project}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-between gap-4 p-5 text-sm font-semibold text-[var(--text-secondary)]">
                      <span>No projects match this filter.</span>
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
        <DirectorySideRail projects={projectSummaries} />
      </main>

      <Dialog open={newProjectDialogOpen} onOpenChange={handleNewProjectDialogOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <form className="grid gap-4" onSubmit={handleCreateProject}>
            <DialogHeader>
              <DialogTitle>New Project</DialogTitle>
              <DialogDescription>
                Create a backend project, then open its project workbench.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[var(--text-primary)]"
                htmlFor="directory-new-project-name"
              >
                Project name
              </label>
              <Input
                aria-describedby={newProjectError ? 'directory-new-project-error' : undefined}
                aria-invalid={newProjectError ? 'true' : undefined}
                autoFocus
                disabled={creating}
                id="directory-new-project-name"
                onChange={(event) => {
                  setNewProjectName(event.target.value);
                  if (newProjectError) setNewProjectError(null);
                }}
                placeholder={DEFAULT_PROJECT_NAME}
                value={newProjectName}
              />
              {newProjectError && (
                <p className="text-xs text-[var(--status-error)]" id="directory-new-project-error">
                  {newProjectError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                disabled={creating}
                onClick={() => handleNewProjectDialogOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={creating} type="submit" variant="commit">
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameTarget)} onOpenChange={handleRenameDialogOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <form className="grid gap-4" onSubmit={handleRenameProject}>
            <DialogHeader>
              <DialogTitle>Rename Project</DialogTitle>
              <DialogDescription>Rename the backend project.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <label
                className="text-sm font-medium text-[var(--text-primary)]"
                htmlFor="directory-rename-project-name"
              >
                Project name
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
            <DialogTitle>Delete Project</DialogTitle>
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
