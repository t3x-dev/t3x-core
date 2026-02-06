'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { springConfig } from '@/lib/motion';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 't3x-quickstart-progress';
const DISMISSED_KEY = 't3x-quickstart-dismissed';

interface ChecklistItem {
  id: string;
  label: string;
}

const ITEMS: ChecklistItem[] = [
  { id: 'create-conv', label: 'Create a conversation' },
  { id: 'commit-main', label: 'Commit knowledge to main' },
  { id: 'create-branch', label: 'Create a branch' },
  { id: 'generate-leaf', label: 'Generate a leaf output' },
  { id: 'merge-branches', label: 'Merge branches' },
];

function getProgress(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveProgress(progress: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

interface QuickStartChecklistProps {
  /** External signal to detect canvas node changes */
  nodeTypes?: {
    hasConversation: boolean;
    hasCommit: boolean;
    hasBranch: boolean;
    hasLeaf: boolean;
    hasMerge: boolean;
  };
}

export const QuickStartChecklist = memo(function QuickStartChecklist({
  nodeTypes,
}: QuickStartChecklistProps) {
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState(true);
  const [allComplete, setAllComplete] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Initialize from localStorage
  useEffect(() => {
    const stored = getProgress();
    setProgress(stored);
    const wasDismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
    const tourCompleted = localStorage.getItem('t3x-tour-completed') === 'true';
    // Show checklist after tour or if not dismissed
    setDismissed(wasDismissed || !tourCompleted);
  }, []);

  // Listen for reopen event from Sidebar
  useEffect(() => {
    const handleReopen = () => {
      setDismissed(false);
      setAllComplete(false);
    };
    window.addEventListener('t3x-quickstart-reopen', handleReopen);
    return () => window.removeEventListener('t3x-quickstart-reopen', handleReopen);
  }, []);

  // Detect completion from node types
  useEffect(() => {
    if (!nodeTypes) return;
    const updated = { ...getProgress() };
    let changed = false;

    if (nodeTypes.hasConversation && !updated['create-conv']) {
      updated['create-conv'] = true;
      changed = true;
    }
    if (nodeTypes.hasCommit && !updated['commit-main']) {
      updated['commit-main'] = true;
      changed = true;
    }
    if (nodeTypes.hasBranch && !updated['create-branch']) {
      updated['create-branch'] = true;
      changed = true;
    }
    if (nodeTypes.hasLeaf && !updated['generate-leaf']) {
      updated['generate-leaf'] = true;
      changed = true;
    }
    if (nodeTypes.hasMerge && !updated['merge-branches']) {
      updated['merge-branches'] = true;
      changed = true;
    }

    if (changed) {
      saveProgress(updated);
      setProgress(updated);
    }
  }, [nodeTypes]);

  // Check all complete
  useEffect(() => {
    const completedCount = ITEMS.filter((item) => progress[item.id]).length;
    if (completedCount === ITEMS.length && ITEMS.length > 0) {
      setAllComplete(true);
      const timer = setTimeout(() => setDismissed(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [progress]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  }, []);

  const completedCount = ITEMS.filter((item) => progress[item.id]).length;
  const progressPercent = (completedCount / ITEMS.length) * 100;

  if (dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={prefersReducedMotion ? { duration: 0 } : springConfig.gentle}
        className={cn(
          'fixed bottom-6 right-6 z-40 w-64',
          glass.cardBase,
          glass.highlight,
          'rounded-xl'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
            Quick Start
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="h-5 w-5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="mx-4 mb-3 h-1 rounded-full bg-[var(--surface-app)]">
          <motion.div
            className="h-full rounded-full bg-[var(--accent-commit)]"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        {/* Items */}
        <div className="px-4 pb-3 space-y-1.5">
          {allComplete ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm font-medium text-[var(--accent-commit)] text-center py-2"
            >
              You&apos;re a T3X pro!
            </motion.p>
          ) : (
            ITEMS.map((item) => {
              const done = !!progress[item.id];
              return (
                <div key={item.id} className="flex items-center gap-2">
                  <motion.div
                    animate={done && !prefersReducedMotion ? { scale: [1, 1.15, 1] } : {}}
                    transition={done ? { ...springConfig.bouncy, duration: 0.3 } : undefined}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-[var(--accent-commit)]" />
                    ) : (
                      <Circle className="h-4 w-4 text-[var(--text-tertiary)]" />
                    )}
                  </motion.div>
                  <span
                    className={cn(
                      'text-xs',
                      done
                        ? 'text-[var(--text-tertiary)] line-through'
                        : 'text-[var(--text-secondary)]'
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
