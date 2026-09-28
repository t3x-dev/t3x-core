import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface SegmentedControlItem<T extends string> {
  icon?: LucideIcon;
  label: string;
  value: T;
}

export function SegmentedControl<T extends string>({
  ariaLabel,
  className,
  controlsPrefix,
  idPrefix,
  itemClassName,
  items,
  onValueChange,
  value,
}: {
  ariaLabel: string;
  className?: string;
  controlsPrefix?: string;
  idPrefix?: string;
  itemClassName?: string;
  items: Array<SegmentedControlItem<T>>;
  onValueChange: (value: T) => void;
  value: T;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-7 min-w-0 items-stretch gap-[3px] rounded-[4px] bg-[var(--surface-app)] p-[1.5px]',
        className
      )}
      role="tablist"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const selected = item.value === value;
        return (
          <button
            aria-controls={controlsPrefix ? `${controlsPrefix}${item.value}` : undefined}
            aria-selected={selected}
            className={cn(
              'inline-flex min-w-[96px] flex-1 items-center justify-center gap-1.5 rounded-[4px] border px-4 text-xs font-medium outline-none transition-[background-color,border-color,color] focus-visible:border-[var(--accent-commit)] focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/10',
              selected
                ? 'border-[var(--stroke-divider)] bg-[var(--surface-elevated)] text-[var(--text-primary)]'
                : 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]',
              itemClassName
            )}
            key={item.value}
            id={idPrefix ? `${idPrefix}${item.value}` : undefined}
            onClick={() => onValueChange(item.value)}
            role="tab"
            type="button"
          >
            {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
