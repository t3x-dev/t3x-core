import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import styles from './SettingsSection.module.css';

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
      className={cn(styles.section, tone === 'danger' && styles.danger)}
      id={id}
      tabIndex={-1}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <span aria-hidden="true" className={styles.icon}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className={styles.title} id={headingId}>
              {title}
            </h2>
            <p className={styles.description}>{description}</p>
          </div>
        </div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </header>
      <div className={styles.body}>{children}</div>
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
    <div className={styles.field}>
      <div className={styles.fieldLabel}>
        <label htmlFor={htmlFor}>{label}</label>
      </div>
      <div className={styles.fieldControl}>
        {children}
        {hint ? <p className={styles.hint}>{hint}</p> : null}
      </div>
    </div>
  );
}
