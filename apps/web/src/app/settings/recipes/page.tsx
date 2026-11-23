'use client';

import { isRecipeTriggerAvailable } from '@t3x-dev/api-client';
import {
  ArrowRight,
  FileOutput,
  Gauge,
  GitCommitHorizontal,
  GitMerge,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Webhook,
  Workflow,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RecipeForm } from '@/components/settings/RecipeForm';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { formatUserFacingError } from '@/domain/format/errors';
import { useProjectDetail } from '@/hooks/projects/useProjectDetail';
import { useProjects } from '@/hooks/projects/useProjects';
import { useRecipeCommands } from '@/hooks/recipes/useRecipeCommands';
import palette from '@/styles/management-palette.module.css';
import type { CreateRecipeInput, Recipe, RecipeStep, UpdateRecipeInput } from '@/types/api';
import styles from './RecipeSettings.module.css';

const TRIGGER_LABELS: Record<string, string> = {
  'commit.created': 'Commit created',
  'merge.completed': 'Merge completed',
  'check.failed': 'Check failed',
  'leaf.created': 'Leaf created',
  'leaf.generated': 'Leaf generated',
  'run.completed': 'Run completed',
  'run.failed': 'Run failed',
};

const ACTION_LABELS: Record<RecipeStep['action'], string> = {
  send_webhook: 'Send webhook',
  run_eval: 'Run validation',
  export_report: 'Export report',
};

function triggerLabel(event: string): string {
  return TRIGGER_LABELS[event] ?? event.replaceAll('.', ' ');
}

function actionLabel(action: RecipeStep['action']): string {
  return ACTION_LABELS[action] ?? action.replaceAll('_', ' ');
}

function TriggerIcon({ event }: { event: string }) {
  const Icon =
    event === 'merge.completed'
      ? GitMerge
      : event === 'run.failed'
        ? XCircle
        : event.includes('leaf')
          ? Sparkles
          : GitCommitHorizontal;
  return <Icon aria-hidden="true" />;
}

function ActionIcon({ action }: { action: RecipeStep['action'] }) {
  const Icon = action === 'run_eval' ? Gauge : action === 'export_report' ? FileOutput : Webhook;
  return <Icon aria-hidden="true" />;
}

export default function RecipesPage() {
  const projectId = useSearchParams().get('project')?.trim() ?? '';
  return <RecipeSettings key={projectId} projectId={projectId} />;
}

