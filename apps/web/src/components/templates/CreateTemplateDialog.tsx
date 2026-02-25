'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CreateTemplateInput, Template, TemplateVariable } from '@/lib/api';
import { useTemplateStore } from '@/store/templateStore';

const CATEGORIES = ['social', 'business', 'technical', 'creative'] as const;
const LEAF_TYPES = ['tweet', 'article', 'email', 'weibo', 'wechat', 'slack'] as const;

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (template: Template) => void;
}

export function CreateTemplateDialog({ open, onOpenChange, onCreated }: CreateTemplateDialogProps) {
  const { createTemplate } = useTemplateStore();
  const [isCreating, setIsCreating] = useState(false);
  const [syntaxErrors, setSyntaxErrors] = useState<string[]>([]);

  const [form, setForm] = useState<CreateTemplateInput>({
    title: '',
    description: '',
    category: 'social',
    leaf_type: 'tweet',
    system_prompt: '',
    user_prompt: '',
    variables: [],
    tags: [],
  });

  const [tagInput, setTagInput] = useState('');

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm({
        title: '',
        description: '',
        category: 'social',
        leaf_type: 'tweet',
        system_prompt: '',
        user_prompt: '',
        variables: [],
        tags: [],
      });
      setSyntaxErrors([]);
      setTagInput('');
    }
  }, [open]);

  const updateForm = (updates: Partial<CreateTemplateInput>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    // Live syntax check on prompt changes
    if (updates.system_prompt !== undefined || updates.user_prompt !== undefined) {
      const sysPrompt = updates.system_prompt ?? form.system_prompt;
      const usrPrompt = updates.user_prompt ?? form.user_prompt;
      checkSyntax(sysPrompt, usrPrompt);
    }
  };

  const checkSyntax = (sys: string, usr: string) => {
    const errors: string[] = [];
    for (const [label, text] of [
      ['system_prompt', sys],
      ['user_prompt', usr],
    ] as const) {
      const opens = (text.match(/\{\{#([a-zA-Z_]\w*)\}\}/g) || []).map((b) => b.slice(3, -2));
      const closes = (text.match(/\{\{\/([a-zA-Z_]\w*)\}\}/g) || []).map((b) => b.slice(3, -2));
      for (const name of opens) {
        if (!closes.includes(name)) {
          errors.push(`${label}: Unclosed block {{#${name}}}`);
        }
      }
      for (const name of closes) {
        if (!opens.includes(name)) {
          errors.push(`${label}: Unmatched close {{/${name}}}`);
        }
      }
    }
    setSyntaxErrors(errors);
  };

  const addVariable = () => {
    updateForm({
      variables: [...form.variables, { name: '', description: '', required: false }],
    });
  };

  const updateVariable = (index: number, updates: Partial<TemplateVariable>) => {
    const vars = [...form.variables];
    vars[index] = { ...vars[index], ...updates };
    updateForm({ variables: vars });
  };

  const removeVariable = (index: number) => {
    updateForm({ variables: form.variables.filter((_, i) => i !== index) });
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      updateForm({ tags: [...form.tags, tag] });
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    updateForm({ tags: form.tags.filter((t) => t !== tag) });
  };

  const handleCreate = async () => {
    if (!form.title || !form.description || !form.system_prompt || !form.user_prompt) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (syntaxErrors.length > 0) {
      toast.error('Please fix syntax errors before creating');
      return;
    }

    setIsCreating(true);
    try {
      const template = await createTemplate(form);
      toast.success('Template created');
      onOpenChange(false);
      onCreated?.(template);
      // Reset form
      setForm({
        title: '',
        description: '',
        category: 'social',
        leaf_type: 'tweet',
        system_prompt: '',
        user_prompt: '',
        variables: [],
        tags: [],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Template</DialogTitle>
          <DialogDescription>
            Define a reusable prompt template for leaf generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Title + Description */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => updateForm({ title: e.target.value })}
                placeholder="My Template"
                disabled={isCreating}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder="A template for..."
                disabled={isCreating}
              />
            </div>
          </div>

          {/* Category + Leaf Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                value={form.category}
                onChange={(e) =>
                  updateForm({ category: e.target.value as CreateTemplateInput['category'] })
                }
                disabled={isCreating}
                className="w-full h-9 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-base)] px-3 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Leaf Type</Label>
              <select
                value={form.leaf_type}
                onChange={(e) => updateForm({ leaf_type: e.target.value })}
                disabled={isCreating}
                className="w-full h-9 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-base)] px-3 text-sm"
              >
                {LEAF_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-1.5">
            <Label>System Prompt *</Label>
            <Textarea
              value={form.system_prompt}
              onChange={(e) => updateForm({ system_prompt: e.target.value })}
              placeholder="You are a content writer. Use {{formattedSentences}} as source..."
              rows={5}
              className="font-mono text-xs"
              disabled={isCreating}
            />
          </div>

          {/* User Prompt */}
          <div className="space-y-1.5">
            <Label>User Prompt *</Label>
            <Textarea
              value={form.user_prompt}
              onChange={(e) => updateForm({ user_prompt: e.target.value })}
              placeholder="Generate content based on: {{formattedSentences}}"
              rows={5}
              className="font-mono text-xs"
              disabled={isCreating}
            />
          </div>

          {/* Syntax Errors */}
          {syntaxErrors.length > 0 && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
              {syntaxErrors.map((err, i) => (
                <p key={i} className="text-xs text-red-500">
                  {err}
                </p>
              ))}
            </div>
          )}

          {/* Variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Variables</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={addVariable}
                disabled={isCreating}
              >
                <Plus className="h-3 w-3" />
                Add Variable
              </Button>
            </div>
            {form.variables.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={v.name}
                  onChange={(e) => updateVariable(i, { name: e.target.value })}
                  placeholder="variableName"
                  className="flex-1 h-8 text-xs font-mono"
                  disabled={isCreating}
                />
                <Input
                  value={v.description}
                  onChange={(e) => updateVariable(i, { description: e.target.value })}
                  placeholder="Description"
                  className="flex-1 h-8 text-xs"
                  disabled={isCreating}
                />
                <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)] shrink-0">
                  <input
                    type="checkbox"
                    checked={v.required}
                    onChange={(e) => updateVariable(i, { required: e.target.checked })}
                    disabled={isCreating}
                  />
                  Req
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => removeVariable(i)}
                  disabled={isCreating}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex items-center gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag..."
                className="flex-1 h-8 text-xs"
                disabled={isCreating}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={addTag}
                disabled={isCreating}
              >
                Add
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {form.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] cursor-pointer"
                    onClick={() => removeTag(tag)}
                  >
                    {tag} &times;
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              isCreating ||
              !form.title ||
              !form.description ||
              !form.system_prompt ||
              !form.user_prompt
            }
            className="gap-1"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-3 w-3" />
                Create Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
