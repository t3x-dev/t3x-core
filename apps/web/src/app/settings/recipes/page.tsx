'use client';

import {
  ArrowRight,
  FileOutput,
  Gauge,
  GitCommitHorizontal,
  GitMerge,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { formatUserFacingError } from '@/domain/format/errors';
import { useProjectCrud } from '@/hooks/projects/useProjectCrud';
import { useRecipeCommands } from '@/hooks/recipes/useRecipeCommands';
import { useProjectStore } from '@/store/projectStore';
import type { CreateRecipeInput, Recipe, RecipeStep, UpdateRecipeInput } from '@/types/api';
import styles from './RecipeSettings.module.css';

const TRIGGER_LABELS: Record<string, string> = {
  'commit.created': 'Commit created',
  'merge.completed': 'Merge completed',
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
  const projects = useProjectStore((state) => state.projects);
  const initialized = useProjectStore((state) => state.initialized);
  const { list: fetchProjects } = useProjectCrud();
  const { listRecipes, createRecipe, updateRecipe, deleteRecipe } = useRecipeCommands();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const formOpenerRef = useRef<HTMLElement | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!initialized) void fetchProjects();
  }, [fetchProjects, initialized]);

  const targetProjectIds = useMemo(
    () => (projectId ? [projectId] : projects.map((project) => project.id)),
    [projectId, projects]
  );
  const activeProjectId = selectedProjectId || projectId || projects[0]?.id || '';
  const activeProjectName =
    projects.find((project) => project.id === activeProjectId)?.name ?? 'Current project';
  const settingsHref = projectId
    ? `/project/${encodeURIComponent(projectId)}/settings`
    : '/settings';

  const fetchAllRecipes = useCallback(async () => {
    if (!projectId && !initialized) return;
    if (targetProjectIds.length === 0) {
      setRecipes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await Promise.allSettled(
        targetProjectIds.map((targetProjectId) => listRecipes(targetProjectId))
      );
      setRecipes(results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])));
      if (results.every((result) => result.status === 'rejected')) {
        const firstFailure = results.find((result) => result.status === 'rejected');
        throw firstFailure?.reason;
      }
    } catch (fetchError) {
      setError(formatUserFacingError(fetchError, 'Failed to load recipes.'));
    } finally {
      setLoading(false);
    }
  }, [initialized, listRecipes, projectId, targetProjectIds]);

  useEffect(() => {
    void fetchAllRecipes();
  }, [fetchAllRecipes]);

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditingRecipe(null);
    setSelectedProjectId(null);
  }, []);

  const openCreate = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      formOpenerRef.current = event.currentTarget;
      const targetProjectId = projectId || projects[0]?.id;
      if (!targetProjectId) return;
      setSelectedProjectId(targetProjectId);
      setEditingRecipe(null);
      setFormOpen(true);
    },
    [projectId, projects]
  );

  const openEdit = useCallback((recipe: Recipe, opener: HTMLElement) => {
    formOpenerRef.current = opener;
    setSelectedProjectId(recipe.project_id);
    setEditingRecipe(recipe);
    setFormOpen(true);
  }, []);

  const handleFormSubmit = useCallback(
    async (data: CreateRecipeInput | UpdateRecipeInput) => {
      setFormLoading(true);
      try {
        if (editingRecipe) {
          const updated = await updateRecipe(
            editingRecipe.project_id,
            editingRecipe.id,
            data as UpdateRecipeInput
          );
          setRecipes((current) =>
            current.map((recipe) => (recipe.id === updated.id ? updated : recipe))
          );
          toast.success('Recipe updated');
        } else if (selectedProjectId) {
          const created = await createRecipe(selectedProjectId, data as CreateRecipeInput);
          setRecipes((current) => [...current, created]);
          toast.success('Recipe created');
        }
        closeForm();
      } catch (submitError) {
        toast.error(formatUserFacingError(submitError, 'Operation failed.'));
      } finally {
        setFormLoading(false);
      }
    },
    [closeForm, createRecipe, editingRecipe, selectedProjectId, updateRecipe]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteRecipe(deleteTarget.project_id, deleteTarget.id);
      setRecipes((current) => current.filter((recipe) => recipe.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success('Recipe deleted');
    } catch (deleteError) {
      toast.error(formatUserFacingError(deleteError, 'Failed to delete recipe.'));
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteRecipe, deleteTarget]);

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
            <Button
              className={styles.newButton}
              onClick={openCreate}
              disabled={!projectId && projects.length === 0}
            >
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
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>
                      Trigger <ArrowRight aria-hidden="true" /> Action
                    </th>
                    <th>Status</th>
                    <th>Last run</th>
                    <th className={styles.actionColumn}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        <Loader2 aria-label="Loading recipes" className={styles.spinner} />
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={5} className={styles.emptyCell}>
                        <span className={styles.errorText}>{error}</span>
                        <Button size="sm" variant="outline" onClick={() => void fetchAllRecipes()}>
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
                        <button type="button" onClick={openCreate}>
                          Create your first recipe
                        </button>
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
                            <span className={recipe.enabled ? styles.enabled : styles.disabled}>
                              <span aria-hidden="true" />
                              {recipe.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </td>
                          <td className={styles.lastRun}>—</td>
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
                              <Button
                                variant="outline"
                                size="sm"
                                disabled
                                title="Persisted run history is not supported yet"
                              >
                                <Play aria-hidden="true" />
                                Run history unavailable
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
                                <DropdownMenuContent align="end">
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
          className={styles.drawer}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById('recipe-name')?.focus();
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
            projectName={activeProjectName}
            variant="drawer"
          />
        </SheetContent>
      </Sheet>

      <AlertDialog
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
