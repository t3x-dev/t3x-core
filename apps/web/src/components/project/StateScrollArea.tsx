'use client';

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
  type ReactNode,
} from 'react';
import { cn } from '@/utils/cn';

interface StateScrollAreaProps
  extends Omit<ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>, 'children'> {
  children: ReactNode;
  horizontal?: boolean;
  label: string;
  viewportClassName?: string;
}

export const StateScrollArea = forwardRef<
  ComponentRef<typeof ScrollAreaPrimitive.Viewport>,
  StateScrollAreaProps
>(function StateScrollArea(
  { children, className, horizontal = false, label, viewportClassName, ...props },
  ref
) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative min-h-0 min-w-0 overflow-hidden', className)}
      data-scroll-axes={horizontal ? 'both' : 'vertical'}
      data-slot="state-scroll-area"
      type="auto"
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        aria-label={label}
        className={cn(
          'size-full overscroll-contain rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]/60',
          !horizontal && '[&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full',
          viewportClassName
        )}
        data-slot="state-scroll-area-viewport"
        ref={ref}
        role="region"
        tabIndex={0}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <StateScrollBar orientation="vertical" />
      {horizontal ? <StateScrollBar orientation="horizontal" /> : null}
      {horizontal ? (
        <ScrollAreaPrimitive.Corner className="bg-[var(--state-scrollbar-track)]" />
      ) : null}
    </ScrollAreaPrimitive.Root>
  );
});

function StateScrollBar({ orientation }: { orientation: 'horizontal' | 'vertical' }) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      aria-label={`${orientation === 'vertical' ? 'Vertical' : 'Horizontal'} scrollbar`}
      className={cn(
        'z-40 flex touch-none select-none bg-[var(--state-scrollbar-track)] p-[2px]',
        orientation === 'vertical'
          ? 'h-full w-3.5 border-l border-[var(--stroke-divider)]'
          : 'h-3.5 flex-col border-t border-[var(--stroke-divider)]'
      )}
      data-slot="state-scroll-area-scrollbar"
      orientation={orientation}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        className={cn(
          'relative flex-1 rounded-full bg-[var(--state-scrollbar-thumb)] transition-colors hover:bg-[var(--state-scrollbar-thumb-hover)] active:bg-[var(--state-scrollbar-thumb-active)]',
          orientation === 'vertical' ? 'min-h-10' : 'min-w-10'
        )}
        data-slot="state-scroll-area-thumb"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}
