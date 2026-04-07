import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',

        // =============================================================================
        // T3X Semantic Variants - Node Status Badges
        // =============================================================================

        // Commit badge - Blue gradient (stable/committed)
        commit:
          'border-transparent bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm dark:bg-none dark:bg-transparent dark:border-[var(--accent-commit)]/40 dark:text-[var(--accent-commit)] dark:shadow-none',

        // Pending badge - Orange gradient (work in progress)
        pending:
          'border-transparent bg-gradient-to-r from-orange-400 to-orange-500 text-white shadow-sm dark:bg-none dark:bg-transparent dark:border-[var(--accent-pending)]/40 dark:text-[var(--accent-pending)] dark:shadow-none',

        // Branch badge - Amber (branch indicator)
        branch:
          'border-transparent bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 shadow-sm dark:bg-none dark:bg-transparent dark:border-[var(--accent-branch)]/40 dark:text-[var(--accent-branch)] dark:shadow-none',

        // Main branch badge - Deeper blue
        main: 'border-transparent bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm dark:bg-none dark:bg-transparent dark:border-[var(--accent-commit)]/40 dark:text-[var(--accent-commit)] dark:shadow-none',

        // Conversation badge - Indigo
        conversation:
          'border-transparent bg-gradient-to-r from-indigo-400 to-indigo-500 text-white shadow-sm dark:bg-none dark:bg-transparent dark:border-[var(--accent-conversation)]/40 dark:text-[var(--accent-conversation)] dark:shadow-none',

        // Leaf badge - Emerald (output/result)
        leaf: 'border-transparent bg-gradient-to-r from-emerald-400 to-emerald-500 text-white shadow-sm dark:bg-none dark:bg-transparent dark:border-[var(--accent-leaf)]/40 dark:text-[var(--accent-leaf)] dark:shadow-none',

        // Success badge
        success:
          'border-transparent bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm dark:bg-none dark:bg-transparent dark:border-[var(--accent-leaf)]/40 dark:text-[var(--accent-leaf)] dark:shadow-none',

        // Warning badge
        warning:
          'border-transparent bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm dark:bg-none dark:bg-transparent dark:border-[var(--accent-pending)]/40 dark:text-[var(--accent-pending)] dark:shadow-none',

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
