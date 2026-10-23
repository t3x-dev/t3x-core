import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './WorkspaceNotice.module.css';

export function WorkspaceNotice({
  label,
  title,
  tone = 'warning',
  actions,
  children,
}: {
  label: string;
  title: string;
  tone?: 'info' | 'warning' | 'error';
  actions: ReactNode;
  children: ReactNode;
}) {
  const Icon = tone === 'error' ? CircleAlert : tone === 'warning' ? TriangleAlert : Info;
  return (
    <aside aria-label={label} aria-live="polite" className={styles.notice} data-tone={tone}>
      <Icon aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <div className={styles.heading}>
          <p className={styles.title}>{title}</p>
          <div className={styles.actions}>{actions}</div>
        </div>
        <div className={styles.description}>{children}</div>
      </div>
    </aside>
  );
}
