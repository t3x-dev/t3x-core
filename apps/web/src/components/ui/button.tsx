import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLMotionProps, motion, useReducedMotion } from 'framer-motion';
import type * as React from 'react';
import { cn } from '@/utils/cn';
import { buttonTap } from '@/utils/motion';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-[var(--color-brand)] text-primary-foreground shadow-sm hover:bg-[var(--color-brand-hover)]',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/40 dark:border-input dark:hover:bg-input/60',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-[var(--hover-bg)]',
        link: 'text-primary underline-offset-4 hover:underline',

        // =============================================================================
        // T3X Semantic Variants - Canvas Actions
        // =============================================================================

        // Commit action - Blue (stable/committed state)
        commit:
          'bg-[var(--accent-commit)] text-[var(--on-accent)] shadow-sm hover:bg-[var(--accent-commit)]/90 focus-visible:ring-[var(--accent-commit)]/30 active:bg-[var(--accent-commit)]/95',

        // Pending/Draft action - Orange (work in progress)
        pending:
          'bg-[var(--accent-pending)] text-[var(--on-accent)] shadow-sm hover:bg-[var(--accent-pending)]/90 focus-visible:ring-[var(--accent-pending)]/30 active:bg-[var(--accent-pending)]/95',

        // Branch action - Amber
        branch:
          'bg-[var(--accent-branch)] text-[var(--on-accent)] shadow-sm hover:bg-[var(--accent-branch)]/90 focus-visible:ring-[var(--accent-branch)]/30 active:bg-[var(--accent-branch)]/95',

        // Canvas ghost - Subtle for toolbar actions
        'canvas-ghost':
          'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] active:bg-[var(--active-bg)]',

        // Canvas outline - For secondary canvas actions
        'canvas-outline':
          'border border-[var(--stroke-default)] bg-[var(--surface-card)] text-[var(--text-secondary)] shadow-sm hover:bg-[var(--hover-bg)] hover:border-[var(--stroke-strong)] hover:text-[var(--text-primary)]',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

/**
 * AnimatedButton - Button with spring-based press animation
 * Use this for interactive buttons where tactile feedback is important
 */
function AnimatedButton({
  className,
  variant = 'default',
  size = 'default',
  children,
  disabled,
  ...props
}: Omit<HTMLMotionProps<'button'>, 'ref'> &
  VariantProps<typeof buttonVariants> & { disabled?: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      whileTap={disabled || prefersReducedMotion ? undefined : buttonTap}
      whileHover={
        disabled || prefersReducedMotion
          ? undefined
          : {
              scale: 1.02,
              transition: { type: 'spring', stiffness: 400, damping: 25 },
            }
      }
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled}
      {...props}
    >
      {children}
    </motion.button>
  );
}

/**
 * PulseButton - Button with attention-grabbing pulse animation
 * Use for primary CTAs that need to draw user attention
 */
function PulseButton({
  className,
  variant = 'default',
  size = 'default',
  children,
  pulse = true,
  ...props
}: Omit<HTMLMotionProps<'button'>, 'ref'> &
  VariantProps<typeof buttonVariants> & { pulse?: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  const shouldPulse = pulse && !prefersReducedMotion;
  return (
    <motion.button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      whileTap={prefersReducedMotion ? undefined : buttonTap}
      whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
      animate={
        shouldPulse
          ? {
              boxShadow: [
                '0 0 0 0 color-mix(in srgb, var(--color-brand) 0%, transparent)',
                '0 0 0 8px color-mix(in srgb, var(--color-brand) 10%, transparent)',
                '0 0 0 0 color-mix(in srgb, var(--color-brand) 0%, transparent)',
              ],
            }
          : undefined
      }
      transition={
        shouldPulse
          ? {
              boxShadow: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
              default: { type: 'spring', stiffness: 400, damping: 25 },
            }
          : { type: 'spring', stiffness: 400, damping: 25 }
      }
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export { Button, AnimatedButton, PulseButton, buttonVariants };
