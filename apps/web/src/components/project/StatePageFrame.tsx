'use client';

import { ArrowUp, GitBranch } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import styles from './StatePageFrame.module.css';

export function StatePageFooter({
  projectName,
  branch,
  onBackToTop,
}: {
  projectName: string;
  branch?: string;
  onBackToTop: () => void;
}) {
  return (
    <footer data-testid="state-page-footer" className={styles.footer}>
      <div className={styles.context}>
        <span className={styles.name} title={projectName}>
          {projectName}
        </span>
        {branch ? (
          <>
            <span aria-hidden="true">·</span>
            <span className={styles.branch} title={branch}>
              <GitBranch aria-hidden="true" />
              <span>{branch}</span>
            </span>
          </>
        ) : null}
      </div>
      <button type="button" onClick={onBackToTop}>
        Back to top <ArrowUp aria-hidden="true" />
      </button>
    </footer>
  );
}

export function StatePageFrame({
  children,
  projectName,
  branch,
}: {
  children: ReactNode;
  projectName: string;
  branch: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  return (
    <div className={styles.scroll} ref={scrollRef} data-testid="state-page-scroll">
      <div className={styles.page}>
        <div className={styles.content} ref={topRef} tabIndex={-1}>
          {children}
        </div>
        <StatePageFooter
          projectName={projectName}
          branch={branch}
          onBackToTop={() => {
            scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
            topRef.current?.focus({ preventScroll: true });
          }}
        />
      </div>
    </div>
  );
}
