import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './alert.module.css';

export function Alert({
  label,
  title,
  tone = 'info',
  layout = 'inset',
  actions,
  children,
}: {
  label?: string;
  title: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
  layout?: 'inset' | 'banner';
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const Icon = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert }[
    tone
  ];
  return (
    <aside
      aria-label={label ?? title}
      aria-live="polite"
      className={styles.notice}
      data-layout={layout}
      data-tone={tone}
    >
      <Icon aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <div className={styles.heading}>
          <p className={styles.title}>{title}</p>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
        {children ? <div className={styles.description}>{children}</div> : null}
      </div>
    </aside>
  );
}