function RecipeSettings({ projectId }: { projectId: string }) {
  const [search, setSearch] = useState('');
  const {
    projects,
    loading: projectsLoading,
    error: projectsError,
    refresh: refreshProjects,
    hasMore,
    loadMore,
  } = useProjects(20, undefined, 'on-demand', { search, enabled: !projectId });
  const { project: scopedProject, error: scopedProjectError } = useProjectDetail(projectId || null);
  const { listRecipes, createRecipe, updateRecipe, deleteRecipe } = useRecipeCommands();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const recipeReads = useRef(new Map<string, Promise<Recipe[]>>());
  const recipeRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const formOpenerRef = useRef<HTMLElement | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [chosenLabels, setChosenLabels] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const targetProjectIds = useMemo(
    () => (projectId ? [projectId] : projects.map((project) => project.project_id)),
    [projectId, projects]
  );
  const projectLabels = new Map([
    ...Object.entries(chosenLabels),
    ...projects.map(
      (project) =>
        [
          project.project_id,
          project.namespace ? `${project.namespace}/${project.name}` : project.name,
        ] as const
    ),
  ]);
  if (scopedProject)
    projectLabels.set(
      scopedProject.id,
      scopedProject.namespace
        ? `${scopedProject.namespace}/${scopedProject.name}`
        : scopedProject.name
    );
  const canCreate = projectId
    ? Boolean(scopedProject && !scopedProjectError && scopedProject.canEdit !== false)
    : !projectsLoading &&
      (hasMore || Boolean(search.trim()) || projects.some((project) => project.can_edit !== false));
  const projectListError = !projectId && projectsError;
  const settingsHref = projectId
    ? `/project/${encodeURIComponent(projectId)}/settings`
    : '/settings';

  const fetchRecipes = useCallback(async () => {
    const request = ++recipeRequest.current;
    if (!projectId && projectsLoading) return;
    if (targetProjectIds.length === 0) {
      setRecipes([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await Promise.allSettled(
        targetProjectIds.map((id) => {
          const cached = recipeReads.current.get(id);
          if (cached) return cached;
          const pending = listRecipes(id).catch((cause: unknown) => {
            if (recipeReads.current.get(id) === pending) recipeReads.current.delete(id);
            throw cause;
          });
          recipeReads.current.set(id, pending);
          return pending;
        })
      );
      if (request !== recipeRequest.current) return;
      setRecipes(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])));
      if (results.every((result) => result.status === 'rejected')) {
        const firstFailure = results.find((result) => result.status === 'rejected');
        throw firstFailure?.reason;
      }
    } catch (fetchError) {
      if (request === recipeRequest.current)
        setError(formatUserFacingError(fetchError, 'Failed to load recipes.'));
    } finally {
      if (request === recipeRequest.current) setLoading(false);
    }
  }, [listRecipes, projectId, projectsLoading, targetProjectIds]);

  useEffect(() => {
    void fetchRecipes();
    return () => {
      ++recipeRequest.current;
    };
  }, [fetchRecipes]);

  const updateLoadedRecipes = useCallback(
    (id: string, update: (rows: Recipe[]) => Recipe[]) => {
      const cached = recipeReads.current.get(id);
      if (cached) {
        const revised = cached.then(update, () => {
          if (recipeReads.current.get(id) === revised) recipeReads.current.delete(id);
          return update([]);
        });
        recipeReads.current.set(id, revised);
        void fetchRecipes();
      }
      setRecipes(update);
    },
    [fetchRecipes]
  );

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditingRecipe(null);
    setSelectedProjectId('');
    setFormError(null);
  }, []);

  const openCreate = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!canCreate) return;
      formOpenerRef.current = event.currentTarget;
      setSelectedProjectId(projectId);
      setEditingRecipe(null);
      setFormOpen(true);
    },
    [canCreate, projectId]
  );

  const openEdit = useCallback((recipe: Recipe, opener: HTMLElement) => {
    formOpenerRef.current = opener;
    setSelectedProjectId(recipe.project_id);
    setEditingRecipe(recipe);
    setFormOpen(true);
  }, []);

  const handleFormSubmit = useCallback(
    async (data: CreateRecipeInput | UpdateRecipeInput) => {
      if (!selectedProjectId || formLoading) return;
      setFormError(null);
      setFormLoading(true);
      try {
        if (editingRecipe) {
          const updated = await updateRecipe(
            editingRecipe.project_id,
            editingRecipe.id,
            data as UpdateRecipeInput
          );
          updateLoadedRecipes(updated.project_id, (current) =>
            current.map((recipe) => (recipe.id === updated.id ? updated : recipe))
          );
          toast.success('Recipe updated');
        } else {
          const created = await createRecipe(selectedProjectId, data as CreateRecipeInput);
          updateLoadedRecipes(created.project_id, (current) => [
            ...current.filter((recipe) => recipe.id !== created.id),
            created,
          ]);
          toast.success('Recipe created');
        }
        closeForm();
      } catch (submitError) {
        setFormError(formatUserFacingError(submitError, 'Failed to save the recipe.'));
      } finally {
        setFormLoading(false);
      }
    },
    [
      closeForm,
      createRecipe,
      editingRecipe,
      formLoading,
      selectedProjectId,
      updateRecipe,
      updateLoadedRecipes,
    ]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteRecipe(deleteTarget.project_id, deleteTarget.id);
      updateLoadedRecipes(deleteTarget.project_id, (current) =>
        current.filter((recipe) => recipe.id !== deleteTarget.id)
      );
      setDeleteTarget(null);
      toast.success('Recipe deleted');
    } catch (deleteError) {
      toast.error(formatUserFacingError(deleteError, 'Failed to delete recipe.'));
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteRecipe, deleteTarget, updateLoadedRecipes]);

  return (
    <div className={styles.page}>
      <section className={styles.workspace}>
        <header className={styles.pageHeader}>
          <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
            <Link href={settingsHref}>{projectId ? 'Project settings' : 'Settings'}</Link>
            <span aria-hidden="true">/</span>
            <span>Automations</span>
            <span aria-hidden="true">/</span>
            <strong>Recipes</strong>
          </nav>
          <div className={styles.titleRow}>
            <div className={styles.titleCluster}>
              <h1>Recipes</h1>
              <span className={styles.scopeBadge}>{projectId ? 'Project' : 'Across projects'}</span>
            </div>
            <Button className={styles.newButton} onClick={openCreate} disabled={!canCreate}>
              <Plus aria-hidden="true" />
              New recipe
            </Button>
          </div>
        </header>

        <div className={styles.contentScroll}>
          <section className={styles.panel} aria-labelledby="recipe-list-title">
            <h2 id="recipe-list-title" className="sr-only">
              Project recipes
            </h2>
            {!projectId && (
              <div className="flex flex-wrap items-center gap-2 p-3">
                <Input
                  type="search"
                  aria-label="Search recipe repositories"
                  placeholder="Search repositories…"
                  className="max-w-xs"
                  value={search}
                  maxLength={200}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {hasMore && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={projectsLoading || loading}
                    onClick={() => void loadMore()}
                  >
                    {projectListError
                      ? 'Retry loading more repositories'
                      : 'Load more repositories'}
                  </Button>
                )}
                {(projectsLoading || loading) && recipes.length > 0 && (
                  <output className="text-sm text-muted-foreground">Loading recipes…</output>
                )}
              </div>
            )}
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>
                      Trigger <ArrowRight aria-hidden="true" /> Action
                    </th>
                    <th>Status</th>
                    <th>Project</th>
                    <th className={styles.actionColumn}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(!projectId && projectsLoading && !projects.length) ||
                  (loading && !recipes.length) ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        <Loader2 aria-label="Loading recipes" className={styles.spinner} />
                      </td>
                    </tr>
                  ) : (projectListError && !hasMore) || error ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        <span className={styles.errorText}>{projectListError || error}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void (projectListError && !hasMore ? refreshProjects() : fetchRecipes())
                          }
                        >
                          Retry
                        </Button>
                      </td>
                    </tr>
                  ) : recipes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        <span>
                          {projectId
                            ? 'No recipes configured for this project.'
                            : 'No recipes configured in the loaded projects.'}
                        </span>
                        {canCreate && (
                          <button type="button" onClick={openCreate}>
                            Create your first recipe
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    recipes.map((recipe) => {
                      const firstStep = recipe.steps[0] ?? {
                        action: 'send_webhook' as const,
                        config: {},
                      };
                      return (
                        <tr key={recipe.id}>
                          <td>
                            <div className={styles.nameCell}>
                              <span className={styles.recipeIcon}>
                                <Workflow aria-hidden="true" />
                              </span>
                              <span>
                                <strong>{recipe.name}</strong>
                                <small>{recipe.description || 'Automated project workflow'}</small>
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className={styles.flowCell}>
                              <span>
                                <TriggerIcon event={recipe.trigger.event} />
                                {triggerLabel(recipe.trigger.event)}
                              </span>
                              <ArrowRight aria-hidden="true" className={styles.flowArrow} />
                              <span>
                                <ActionIcon action={firstStep.action} />
                                {actionLabel(firstStep.action)}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={
                                recipe.enabled && isRecipeTriggerAvailable(recipe.trigger.event)
                                  ? styles.enabled
                                  : styles.disabled
                              }
                            >
                              <span aria-hidden="true" />
                              {!isRecipeTriggerAvailable(recipe.trigger.event)
                                ? 'Trigger unavailable'
                                : recipe.enabled
                                  ? 'Enabled'
                                  : 'Disabled'}
                            </span>
                          </td>
                          <td className="break-words">
                            {projectLabels.get(recipe.project_id) ?? recipe.project_id}
                          </td>
                          <td className={styles.actionColumn}>
                            <div className={styles.rowActions}>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => openEdit(recipe, event.currentTarget)}
                              >
                                <Pencil aria-hidden="true" />
                                Edit
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className={styles.moreButton}
                                    aria-label={`More actions for ${recipe.name}`}
                                  >
                                    <MoreVertical aria-hidden="true" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className={palette.scope}>
                                  <DropdownMenuItem
                                    className="text-[var(--status-error)] focus:text-[var(--status-error)]"
                                    onClick={() => setDeleteTarget(recipe)}
                                  >
                                    <Trash2 aria-hidden="true" className="mr-2 size-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <Sheet
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <SheetContent
          className={`${palette.scope} ${styles.drawer}`}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document
              .getElementById(projectId || editingRecipe ? 'recipe-name' : 'recipe-target-project')
              ?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            formOpenerRef.current?.focus();
          }}
        >
          <div className={styles.drawerHeader}>
            <SheetTitle>{editingRecipe ? 'Edit recipe' : 'New recipe'}</SheetTitle>
            <SheetDescription className="sr-only">
              Configure this recipe's trigger and actions.
            </SheetDescription>
          </div>
          <RecipeForm
            recipe={editingRecipe}
            onSubmit={handleFormSubmit}
            onCancel={closeForm}
            loading={formLoading}
            projectName={projectLabels.get(selectedProjectId) ?? selectedProjectId}
            projectSelection={
              projectId || editingRecipe
                ? undefined
                : {
                    value: selectedProjectId,
                    onChange: (id, label) => {
                      setSelectedProjectId(id);
                      if (id) setChosenLabels((current) => ({ ...current, [id]: label }));
                    },
                  }
            }
            error={formError}
            variant="drawer"
          />
        </SheetContent>
      </Sheet>

      <AlertDialog
        contentClassName={palette.scope}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Recipe"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        variant="destructive"
        loading={deleteLoading}
      />
    </div>
  );
}
