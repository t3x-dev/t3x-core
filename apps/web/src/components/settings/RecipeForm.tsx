'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type {
  CreateRecipeInput,
  Recipe,
  RecipeStep,
  RecipeTrigger,
  UpdateRecipeInput,
} from '@/lib/api';

const TRIGGER_EVENTS = [
  { value: 'commit.created', label: 'Commit Created' },
  { value: 'merge.completed', label: 'Merge Completed' },
  { value: 'leaf.created', label: 'Leaf Created' },
  { value: 'leaf.generated', label: 'Leaf Generated' },
  { value: 'run.completed', label: 'Run Completed' },
  { value: 'run.failed', label: 'Run Failed' },
] as const;

const STEP_ACTIONS = [
  { value: 'send_webhook' as const, label: 'Send Webhook' },
  { value: 'run_eval' as const, label: 'Run Evaluation' },
  { value: 'export_report' as const, label: 'Export Report' },
] as const;

interface RecipeFormProps {
  recipe: Recipe | null;
  onSubmit: (data: CreateRecipeInput | UpdateRecipeInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function RecipeForm({ recipe, onSubmit, onCancel, loading = false }: RecipeFormProps) {
  const isEdit = recipe !== null;

  const [name, setName] = useState(recipe?.name ?? '');
  const [description, setDescription] = useState(recipe?.description ?? '');
  const [triggerEvent, setTriggerEvent] = useState(recipe?.trigger?.event ?? '');
  const [enabled, setEnabled] = useState(recipe?.enabled ?? true);
  const [steps, setSteps] = useState<RecipeStep[]>(
    recipe?.steps ?? [{ action: 'send_webhook', config: {} }]
  );

  useEffect(() => {
    setName(recipe?.name ?? '');
    setDescription(recipe?.description ?? '');
    setTriggerEvent(recipe?.trigger?.event ?? '');
    setEnabled(recipe?.enabled ?? true);
    setSteps(recipe?.steps ?? [{ action: 'send_webhook', config: {} }]);
  }, [recipe]);

  const addStep = useCallback(() => {
    setSteps((prev) => [...prev, { action: 'send_webhook', config: {} }]);
  }, []);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateStepAction = useCallback((index: number, action: RecipeStep['action']) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, action } : s)));
  }, []);

  const updateStepConfig = useCallback((index: number, configJson: string) => {
    try {
      const config = JSON.parse(configJson) as Record<string, unknown>;
      setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, config } : s)));
    } catch {
      // Ignore parse errors while user is typing
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const trigger: RecipeTrigger = { event: triggerEvent };

      if (isEdit) {
        const data: UpdateRecipeInput = {
          name: name || undefined,
          description: description || undefined,
          trigger,
          steps: steps.length > 0 ? steps : undefined,
          enabled,
        };
        await onSubmit(data);
      } else {
        const data: CreateRecipeInput = {
          name,
          description: description || undefined,
          trigger,
          steps,
          enabled,
        };
        await onSubmit(data);
      }
    },
    [isEdit, name, description, triggerEvent, steps, enabled, onSubmit]
  );

  const isValid = name.trim() !== '' && triggerEvent !== '' && steps.length > 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Name */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="recipe-name">
          Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="recipe-name"
          type="text"
          placeholder="e.g. Post-merge webhook"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={loading}
          maxLength={200}
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="recipe-description">Description</Label>
        <Textarea
          id="recipe-description"
          placeholder="Optional description of what this recipe does"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={2}
          maxLength={1000}
        />
      </div>

      {/* Trigger Event */}
      <div className="flex flex-col gap-2">
        <Label>
          Trigger Event <span className="text-red-500">*</span>
        </Label>
        <Select value={triggerEvent} onValueChange={setTriggerEvent} disabled={loading}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an event" />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_EVENTS.map((event) => (
              <SelectItem key={event.value} value={event.value}>
                {event.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-[var(--text-tertiary)]">The event that triggers this recipe.</p>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-2">
        <Label>
          Steps <span className="text-red-500">*</span>
        </Label>
        <div className="flex flex-col gap-3">
          {steps.map((step, index) => (
            <div
              key={`step-${index}`}
              className="rounded-lg border border-[var(--stroke-default)] p-3 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Step {index + 1}
                </span>
                {steps.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeStep(index)}
                    disabled={loading}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    <span className="sr-only">Remove step {index + 1}</span>
                  </Button>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`step-action-${index}`}>Action</Label>
                <Select
                  value={step.action}
                  onValueChange={(val) => updateStepAction(index, val as RecipeStep['action'])}
                  disabled={loading}
                >
                  <SelectTrigger className="w-full" id={`step-action-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STEP_ACTIONS.map((action) => (
                      <SelectItem key={action.value} value={action.value}>
                        {action.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`step-config-${index}`}>Config (JSON)</Label>
                <Textarea
                  key={`config-${index}-${recipe?.id ?? 'new'}`}
                  id={`step-config-${index}`}
                  placeholder='{"url": "https://..."}'
                  defaultValue={
                    Object.keys(step.config).length > 0 ? JSON.stringify(step.config, null, 2) : ''
                  }
                  onChange={(e) => updateStepConfig(index, e.target.value)}
                  disabled={loading}
                  rows={2}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 self-start mt-1"
          onClick={addStep}
          disabled={loading}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Step
        </Button>
      </div>

      {/* Enabled Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-[var(--stroke-default)] p-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="recipe-enabled" className="cursor-pointer">
            Enabled
          </Label>
          <p className="text-xs text-[var(--text-tertiary)]">
            Enable or disable this recipe without deleting it.
          </p>
        </div>
        <Switch
          id="recipe-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={loading}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
          {isEdit ? 'Save Changes' : 'Create Recipe'}
        </Button>
      </div>
    </form>
  );
}
