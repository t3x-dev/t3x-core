'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

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
        'bg-muted text-muted-foreground h-9 rounded-lg p-[3px] dark:bg-transparent dark:rounded-none dark:p-0 dark:border-b dark:border-[var(--stroke-divider)]',
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
          'h-[calc(100%-1px)] flex-1 rounded-md border border-transparent px-2 py-1 text-sm',
          'text-foreground dark:text-[var(--text-tertiary)]',
          'data-[state=active]:bg-background data-[state=active]:shadow-sm',
          'dark:rounded-none dark:border-0 dark:border-b-2 dark:border-b-transparent dark:px-3 dark:py-1.5',
          'dark:data-[state=active]:text-[var(--text-primary)] dark:data-[state=active]:border-b-[var(--accent-commit)] dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1'
        ),
        pill: cn(
          'h-full flex-1 rounded-full px-5 text-xs font-semibold leading-none',
          'text-muted-foreground hover:text-foreground',
          'data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          'transition-colors duration-200'
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
