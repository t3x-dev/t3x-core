'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/utils/cn';

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

const tabsListVariants = cva('inline-flex w-fit items-center justify-center', {
  variants: {
    variant: {
      default:
        'h-7 gap-[3px] rounded-[4px] bg-[var(--surface-app)] p-[1.5px] text-[var(--text-secondary)]',
      pill: 'h-9 rounded-full border border-border/60 bg-muted/80 p-1 elevation-2 backdrop-blur-md',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

interface TabsListProps
  extends React.ComponentProps<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

function TabsList({ className, variant, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        default: cn(
          'h-full flex-1 rounded-[4px] border border-transparent px-3 text-xs text-[var(--text-secondary)]',
          'hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]',
          'data-[state=active]:border-[var(--stroke-divider)] data-[state=active]:bg-[var(--surface-elevated)] data-[state=active]:text-[var(--text-primary)]',
          'focus-visible:border-[var(--accent-commit)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/10'
        ),
        pill: cn(
          'h-full flex-1 rounded-full px-5 text-xs font-semibold leading-none',
          'text-muted-foreground hover:text-foreground',
          'data-[state=active]:bg-primary data-[state=active]:text-[var(--on-accent)] data-[state=active]:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          'transition-colors duration-[var(--duration-normal)]'
        ),
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

interface TabsTriggerProps
  extends React.ComponentProps<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {}

function TabsTrigger({ className, variant, ...props }: TabsTriggerProps) {
  // Inherit variant from parent TabsList if not specified
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
