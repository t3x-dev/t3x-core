'use client';

import { ArrowLeft, Search, TableProperties } from 'lucide-react';
import { useMemo, useState } from 'react';
import { inferSchemaName, StateStructureView } from '@/components/project/ProjectStateTab';
import { StateExportButton } from '@/components/shared/StateExportButton';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import { relativeTime, shortHash } from '@/domain/format/formatters';
import { buildStatePointRows } from '@/domain/project/stateViewModel';
import type { ApiCommit } from '@/types/api';
import styles from './HistoryStructure.module.css';

const EMPTY_CONTENT: ApiCommit['content'] = { relations: [], trees: [] };

interface CommitHistoryDiffViewProps {
  commit: ApiCommit;
  onBack: () => void;
  parentCommit: ApiCommit | null;
}

export function CommitHistoryDiffView({
  commit,
  onBack,
  parentCommit,
}: CommitHistoryDiffViewProps) {
  const changes = useMemo(
    () =>
      buildStructuredStateDiff({
        baseline: parentCommit?.content ?? EMPTY_CONTENT,
        head: commit.content,
      }),
    [commit.content, parentCommit?.content]
  );
  const rows = useMemo(() => {
    const result = [...buildStatePointRows(commit.content)];
    const paths = new Set(result.map((row) => row.path));
    // Keep deleted parent groups so their removed values stay inside the original tree.
    // The shared State renderer inserts the deleted leaves from the diff below.
    for (const row of buildStatePointRows(parentCommit?.content ?? EMPTY_CONTENT)) {
      if (!row.expandable || paths.has(row.path)) continue;
      const separator = row.path.lastIndexOf('/');
      const parentPath = separator < 0 ? '' : row.path.slice(0, separator);
      const parentIndex = result.findIndex((candidate) => candidate.path === parentPath);
      let insertAt = parentIndex < 0 ? result.length : parentIndex + 1;
      while (
        parentIndex >= 0 &&
        insertAt < result.length &&
        result[insertAt]!.path.startsWith(`${parentPath}/`)
      )
        insertAt++;
      result.splice(insertAt, 0, row);
      paths.add(row.path);
    }
    return result;
  }, [commit.content, parentCommit?.content]);
  const [pathQuery, setPathQuery] = useState('');
  const parentLabel = parentCommit ? `Parent ${shortHash(parentCommit.hash)}` : 'Empty state';
  const selectedLabel = `Selected ${shortHash(commit.hash)}`;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-1.5">
        <button
          aria-label="Back to commit history"
          title="Back to history"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-[5px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--accent-commit)]"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <h2
          className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]"
          title={commit.message || 'No commit message'}
        >
          {commit.message || 'No commit message'}
        </h2>
        <div className={styles.headerActions}>
          <StateExportButton
            key={commit.hash}
            projectId={commit.project_id}
            commitDigest={commit.hash}
          />
        </div>
      </div>
      <details className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-1.5 text-xs">
        <summary className="cursor-pointer text-[var(--text-secondary)]">Revision details</summary>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-xs text-[var(--text-secondary)]">
          <span className="font-mono">
            {parentLabel} → {selectedLabel}
          </span>
          <span>{commit.branch || 'detached'}</span>
          <span>{commit.author?.name || commit.author?.type || 'unknown'}</span>
          <span>{relativeTime(commit.committed_at)}</span>
          {commit.parents.length > 1 && <span>First-parent comparison</span>}
        </div>
      </details>

      <div className={styles.frame}>
        <StateStructureView
          historyToolbar={(visibleRowCount) => (
            <div className={styles.treeToolbar}>
              <div className={styles.treeHeading}>
                <span className="inline-flex items-center gap-2 font-medium text-[var(--accent-commit)]">
                  <TableProperties aria-hidden="true" className="size-3.5" /> Structure
                </span>
                <span className="text-[var(--diff-added-text)]">
                  + {changes.filter((change) => change.kind === 'added').length} added
                </span>
                <span className="text-[var(--diff-modified-text)]">
                  ~ {changes.filter((change) => change.kind === 'modified').length} modified
                </span>
                <span className="text-[var(--diff-removed-text)]">
                  − {changes.filter((change) => change.kind === 'removed').length} removed
                </span>
                {changes.length === 0 && (
                  <span className="text-[var(--text-tertiary)]">No state changes</span>
                )}
              </div>
              <div className={styles.treeSearch}>
                <label className="relative w-64 max-w-full">
                  <Search
                    aria-hidden="true"
                    className="absolute left-2.5 top-2 size-3.5 text-[var(--text-tertiary)]"
                  />
                  <input
                    aria-label="Search historical state"
                    className="h-8 w-full rounded-[5px] border border-[var(--stroke-divider)] bg-[var(--surface-card)] pl-8 pr-3 text-[13px] outline-none focus:border-[var(--accent-commit)]"
                    value={pathQuery}
                    onChange={(event) => setPathQuery(event.target.value)}
                    placeholder="Search state..."
                  />
                </label>
                <span>{visibleRowCount} visible rows</span>
              </div>
            </div>
          )}
          key={commit.hash}
          branch={commit.branch || 'detached'}
          changeReason={commit.message || ''}
          diffChanges={changes}
          headCommit={commit}
          modifiedLabel={relativeTime(commit.committed_at)}
          pathQuery={pathQuery}
          rows={rows}
          inlineDiff
          historyPresentation
          onHistoryReveal={() => setPathQuery('')}
          nodeHistoryEnabled
          schemaName={inferSchemaName(commit)}
          validationIssues={[]}
          validationReady={false}
          readOnly
        />
      </div>
    </div>
  );
}
