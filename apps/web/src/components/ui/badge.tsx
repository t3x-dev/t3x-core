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
          'border-transparent bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm',

        // Pending badge - Orange gradient (work in progress)
        pending:
          'border-transparent bg-gradient-to-r from-orange-400 to-orange-500 text-white shadow-sm',

        // Branch badge - Amber (branch indicator)
        branch:
          'border-transparent bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 shadow-sm',

        // Main branch badge - Deeper blue
        main: 'border-transparent bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm',

        // Conversation badge - Indigo
        conversation:
          'border-transparent bg-gradient-to-r from-indigo-400 to-indigo-500 text-white shadow-sm',

        // Leaf badge - Emerald (output/result)
        leaf: 'border-transparent bg-gradient-to-r from-emerald-400 to-emerald-500 text-white shadow-sm',

        // Success badge
        success:
          'border-transparent bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-sm',

        // Warning badge
        warning:
          'border-transparent bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm',

        // Subtle variants for inline status
        'commit-subtle':
          'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
        'pending-subtle':
          'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
        'branch-subtle':
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
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
