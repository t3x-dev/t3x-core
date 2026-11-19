'use client';

import { type ReactElement, useId } from 'react';
import { Button } from './button';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from './popover';

export function Popconfirm({
  children,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
}: {
  children: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  // For immediate actions. Async or high-impact decisions belong in a dialog.
  onConfirm: () => undefined;
}) {
  const id = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="max-w-[var(--radix-popover-content-available-width)]"
      >
        <p id={`${id}-title`} className="break-words text-sm font-semibold">
          {title}
        </p>
        <p id={`${id}-description`} className="mt-1 break-words text-sm text-muted-foreground">
          {description}
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <PopoverClose asChild>
            <Button size="sm" type="button" variant="outline">
              {cancelLabel}
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button size="sm" type="button" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
