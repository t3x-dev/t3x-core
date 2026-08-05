'use client';

import { ArrowLeft, GitCommit } from 'lucide-react';
import { useMemo, useState } from 'react';
import { T3XDiff } from '@/components/shared/T3XDiff';
import { Badge } from '@/components/ui/badge';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import { relativeTime, shortHash } from '@/domain/format/formatters';
import type { ApiCommit } from '@/types/api';

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
        baseline: parentCommit?.content ?? { relations: [], trees: [] },
        head: commit.content,
      }),
    [commit.content, parentCommit?.content]
  );
  const [selectedChangeId, setSelectedChangeId] = useState('');
  const effectiveSelectedChangeId = changes.some((change) => change.id === selectedChangeId)
    ? selectedChangeId
    : (changes[0]?.id ?? '');
  const parentLabel = parentCommit ? `Parent ${shortHash(parentCommit.hash)}` : 'Empty state';
  const selectedLabel = `Selected ${shortHash(commit.hash)}`;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-3 py-4 sm:px-4">
      <button
        aria-label="Back to commit history"
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft className="size-3.5" />
        Back to history
      </button>

      <section className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3 shadow-sm">
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

      <div className="overflow-hidden rounded-md border border-[var(--stroke-divider)] shadow-sm [&>section]:border-t-0">
        <T3XDiff
          baselineLabel={parentLabel}
          changes={changes}
          headerSubtitle={
            parentCommit
              ? 'Commit · Parent → Selected commit'
              : 'Root commit · Empty → Selected commit'
          }
          onSelectChange={setSelectedChangeId}
          pathSubtitle="Committed state · node-level result"
          projectedLabel={selectedLabel}
          selectedChangeId={effectiveSelectedChangeId}
        />
      </div>
    </div>
  );
}
