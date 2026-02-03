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
import { staggerContainer, staggerItem } from '@/lib/motion';
import { useCanvasStore } from '@/store/canvasStore';
import type { LeafType } from '@/types/nodes';
import { LEAF_TYPES } from './CanvasNodes';

export function LeafPanel() {
  const router = useRouter();
  const leafPanelOpen = useCanvasStore((state) => state.leafPanelOpen);
  const closeLeafPanel = useCanvasStore((state) => state.closeLeafPanel);
  const addLeafNode = useCanvasStore((state) => state.addLeafNode);
  const projectId = useCanvasStore((state) => state.projectId);
  const leafCreating = useCanvasStore((state) => state.leafCreating);

  const handleSelectLeaf = async (leafType: LeafType) => {
    const leafId = await addLeafNode(leafType);
    // Navigate to leaf detail page after creation
    if (leafId && projectId) {
      router.push(`/project/${projectId}/leaf/${leafId}`);
    }
  };

  // Group leaf types by category
  const runnerLeaves = LEAF_TYPES.filter((l) => l.category === 'runner');
  const outputLeaves = LEAF_TYPES.filter((l) => l.category === 'output');

  return (
    <Sheet open={leafPanelOpen} onOpenChange={(open) => !open && closeLeafPanel()}>
      <SheetContent side="right" className="w-80 sm:max-w-80">
        <SheetHeader>
          <SheetTitle>Output Destinations</SheetTitle>
          <SheetDescription>Select where to publish your content</SheetDescription>
        </SheetHeader>

        <AnimatePresence>
          {leafPanelOpen && (
            <motion.div
              className="flex flex-col gap-4 p-4"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {/* Runner Section */}
              <motion.div variants={staggerItem}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Runner
                </p>
                <div className="flex flex-col gap-2">
                  {runnerLeaves.map(({ type, label, icon: Icon }) => (
                    <motion.div key={type} variants={staggerItem}>
                      <AnimatedButton
                        variant="canvas-outline"
                        className="h-auto w-full justify-start gap-3 px-4 py-3"
                        onClick={() => handleSelectLeaf(type)}
                        disabled={leafCreating}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/30">
                          {leafCreating ? (
                            <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </div>
                        <span className="font-medium">{label}</span>
                      </AnimatedButton>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Output Section */}
              <motion.div variants={staggerItem}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Output
                </p>
                <div className="flex flex-col gap-2">
                  {outputLeaves.map(({ type, label, icon: Icon }) => (
                    <motion.div key={type} variants={staggerItem}>
                      <AnimatedButton
                        variant="canvas-outline"
                        className="h-auto w-full justify-start gap-3 px-4 py-3"
                        onClick={() => handleSelectLeaf(type)}
                        disabled={leafCreating}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-100 dark:bg-indigo-900/30">
                          {leafCreating ? (
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          )}
                        </div>
                        <span className="font-medium">{label}</span>
                      </AnimatedButton>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
