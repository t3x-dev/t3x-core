'use client';

import { X } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import styles from './SchemaDetailsPanel.module.css';

/** Shared frame for field, node and schema-wide settings. */
export function SchemaDetailsPanel({
  title,
  context,
  contentKey,
  ariaLabel,
  onClear,
  clearDisabled = false,
  children,
}: {
  title: string;
  context: string;
  contentKey: string;
  ariaLabel: string;
  onClear?: () => void;
  clearDisabled?: boolean;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Reset only when switching views/objects, not while editing their settings.
    if (body.current && contentKey) body.current.scrollTop = 0;
  }, [contentKey]);

  return (
    <aside className={styles.panel} aria-label={ariaLabel}>
      <header className={styles.header}>
        <h2>{title}</h2>
        <div className={styles.action}>
          {onClear ? (
            <button
              type="button"
              aria-label="Clear details"
              title="Clear details"
              disabled={clearDisabled}
              onClick={onClear}
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>
      <div className={styles.context} title={context}>
        <p>{context}</p>
      </div>
      <div ref={body} className={styles.body}>
        {children}
      </div>
    </aside>
  );
}
