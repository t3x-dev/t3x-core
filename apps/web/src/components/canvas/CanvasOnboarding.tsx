import { motion } from 'framer-motion';
import {
  FileOutput,
  GitCommitHorizontal,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTerminology } from '@/hooks/useTerminology';
import { glass } from '@/utils/theme';
import { cn } from '@/utils/cn';

interface CanvasOnboardingProps {
  onAddNode: () => void;
  onDismiss: () => void;
  isAdding: boolean;
}

export function CanvasOnboarding({ onAddNode, onDismiss, isAdding }: CanvasOnboardingProps) {
  const prefersReducedMotion = useReducedMotion();
  const { t } = useTerminology();

  const steps = [
    {
      icon: MessageSquare,
      title: 'Add Conversation',
      desc: 'Start by adding a conversation to extract knowledge from',
    },
    {
      icon: GitCommitHorizontal,
      title: 'Extract Knowledge',
      desc: `${t('commitAction')} semantic content from your conversations`,
    },
    {
      icon: FileOutput,
      title: 'Create Outputs',
      desc: 'Generate outputs for different platforms',
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
      <Card
        className={cn(
          'pointer-events-auto border-dashed border-2 border-[var(--stroke-default)]/60 px-10 py-8 max-w-lg',
          glass.cardBase,
          glass.highlight
        )}
      >
        <p className="text-lg font-semibold text-[var(--text-primary)] mb-[var(--space-section)]">
          Get started with T3X
        </p>
        <div className="flex flex-col gap-5">
          {steps.map((step, i) => (
            <div key={step.title} className="flex items-start gap-4 text-left">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-commit)] text-white text-sm font-bold">
                {i + 1}
              </div>
              <div className="flex items-start gap-3">
                <motion.div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-commit)]/10"
                  animate={prefersReducedMotion ? undefined : { y: [0, -2, 0] }}
                  transition={
                    prefersReducedMotion
                      ? undefined
                      : {
                          duration: 3,
                          delay: i * 0.5,
                          ease: 'easeInOut',
                        }
                  }
                >
                  <step.icon className="h-5 w-5 text-[var(--accent-commit)]" />
                </motion.div>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{step.title}</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{step.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="default"
            size="sm"
            onClick={onAddNode}
            disabled={isAdding}
            className="gap-1.5"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="h-4 w-4" />
            )}
            Create Your First Conversation
          </Button>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-3 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
        >
          Don&apos;t show again
        </button>
      </Card>
    </div>
  );
}
