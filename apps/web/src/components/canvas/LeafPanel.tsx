'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AnimatedButton } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { reducedMotion, staggerContainer, staggerItem } from '@/lib/motion';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import type { LeafType } from '@/types/nodes';
import { LEAF_TYPES } from './CanvasNodes';

const isRunnerEnabled = process.env.NEXT_PUBLIC_RUNNER_ENABLED === 'true';

export function LeafPanel() {
  const router = useRouter();
  const leafPanelOpen = useCanvasStore((state) => state.leafPanelOpen);
  const closeLeafPanel = useCanvasStore((state) => state.closeLeafPanel);
  const addLeafNode = useCanvasStore((state) => state.addLeafNode);
  const projectId = useCanvasStore((state) => state.projectId);
  const leafCreating = useCanvasStore((state) => state.leafCreating);
  const prefersReducedMotion = useReducedMotion();

  const containerVariants = prefersReducedMotion
    ? reducedMotion.staggerContainer
    : staggerContainer;
  const itemVariants = prefersReducedMotion ? reducedMotion.staggerItem : staggerItem;

  const handleSelectLeaf = async (leafType: LeafType) => {
    const leafId = await addLeafNode(leafType);
    // Navigate to leaf detail page after creation
    if (leafId && projectId) {
      router.push(`/project/${projectId}/leaf/${leafId}`);
    }
  };

  return (
    <Sheet open={leafPanelOpen} onOpenChange={(open) => !open && closeLeafPanel()}>
      <SheetContent side="right" className={cn('w-80 sm:max-w-80', glass.panelBase)}>
        <SheetHeader>
          <SheetTitle>Output Destinations</SheetTitle>
          <SheetDescription>Select where to publish your content</SheetDescription>
        </SheetHeader>

        <AnimatePresence initial={false}>
          {leafPanelOpen && (
            <motion.div
              className="flex flex-col gap-[var(--space-group)] p-[var(--space-group)]"
              variants={containerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <motion.div variants={itemVariants}>
                <p className="mb-[var(--space-item)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Output
                </p>
                <div className="flex flex-col gap-2">
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
      </SheetContent>
    </Sheet>
  );
}
