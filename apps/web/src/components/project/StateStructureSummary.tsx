'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { StatePointRow } from '@/domain/project/stateViewModel';
import styles from './StateOverviewView.module.css';

/** The same committed rows as the full inspector, with a bounded sidebar viewport. */
export function StateStructureSummary({
  rows,
  onInspect,
}: {
  rows: StatePointRow[];
  onInspect?: (path?: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const visible: StatePointRow[] = [];
  let hiddenBelow: number | undefined;
  for (const row of rows) {
    if (hiddenBelow !== undefined && row.depth > hiddenBelow) continue;
    hiddenBelow = undefined;
    visible.push(row);
    if (row.expandable && !(expanded[row.id] ?? row.depth === 0)) hiddenBelow = row.depth;
  }
  return (
    <div className={styles.structureTree}>
      {visible.map((row) => (
        <div
          key={row.id}
          className={styles.structureRow}
          style={{ paddingLeft: Math.min(row.depth, 6) * 12 }}
        >
          {row.expandable ? (
            <button
              type="button"
              className={styles.structureToggle}
              aria-label={`${(expanded[row.id] ?? row.depth === 0) ? 'Collapse' : 'Expand'} ${row.path}`}
              aria-expanded={expanded[row.id] ?? row.depth === 0}
              onClick={() =>
                setExpanded((current) => ({
                  ...current,
                  [row.id]: !(current[row.id] ?? row.depth === 0),
                }))
              }
            >
              <ChevronRight aria-hidden="true" />
            </button>
          ) : (
            <span className={styles.structureSpacer} />
          )}
          {onInspect ? (
            <button
              type="button"
              className={styles.structureKey}
              title={row.path}
              aria-label={`Inspect ${row.path}`}
              onClick={() => onInspect(row.path)}
            >
              {row.key || '(empty key)'}
            </button>
          ) : (
            <span className={styles.structureKey}>{row.key || '(empty key)'}</span>
          )}
          <span className={styles.structureValue} title={row.value}>
            {row.expandable ? row.type : row.value}
          </span>
        </div>
      ))}
      {!rows.length ? <p className={styles.sidebarHint}>This State has no nodes.</p> : null}
    </div>
  );
}
