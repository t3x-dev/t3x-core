'use client';

import { ArrowLeft, GitCommit } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { T3XDiff } from '@/components/shared/T3XDiff';
import { Badge } from '@/components/ui/badge';
import { buildStructuredStateDiff } from '@/domain/diff/structuredStateDiff';
import { relativeTime, shortHash } from '@/domain/format/formatters';
import type { ApiCommit } from '@/types/api';

interface CommitT3XDiffViewProps {
  backLabel: string;
  commit: ApiCommit;
  onBack: () => void;
  parentCommit: ApiCommit | null;
  projectName: string;
}

export function CommitT3XDiffView({
  backLabel,
  commit,
  onBack,
  parentCommit,
  projectName,
}: CommitT3XDiffViewProps) {
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
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-app)]">
      <header className="flex min-h-[var(--h-header)] shrink-0 flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2">
        <button
          aria-label={`Back to ${backLabel}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="size-3.5" />
          {backLabel}
        </button>
        <Breadcrumb
          className="text-[12px]"
          segments={[
            { label: projectName || 'Project' },
            { label: 'History' },
            { label: shortHash(commit.hash) },
          ]}
        />
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3">
          <section className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3 shadow-sm">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {commit.message || 'No commit message'}
              </h1>
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
      </main>
    </div>
  );
}
