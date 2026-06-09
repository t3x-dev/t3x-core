'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, LayoutGrid, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AnimatedButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCanvasLeafActions } from '@/hooks/canvas/useCanvasLeafActions';
import { useIntroDemoQueryFlag } from '@/hooks/onboarding/useIntroDemoQueryFlag';
import { useReducedMotion } from '@/hooks/shared/useReducedMotion';
import { useTemplatesList } from '@/hooks/templates/useTemplatesList';
import { useCanvasStore } from '@/store/canvasStore';
import type { Template } from '@/types/api';
import type { LeafType } from '@/types/nodes';
import { cn } from '@/utils/cn';
import { reducedMotion, staggerContainer, staggerItem } from '@/utils/motion';
import { glass } from '@/utils/theme';
import { LEAF_TYPES } from './CanvasNodes';

const isRunnerEnabled = process.env.NEXT_PUBLIC_RUNNER_ENABLED === 'true';

export function LeafPanel() {
  const router = useRouter();
  const leafPanelOpen = useCanvasStore((state) => state.leafPanelOpen);
  const closeLeafPanel = useCanvasStore((state) => state.closeLeafPanel);
  const { add: addLeafNode, addFromTemplate: addLeafFromTemplate } = useCanvasLeafActions();
  const projectId = useCanvasStore((state) => state.projectId);
  const leafCreating = useCanvasStore((state) => state.leafCreating);
  const prefersReducedMotion = useReducedMotion();
  const introDemoRequested = useIntroDemoQueryFlag();

  const [activeTab, setActiveTab] = useState<'type' | 'template'>('type');
  const [templateSearch, setTemplateSearch] = useState('');
  const { templates, loading: loadingTemplates } = useTemplatesList({
    enabled: activeTab === 'template' && leafPanelOpen,
  });

  const containerVariants = prefersReducedMotion
    ? reducedMotion.staggerContainer
    : staggerContainer;
  const itemVariants = prefersReducedMotion ? reducedMotion.staggerItem : staggerItem;

  // Reset tab when panel closes
  useEffect(() => {
    if (!leafPanelOpen) {
      setActiveTab('type');
      setTemplateSearch('');
    }
  }, [leafPanelOpen]);

  const handleSelectLeaf = async (leafType: LeafType) => {
    const leafId = await addLeafNode(leafType);
    if (leafId && projectId) {
      const params = introDemoRequested ? '?introDemo=1' : '';
      router.push(
        `/chat/project/${encodeURIComponent(projectId)}/leaf/${encodeURIComponent(leafId)}${params}`
      );
    }
  };

  const handleSelectTemplate = useCallback(
    async (template: Template) => {
      const leafId = await addLeafFromTemplate(template);
      if (leafId && projectId) {
        router.push(
          `/chat/project/${encodeURIComponent(projectId)}/leaf/${encodeURIComponent(leafId)}`
        );
      }
    },
    [addLeafFromTemplate, projectId, router]
  );

  const filteredTemplates = templateSearch
    ? templates.filter(
        (t) =>
          t.title.toLowerCase().includes(templateSearch.toLowerCase()) ||
          t.leaf_type.toLowerCase().includes(templateSearch.toLowerCase()) ||
          t.category.toLowerCase().includes(templateSearch.toLowerCase())
      )
    : templates;

  return (
    <Sheet open={leafPanelOpen} onOpenChange={(open) => !open && closeLeafPanel()}>
      <SheetContent side="right" className={cn('w-80 sm:max-w-80', glass.panelBase)}>
        <SheetHeader>
          <SheetTitle>Output Destinations</SheetTitle>
          <SheetDescription>Select where to publish your content</SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'type' | 'template')}
          className="flex flex-col gap-0 px-4 pt-1"
        >
          <TabsList className="w-full">
            <TabsTrigger value="type" className="flex-1 text-xs">
              By Type
            </TabsTrigger>
            <TabsTrigger value="template" className="flex-1 text-xs">
              From Template
            </TabsTrigger>
          </TabsList>

          <TabsContent value="type" className="pt-3">
            <AnimatePresence initial={false}>
              {leafPanelOpen && (
                <motion.div
                  className="flex flex-col gap-[var(--space-group)]"
                  variants={containerVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <motion.div variants={itemVariants}>
                    <p className="mb-[var(--space-item)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Output
                    </p>
                    <div
                      className="flex flex-col gap-2"
                      data-intro-target="canvas-leaf-type-options"
                    >
                      {LEAF_TYPES.filter((lt) => isRunnerEnabled || lt.type !== 'deploy_agent').map(
                        ({ type, label, icon: Icon }) => (
                          <motion.div key={type} variants={itemVariants}>
                            <AnimatedButton
                              variant="canvas-outline"
                              className="h-auto w-full justify-start gap-3 px-4 py-3"
                              onClick={() => handleSelectLeaf(type)}
                              disabled={leafCreating}
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-conversation)]/10">
                                {leafCreating ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-conversation)]" />
                                ) : (
                                  <Icon className="h-4 w-4 text-[var(--accent-conversation)]" />
                                )}
                              </div>
                              <span className="font-medium">{label}</span>
                            </AnimatedButton>
                          </motion.div>
                        )
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="template" className="pt-3">
            <div className="flex flex-col gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                <Input
                  placeholder="Search templates..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>

              {/* Template list */}
              <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <LayoutGrid className="h-8 w-8 text-[var(--text-tertiary)] opacity-50" />
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {templateSearch ? 'No matching templates' : 'No templates yet'}
                    </p>
                  </div>
                ) : (
                  filteredTemplates.map((template) => (
                    <button
                      key={template.template_id}
                      type="button"
                      className={cn(
                        'flex flex-col gap-1 rounded-lg border border-[var(--stroke-default)] p-3 text-left',
                        'transition-colors hover:border-[var(--accent-conversation)]/40 hover:bg-[var(--hover-bg)]',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                      onClick={() => handleSelectTemplate(template)}
                      disabled={leafCreating}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {template.title}
                        </span>
                        {leafCreating ? (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--text-tertiary)]" />
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-[var(--hover-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                          {template.leaf_type}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-[var(--hover-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                          {template.category}
                        </span>
                      </div>
                      {template.description && (
                        <p className="text-[11px] text-[var(--text-tertiary)] line-clamp-2">
                          {template.description}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Browse all link */}
              <Link
                href="/templates"
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium',
                  'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)]',
                  'transition-colors'
                )}
                onClick={() => closeLeafPanel()}
              >
                <span>Browse All Templates</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
