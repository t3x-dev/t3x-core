import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLMotionProps, motion } from 'framer-motion';
import type * as React from 'react';
import { buttonTap } from '@/lib/motion';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',

        // =============================================================================
        // T3X Semantic Variants - Canvas Actions
        // =============================================================================

        // Commit action - Blue (stable/committed state)
        commit:
          'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm hover:from-blue-600 hover:to-blue-700 hover:shadow-md focus-visible:ring-blue-500/30 active:from-blue-700 active:to-blue-800',

        // Pending/Draft action - Orange (work in progress)
        pending:
          'bg-gradient-to-r from-orange-400 to-orange-500 text-white shadow-sm hover:from-orange-500 hover:to-orange-600 hover:shadow-md focus-visible:ring-orange-500/30 active:from-orange-600 active:to-orange-700',

        // Branch action - Amber
        branch:
          'bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 shadow-sm hover:from-amber-500 hover:to-amber-600 hover:shadow-md focus-visible:ring-amber-500/30 active:from-amber-600 active:to-amber-700',

        // Canvas ghost - Subtle for toolbar actions
        'canvas-ghost':
          'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 active:bg-slate-200 dark:active:bg-slate-700',

        // Canvas outline - For secondary canvas actions
        'canvas-outline':
          'border border-slate-200 bg-white/80 text-slate-700 shadow-sm backdrop-blur-sm hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:border-slate-600',
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
  return (
    <motion.button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      whileTap={disabled ? undefined : buttonTap}
      whileHover={
        disabled
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
  return (
    <motion.button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      whileTap={buttonTap}
      whileHover={{ scale: 1.02 }}
      animate={
        pulse
          ? {
              boxShadow: [
                '0 0 0 0 rgba(59, 130, 246, 0)',
                '0 0 0 8px rgba(59, 130, 246, 0.1)',
                '0 0 0 0 rgba(59, 130, 246, 0)',
              ],
            }
          : undefined
      }
      transition={
        pulse
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
