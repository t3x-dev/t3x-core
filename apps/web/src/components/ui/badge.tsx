import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-[var(--on-status)] [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',

        // =============================================================================
        // T3X Semantic Variants - Node Status Badges
        // =============================================================================

        // Commit badge - stable/versioned state
        commit:
          'border-[var(--accent-commit)]/30 bg-[var(--accent-commit)]/10 text-[var(--accent-commit)] shadow-none',

        // Pending badge - work in progress
        pending:
          'border-[var(--accent-pending)]/30 bg-[var(--accent-pending)]/10 text-[var(--accent-pending)] shadow-none',

        // Branch badge - branch/path indicator
        branch:
          'border-[var(--accent-branch)]/30 bg-[var(--accent-branch)]/10 text-[var(--accent-branch)] shadow-none',

        // Main branch badge
        main: 'border-[var(--accent-commit)]/30 bg-[var(--accent-commit)]/10 text-[var(--accent-commit)] shadow-none',

        // Conversation badge
        conversation:
          'border-[var(--accent-conversation)]/30 bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)] shadow-none',

        // Leaf badge - output/result artefact
        leaf: 'border-[var(--accent-leaf)]/30 bg-[var(--accent-leaf)]/10 text-[var(--accent-leaf)] shadow-none',

        // Success badge
        success:
          'border-[var(--status-success)]/30 bg-[var(--status-success-muted)] text-[var(--status-success)] shadow-none',

        // Warning badge
        warning:
          'border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] text-[var(--status-warning)] shadow-none',

        // Subtle variants for inline status
        'commit-subtle':
          'border-[var(--accent-commit)]/30 bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]',
        'pending-subtle':
          'border-[var(--accent-pending)]/30 bg-[var(--accent-pending)]/10 text-[var(--accent-pending)]',
        'branch-subtle':
          'border-[var(--accent-branch)]/30 bg-[var(--accent-branch)]/10 text-[var(--accent-branch)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
