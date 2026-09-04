'use client';

import { ArrowLeft, GitCommit, Search, TableProperties } from 'lucide-react';
import { useMemo, useState } from 'react';
import { inferSchemaName, StateStructureView } from '@/components/project/ProjectStateTab';
import { Badge } from '@/components/ui/badge';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import { relativeTime, shortHash } from '@/domain/format/formatters';
import { buildStatePointRows } from '@/domain/project/stateViewModel';
import type { ApiCommit } from '@/types/api';

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
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2">
        <button
          aria-label="Back to commit history"
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="size-3.5" />
          Back to history
        </button>
        <span className="text-xs text-[var(--text-tertiary)]">
          {parentLabel} → {selectedLabel}
          {commit.parents.length > 1 ? ' · First-parent comparison' : ''}
        </span>
      </div>

      <section className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {commit.message || 'No commit message'}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
            <span className="font-mono">
              {parentCommit ? shortHash(parentCommit.hash) : 'root'} → {shortHash(commit.hash)}
            </span>
            <span>·</span>
            <span>{commit.author?.name || commit.author?.type || 'unknown'}</span>
            <span>·</span>
            <span>{relativeTime(commit.committed_at)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="branch">{commit.branch || 'detached'}</Badge>
          <Badge className="font-mono" variant="commit">
            <GitCommit className="mr-1 size-3" />
            {shortHash(commit.hash)}
          </Badge>
        </div>
      </section>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2">
        <div className="flex flex-wrap items-center gap-4 text-[13px]">
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
      </div>
      <StateStructureView
        key={commit.hash}
        branch={commit.branch || 'detached'}
        changeReason={commit.message || ''}
        diffChanges={changes}
        headCommit={commit}
        modifiedLabel={relativeTime(commit.committed_at)}
        pathQuery={pathQuery}
        rows={rows}
        inlineDiff
        nodeHistoryEnabled
        schemaName={inferSchemaName(commit)}
        validationIssues={[]}
        validationReady={false}
        readOnly
      />
    </div>
  );
}
