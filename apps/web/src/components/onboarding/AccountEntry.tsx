import { FolderGit2, KeyRound, UserRoundPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { T3XMark } from '@/components/layout/T3XMark';
import palette from '@/styles/management-palette.module.css';
import styles from './AccountEntry.module.css';

const icons = { login: KeyRound, register: UserRoundPlus, namespace: FolderGit2 };

export function AccountEntry({
  kind,
  title,
  description,
  navigation,
  children,
}: {
  kind: keyof typeof icons;
  title: string;
  description?: string;
  navigation?: ReactNode;
  children: ReactNode;
}) {
  const Icon = icons[kind];

  return (
    <section aria-labelledby="account-entry-title" className={`${palette.scope} ${styles.entry}`}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <span className={styles.brand}>
            <T3XMark />
            T3X
          </span>
          {navigation ?? <span className={styles.setup}>Account setup</span>}
        </div>
      </header>
      <div className={styles.card} data-kind={kind}>
        <span aria-hidden="true" className={styles.emblem}>
          <Icon size={20} />
        </span>
        <h1 id="account-entry-title" className={styles.title}>
          {title}
        </h1>
        {description && <p className={styles.description}>{description}</p>}
        {children}
      </div>
    </section>
  );
}
