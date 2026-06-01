'use client';

import { LayoutGrid, Loader2, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CreateTemplateDialog } from '@/components/templates/CreateTemplateDialog';
import { TemplateCard } from '@/components/templates/TemplateCard';
import { TemplatePreviewDialog } from '@/components/templates/TemplatePreviewDialog';
import { UseTemplateDialog } from '@/components/templates/UseTemplateDialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { useTemplates } from '@/hooks/templates/useTemplates';
import type { Template } from '@/types/api';
import { cn } from '@/utils/cn';

const CATEGORIES = [
  { value: null, label: 'All' },
  { value: 'social', label: 'Social' },
  { value: 'business', label: 'Business' },
  { value: 'technical', label: 'Technical' },
  { value: 'creative', label: 'Creative' },
] as const;

const LEAF_TYPES = [
  { value: null, label: 'All Types' },
  { value: 'tweet', label: 'Tweet' },
  { value: 'article', label: 'Article' },
  { value: 'email', label: 'Email' },
  { value: 'weibo', label: 'Weibo' },
  { value: 'wechat', label: 'WeChat' },
  { value: 'slack', label: 'Slack' },
] as const;

export default function TemplatesPage() {
  const {
    templates,
    loading,
    error,
    category,
    leafType,
    search,
    fetchTemplates,
    setCategory,
    setLeafType,
    setSearch,
    deleteTemplate,
  } = useTemplates();

  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [useTemplate, setUseTemplate] = useState<Template | null>(null);
  const [useOpen, setUseOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setSearch(searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, setSearch]);

  const handlePreview = useCallback((template: Template) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
  }, []);

  const handleUse = useCallback((template: Template) => {
    setUseTemplate(template);
    setUseOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (template: Template) => {
      if (!confirm(`Delete template "${template.title}"?`)) return;
      try {
        await deleteTemplate(template.template_id);
      } catch {
        // Error handled by store
      }
    },
    [deleteTemplate]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-[var(--stroke-divider)] px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Template Gallery</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              Browse and use prompt templates for leaf generation
            </p>
          </div>
          <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Template
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <Input
              placeholder="Search templates..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Category filter */}
          <div className="flex gap-1">
            {CATEGORIES.map((c) => (
              <Button
                key={c.value ?? 'all'}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 text-xs',
                  category === c.value && 'bg-[var(--hover-bg-strong)] text-[var(--text-primary)]'
                )}
                onClick={() => setCategory(c.value)}
              >
                {c.label}
              </Button>
            ))}
          </div>

          {/* Leaf type filter */}
          <select
            value={leafType ?? ''}
            onChange={(e) => setLeafType(e.target.value || null)}
            className="h-8 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-base)] px-2 text-xs text-[var(--text-primary)]"
          >
            {LEAF_TYPES.map((t) => (
              <option key={t.value ?? 'all'} value={t.value ?? ''}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-[var(--status-error)]">{error}</p>
          </div>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={LayoutGrid}
            title="No templates found"
            description={
              search || category || leafType
                ? 'Try adjusting your search or filters.'
                : 'Create your first template to get started.'
            }
            action={
              search || category || leafType
                ? {
                    label: 'Clear Filters',
                    onClick: () => {
                      setSearchInput('');
                      setSearch('');
                      setCategory(null);
                      setLeafType(null);
                    },
                  }
                : {
                    label: 'Create Template',
                    onClick: () => setCreateOpen(true),
                  }
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.template_id}
                template={template}
                onPreview={handlePreview}
                onUse={handleUse}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <TemplatePreviewDialog
        template={previewTemplate}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onUse={handleUse}
      />

      {/* Use Template Dialog */}
      <UseTemplateDialog template={useTemplate} open={useOpen} onOpenChange={setUseOpen} />

      {/* Create Template Dialog */}
      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
