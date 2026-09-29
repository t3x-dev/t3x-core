import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export function SettingsSection({
  action,
  children,
  description,
  icon: Icon,
  id,
  title,
  tone = 'default',
}: {
  action?: ReactNode;
  children: ReactNode;
  description: ReactNode;
  icon: LucideIcon;
  id: string;
  title: string;
  tone?: 'default' | 'danger';
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'scroll-mt-6 overflow-hidden rounded-xl border bg-[var(--surface-elevated)] shadow-[var(--fx-shadow-sm)]',
        tone === 'danger' ? 'border-[var(--status-error)]/30' : 'border-[var(--stroke-default)]'
      )}
      id={id}
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--stroke-divider)] px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
              tone === 'danger'
                ? 'bg-[var(--status-error)]/10 text-[var(--status-error)]'
                : 'bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]'
            )}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h2
              className="text-[15px] font-bold leading-[21px] text-[var(--text-primary)]"
              id={headingId}
            >
              {title}
            </h2>
            <p className="mt-0.5 text-[13px] leading-[18px] text-[var(--text-secondary)]">
              {description}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function SettingsField({
  children,
  hint,
  htmlFor,
  label,
}: {
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  label: string;
}) {
  return (
    <div className="grid gap-1.5 md:grid-cols-[180px_minmax(0,1fr)] md:gap-6">
      <div className="pt-2">
        <label className="text-[13px] font-semibold text-[var(--text-primary)]" htmlFor={htmlFor}>
          {label}
        </label>
        {hint ? (
          <p className="mt-0.5 text-xs leading-[17px] text-[var(--text-tertiary)]">{hint}</p>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
