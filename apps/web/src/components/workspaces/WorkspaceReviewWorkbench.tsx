'use client';

import { Code2, Eye, GitCompareArrows } from 'lucide-react';
import type { ReactNode } from 'react';
import { useViewPreference } from '@/hooks/shared/useViewPreference';
import styles from './WorkspaceReviewWorkbench.module.css';

export const WORKSPACE_REVIEW_VIEWS = ['changes', 'rendered', 'yaml'] as const;
export type WorkspaceReviewPane = (typeof WORKSPACE_REVIEW_VIEWS)[number];
export type WorkspaceReviewSubject = 'content' | 'schema';
const SUBJECTS = ['content', 'schema'] as const;
const VIEWS = [
  { id: 'changes', label: 'Changes', detail: 'Before → After', icon: GitCompareArrows },
  { id: 'rendered', label: 'Preview', detail: 'Result structure', icon: Eye },
  { id: 'yaml', label: 'YAML', detail: 'Complete text', icon: Code2 },
] as const;

export function workspaceReviewPreferenceKey(projectId: string, workspaceId: string) {
  return `t3x.workspace-view:${projectId}:${workspaceId}:review`;
}

export function useWorkspaceReviewSubject(projectId: string, workspaceId: string) {
  return useViewPreference(
    `${workspaceReviewPreferenceKey(projectId, workspaceId)}:subject`,
    SUBJECTS,
    'content'
  );
}

/** Presentation only: the caller owns the current Draft or the immutable Review data. */
export function WorkspaceReviewWorkbench({
  title,
  status,
  actions,
  details,
  notice,
  pane,
  onPaneChange,
  subject,
  onSubjectChange,
  sidebar,
  children,
}: {
  title: ReactNode;
  status: ReactNode;
  actions?: ReactNode;
  details?: ReactNode;
  notice?: ReactNode;
  pane: WorkspaceReviewPane;
  onPaneChange: (pane: WorkspaceReviewPane) => void;
  subject: WorkspaceReviewSubject;
  onSubjectChange: (subject: WorkspaceReviewSubject) => void;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.workbench} aria-label="Workspace Review">
      <header className={styles.heading}>
        <div>
          <h1>{title}</h1>
          <p>{status}</p>
        </div>
        <div className={styles.actions}>{actions}</div>
      </header>
      {notice}
      <div className={styles.body}>
        <div className={styles.main}>
          <div className={styles.toolbar}>
            <nav className={styles.subjects} aria-label="Review subject">
              {SUBJECTS.map((item) => (
                <button
                  type="button"
                  key={item}
                  aria-pressed={subject === item}
                  onClick={() => onSubjectChange(item)}
                >
                  {item === 'content' ? 'Content' : 'Schema'}
                </button>
              ))}
            </nav>
            <nav className={styles.views} aria-label="Review views">
              {VIEWS.map(({ id, label, detail, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  aria-label={label}
                  aria-current={pane === id ? 'page' : undefined}
                  onClick={() => onPaneChange(id)}
                >
                  <Icon aria-hidden="true" />
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                </button>
              ))}
            </nav>
          </div>
          <div className={styles.content} data-review-pane={pane} data-review-subject={subject}>
            {children}
          </div>
          {details ? (
            <details className={styles.details}>
              <summary>Version details</summary>
              {details}
            </details>
          ) : null}
        </div>
        <aside className={styles.sidebar} aria-label="Review checks and actions">
          <div className={styles.sidebarContent}>
            <p className={styles.scope}>This review covers Content and Schema together.</p>
            {sidebar}
          </div>
        </aside>
      </div>
    </section>
  );
}
