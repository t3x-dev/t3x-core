'use client';

import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { authoringSemanticPath } from '@/domain/workspaces/authoringReview';
import { type DraftStructureNode, formatDraftValue } from '@/domain/workspaces/draftStructure';
import { reviewComparisonRows } from '@/domain/workspaces/reviewComparison';
import styles from './WorkspaceReviewWorkbench.module.css';

export function WorkspaceReviewComparison({
  before,
  after,
  subject,
  versionLabel,
}: {
  before: unknown;
  after: unknown;
  subject: 'Content' | 'Schema';
  versionLabel: string;
}) {
  const rows = useMemo(() => reviewComparisonRows(before, after), [before, after]);
  const [selectedPath, setSelectedPath] = useState<string>();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copyStatus, setCopyStatus] = useState('');
  const selected =
    rows.find((row) => row.node.path === selectedPath) ??
    rows.find((row) => row.kind !== 'unchanged' && !row.node.expandable) ??
    rows.find((row) => row.kind !== 'unchanged');
  const hidden = new Set<string>();
  const visible = rows.filter((row) => {
    const parentHidden = Boolean(
      row.node.parentPath !== null &&
        (hidden.has(row.node.parentPath) || collapsed.has(row.node.parentPath))
    );
    if (parentHidden) hidden.add(row.node.path);
    return !parentHidden;
  });
  if (before === undefined || after === undefined)
    return <p>The exact {subject} comparison is unavailable for this revision.</p>;
  if (!rows.some((row) => row.kind !== 'unchanged')) return <p>No {subject} changes.</p>;
  const path = selected ? (authoringSemanticPath(selected.node.path) ?? selected.node.path) : '';
  return (
    <div className={styles.comparison}>
      <div className={styles.comparisonTree}>
        <table className={styles.comparisonTable} aria-label={`${subject} field changes`}>
          <thead>
            <tr>
              <th>Field</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.node.path} data-selected={selected?.node.path === row.node.path}>
                <td>
                  <div
                    className={styles.comparisonField}
                    style={{ paddingInlineStart: Math.min(row.node.depth, 8) * 12 }}
                  >
                    {row.node.expandable ? (
                      <button
                        type="button"
                        aria-label={`Toggle ${row.node.path || '(root)'}`}
                        aria-expanded={!collapsed.has(row.node.path)}
                        onClick={() =>
                          setCollapsed((old) => {
                            const next = new Set(old);
                            if (next.has(row.node.path)) next.delete(row.node.path);
                            else next.add(row.node.path);
                            return next;
                          })
                        }
                      >
                        {collapsed.has(row.node.path) ? (
                          <ChevronRight size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Inspect ${row.node.path}`}
                      aria-pressed={selected?.node.path === row.node.path}
                      onClick={() => {
                        setSelectedPath(row.node.path);
                        setCopyStatus('');
                      }}
                    >
                      {row.node.key}
                    </button>
                  </div>
                </td>
                {row.kind === 'added' || row.kind === 'removed' ? (
                  <td colSpan={2} data-change={row.kind}>
                    <small>{row.kind === 'added' ? '+ Added' : '− Removed'}</small>
                    <ComparisonValue node={row.after ?? row.before} />
                  </td>
                ) : (
                  <>
                    <td data-change={row.kind === 'changed' ? 'removed' : undefined}>
                      <ComparisonValue node={row.before} />
                    </td>
                    <td data-change={row.kind === 'changed' ? 'added' : undefined}>
                      <ComparisonValue node={row.after} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected ? (
        <aside className={styles.comparisonDetails} aria-label={`${subject} field Details`}>
          <header>
            <h2>{selected.node.key}</h2>
            <span>{versionLabel}</span>
          </header>
          <code className={styles.exactPath}>{path || '(root)'}</code>
          <Button
            size="sm"
            variant="canvas-ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(path);
                setCopyStatus('Path copied');
              } catch {
                setCopyStatus('Could not copy. Select the path above.');
              }
            }}
          >
            <Copy size={13} aria-hidden="true" />
            Copy path
          </Button>
          <output className={styles.copyStatus}>{copyStatus}</output>
          <div
            className={styles.comparisonValues}
            data-single-side={!selected.before || !selected.after}
          >
            {selected.before ? (
              <section data-change={selected.kind === 'unchanged' ? undefined : 'removed'}>
                <h3>Before</h3>
                <pre>{formatDraftValue(selected.before.value) || '""'}</pre>
              </section>
            ) : null}
            {selected.after ? (
              <section data-change={selected.kind === 'unchanged' ? undefined : 'added'}>
                <h3>After</h3>
                <pre>{formatDraftValue(selected.after.value) || '""'}</pre>
              </section>
            ) : null}
          </div>
          <p className={styles.missingMetadata}>
            Field action, time and source are not recorded in this comparison.
          </p>
        </aside>
      ) : null}
    </div>
  );
}

function ComparisonValue({ node }: { node?: DraftStructureNode }) {
  return (
    <span className={styles.comparisonValue}>
      {node ? node.preview || (node.value === '' ? '""' : 'empty') : 'Not present'}
    </span>
  );
}
