'use client';

import { Loader2, MoreVertical, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RecipeForm } from '@/components/settings/RecipeForm';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Switch } from '@/components/ui/switch';
import { useProjectOperations } from '@/hooks/useProjectOperations';
import type { CreateRecipeInput, Recipe, UpdateRecipeInput } from '@/infrastructure';
import { createRecipe, deleteRecipe, listRecipes, updateRecipe } from '@/infrastructure';
import { useProjectStore } from '@/store/projectStore';

export default function RecipesPage() {
  const projects = useProjectStore((s) => s.projects);
  const initialized = useProjectStore((s) => s.initialized);
  const { fetchProjects } = useProjectOperations();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toggle loading tracker
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Ensure projects are loaded
  useEffect(() => {
    if (!initialized) {
      fetchProjects();
    }
  }, [initialized, fetchProjects]);

  const fetchAllRecipes = useCallback(async () => {
    if (projects.length === 0) {
      setRecipes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await Promise.allSettled(projects.map((p) => listRecipes(p.id)));
      const allRecipes: Recipe[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allRecipes.push(...result.value);
        }
      }
      setRecipes(allRecipes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load recipes';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projects]);

  useEffect(() => {
    if (initialized) {
      fetchAllRecipes();
    }
  }, [initialized, fetchAllRecipes]);

  // Create / Edit handler
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
          setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          toast.success('Recipe updated');
        } else if (selectedProjectId) {
          const created = await createRecipe(selectedProjectId, data as CreateRecipeInput);
          setRecipes((prev) => [...prev, created]);
          toast.success('Recipe created');
        }
        setFormOpen(false);
        setEditingRecipe(null);
        setSelectedProjectId(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Operation failed';
        toast.error(message);
      } finally {
        setFormLoading(false);
      }
    },
    [editingRecipe, selectedProjectId]
  );

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteRecipe(deleteTarget.project_id, deleteTarget.id);
      setRecipes((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success('Recipe deleted');
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete recipe';
      toast.error(message);
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget]);

  // Toggle enabled/disabled
  const handleToggleEnabled = useCallback(async (recipe: Recipe) => {
    setTogglingId(recipe.id);
    try {
      const updated = await updateRecipe(recipe.project_id, recipe.id, {
        enabled: !recipe.enabled,
      });
      setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to toggle recipe';
      toast.error(message);
    } finally {
      setTogglingId(null);
    }
  }, []);

  // Open create dialog
  const openCreate = useCallback(() => {
    if (projects.length === 1) {
      setSelectedProjectId(projects[0].id);
      setEditingRecipe(null);
      setFormOpen(true);
    } else if (projects.length > 1) {
      // If multiple projects, pick the first one; user can change later
      setSelectedProjectId(projects[0].id);
      setEditingRecipe(null);
      setFormOpen(true);
    }
  }, [projects]);

  // Open edit dialog
  const openEdit = useCallback((recipe: Recipe) => {
    setEditingRecipe(recipe);
    setSelectedProjectId(recipe.project_id);
    setFormOpen(true);
  }, []);

  // Group recipes by project
  const recipesByProject = recipes.reduce<Record<string, Recipe[]>>((acc, recipe) => {
    if (!acc[recipe.project_id]) {
      acc[recipe.project_id] = [];
    }
    acc[recipe.project_id].push(recipe);
    return acc;
  }, {});

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name ?? projectId;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-[var(--stroke-divider)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Recipes</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              Automate workflows triggered by events in your projects.
            </p>
          </div>
          <Button className="gap-1.5" onClick={openCreate} disabled={projects.length === 0}>
            <Plus className="h-4 w-4" />
            Create Recipe
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-[var(--status-error)]">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchAllRecipes}>
              Retry
            </Button>
          </div>
        ) : recipes.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="No recipes configured"
            description={
              projects.length === 0
                ? 'Create a project first, then add recipes to automate workflows.'
                : 'Create a recipe to automate actions when events occur in your projects.'
            }
            action={
              projects.length > 0 ? { label: 'Create Recipe', onClick: openCreate } : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(recipesByProject).map(([projectId, projectRecipes]) => (
              <div key={projectId}>
                <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                  {getProjectName(projectId)}
                </h2>
                <div className="flex flex-col gap-3">
                  {projectRecipes.map((recipe) => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                      onToggle={handleToggleEnabled}
                      toggling={togglingId === recipe.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) {
            setFormOpen(false);
            setEditingRecipe(null);
            setSelectedProjectId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRecipe ? 'Edit Recipe' : 'Create Recipe'}</DialogTitle>
            <DialogDescription>
              {editingRecipe
                ? 'Update the recipe configuration.'
                : 'Configure a new recipe to automate actions when events occur.'}
            </DialogDescription>
          </DialogHeader>

          {/* Project selector for create mode with multiple projects */}
          {!editingRecipe && projects.length > 1 && (
            <div className="flex flex-col gap-2 mb-2">
              <label
                htmlFor="recipe-project-select"
                className="text-sm font-medium text-[var(--text-primary)]"
              >
                Project <span className="text-[var(--status-error)]">*</span>
              </label>
              <select
                id="recipe-project-select"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedProjectId ?? ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <RecipeForm
            recipe={editingRecipe}
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setFormOpen(false);
              setEditingRecipe(null);
              setSelectedProjectId(null);
            }}
            loading={formLoading}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
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

// ---------------------------------------------------------------------------
// RecipeCard -- individual recipe row
// ---------------------------------------------------------------------------

const STEP_ACTION_LABELS: Record<string, string> = {
  send_webhook: 'Webhook',
  run_eval: 'Eval',
  export_report: 'Report',
};

interface RecipeCardProps {
  recipe: Recipe;
  onEdit: (recipe: Recipe) => void;
  onDelete: (recipe: Recipe) => void;
  onToggle: (recipe: Recipe) => void;
  toggling: boolean;
}

function RecipeCard({ recipe, onEdit, onDelete, onToggle, toggling }: RecipeCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-card)] p-4 transition-colors hover:bg-[var(--hover-bg)]">
      <div className="flex flex-col gap-1.5 min-w-0 flex-1 mr-4">
        {/* Name + enabled */}
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              recipe.enabled ? 'bg-green-500' : 'bg-[var(--text-tertiary)]'
            }`}
          />
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {recipe.name}
          </span>
          {!recipe.enabled && (
            <Badge
              variant="outline"
              className="text-xs text-[var(--text-tertiary)] border-[var(--stroke-default)]"
            >
              Disabled
            </Badge>
          )}
        </div>

        {/* Description */}
        {recipe.description && (
          <p className="text-xs text-[var(--text-tertiary)] truncate">{recipe.description}</p>
        )}

        {/* Trigger + Steps */}
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className="text-xs font-normal text-[var(--text-secondary)] border-[var(--stroke-default)]"
          >
            on: {recipe.trigger.event}
          </Badge>
          {recipe.steps.map((step, i) => (
            <Badge
              key={`${recipe.id}-step-${i}`}
              variant="outline"
              className="text-xs font-normal text-[var(--text-secondary)] border-[var(--stroke-default)]"
            >
              {STEP_ACTION_LABELS[step.action] ?? step.action}
            </Badge>
          ))}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
          <span>
            {recipe.steps.length} step{recipe.steps.length !== 1 ? 's' : ''}
          </span>
          <span>Created {new Date(recipe.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={recipe.enabled}
          onCheckedChange={() => onToggle(recipe)}
          disabled={toggling}
          aria-label={`Toggle ${recipe.name}`}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Recipe actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(recipe)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(recipe)}
              className="text-[var(--status-error)] focus:text-[var(--status-error)]"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
