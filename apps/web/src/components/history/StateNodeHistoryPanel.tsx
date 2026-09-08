'use client';

import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  GitCommit,
  History,
  LoaderCircle,
} from 'lucide-react';
import { useId, useState } from 'react';
import { StateScrollArea } from '@/components/project/StateScrollArea';
import { Badge } from '@/components/ui/badge';
import { relativeTime, shortHash } from '@/domain/format/formatters';
import type {
  StateNodeHistoryEntry,
  StateNodeHistoryValue,
} from '@/domain/project/stateNodeHistory';
import { useStateNodeHistory } from '@/hooks/commits/useStateNodeHistory';
import type { ApiCommit } from '@/types/api';
import { cn } from '@/utils/cn';

export function StateNodeHistoryPanel({
  commit,
  path,
  name,
  onBack,
}: {
  commit: ApiCommit;
  path: string;
  name: string;
  onBack: () => void;
}) {
  const history = useStateNodeHistory(commit, path);
  return (
    <section
      aria-label="Node history"
      className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--surface-card)]"
    >
      <header className="shrink-0 border-b border-[var(--stroke-divider)]">
        <div className="flex h-10 items-center gap-2 px-3">
          <button
            type="button"
            aria-label="Back to change"
            title="Back to change"
            onClick={onBack}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </button>
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">Node history</p>
          <span className="ml-auto text-xs text-[var(--text-tertiary)]">Newest first</span>
        </div>
        <div className="px-4 pb-4 pt-1">
          <h2 className="text-[18px] font-semibold leading-7 text-[var(--text-primary)] [overflow-wrap:anywhere]">
            {name}
          </h2>
          <p
            title={path}
            className="mt-0.5 truncate font-mono text-xs leading-5 text-[var(--text-tertiary)]"
          >
            {path}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <History aria-hidden="true" className="size-3.5 text-[var(--text-tertiary)]" />
            Through{' '}
            <span title={commit.hash} className="font-mono">
              {shortHash(commit.hash)}
            </span>
          </p>
        </div>
      </header>
      <StateScrollArea
        label="Node history entries"
        className="min-h-0 flex-1 [&>[data-slot=state-scroll-area-scrollbar]]:hidden"
      >
        <div className="px-4 py-5">
          <div className="relative before:absolute before:bottom-0 before:left-[7px] before:top-2 before:w-px before:bg-[var(--stroke-divider)]">
            {history.entries.map((entry) => (
              <HistoryEntry
                key={entry.commit.hash}
                entry={entry}
                selected={entry.commit.hash === commit.hash}
              />
            ))}
          </div>
          {!history.hasMore && history.entries.length > 0 && (
            <p className="ml-6 mt-4 text-xs text-[var(--text-tertiary)]">
              Beginning of history reached.
            </p>
          )}
        </div>
        {!history.loading && history.entries.length === 0 && !history.error && (
          <p className="p-4 text-[13px] leading-5 text-[var(--text-secondary)]">
            {history.hasMore
              ? 'No changes to this node in the revisions checked so far.'
              : 'No recorded changes for this path.'}
          </p>
        )}
        {history.error && (
          <div
            role="alert"
            className="mx-4 mb-4 flex gap-2 border-l-2 border-[var(--status-error)] bg-[var(--diff-removed-bg)] p-3 text-[13px] leading-5"
          >
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-[var(--status-error)]"
            />
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p className="font-medium text-[var(--status-error)]">History is incomplete.</p>
              <p className="mt-1 text-[var(--text-secondary)]">{history.error}</p>
            </div>
          </div>
        )}
      </StateScrollArea>
      <footer className="shrink-0 space-y-3 border-t border-[var(--stroke-divider)] px-4 py-3">
        <output className="flex items-center gap-2 text-xs leading-4 text-[var(--text-secondary)]">
          {history.loading && (
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 animate-spin motion-reduce:animate-none"
            />
          )}
          {history.loading
            ? 'Checking earlier revisions…'
            : `${history.entries.length} ${history.entries.length === 1 ? 'change' : 'changes'} · ${history.scanned} ${history.scanned === 1 ? 'revision' : 'revisions'} checked`}
        </output>
        {history.hasMore && (
          <button
            type="button"
            disabled={history.loading}
            onClick={() => void history.loadMore()}
            className="h-8 w-full rounded-md border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-3 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          >
            {history.error ? 'Retry loading history' : 'Load older revisions'}
          </button>
        )}
        <details className="group/scope">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] [&::-webkit-details-marker]:hidden">
            History scope{' '}
            <ChevronDown
              aria-hidden="true"
              className="size-3 transition-transform group-open/scope:rotate-180"
            />
          </summary>
          <p className="mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">
            First-parent history through {shortHash(commit.hash)}. Same path only; renames are not
            followed.
          </p>
        </details>
      </footer>
    </section>
  );
}

function HistoryEntry({ entry, selected }: { entry: StateNodeHistoryEntry; selected: boolean }) {
  const tone =
    entry.kind === 'added'
      ? 'border-[var(--diff-added-border)] bg-[var(--diff-added-bg)] text-[var(--diff-added-text)]'
      : entry.kind === 'removed'
        ? 'border-[var(--diff-removed-border)] bg-[var(--diff-removed-bg)] text-[var(--diff-removed-text)]'
        : 'border-[var(--diff-modified-border)] bg-[var(--diff-modified-bg)] text-[var(--diff-modified-text)]';
  return (
    <article
      aria-label={`Node change ${shortHash(entry.commit.hash)}`}
      className="relative min-w-0 pb-6 pl-6 last:pb-0"
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0.5 flex size-4 items-center justify-center bg-[var(--surface-card)] text-[var(--accent-commit)]"
      >
        <GitCommit className="size-4" />
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span
          title={entry.commit.hash}
          className="font-mono text-xs font-medium text-[var(--accent-commit)]"
        >
          {shortHash(entry.commit.hash)}
        </span>
        <Badge
          className={cn('h-5 px-1.5 py-0 text-xs font-medium shadow-none', tone)}
          variant="outline"
        >
          {entry.kind === 'added'
            ? '+ Added'
            : entry.kind === 'removed'
              ? '− Removed'
              : '~ Modified'}
        </Badge>
        <time
          className="ml-auto shrink-0 text-xs italic tabular-nums text-[var(--text-tertiary)]"
          dateTime={entry.commit.committed_at}
          title={entry.commit.committed_at}
        >
          {relativeTime(entry.commit.committed_at)}
        </time>
      </div>
      {entry.commit.message && (
        <p className="mt-2 text-[13px] font-medium leading-5 text-[var(--text-primary)] [overflow-wrap:anywhere]">
          {entry.commit.message}
        </p>
      )}
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-[var(--text-tertiary)]">
        <span className="min-w-0 truncate" title={entry.commit.author?.name}>
          {entry.commit.author?.name || entry.commit.author?.type || 'Unrecorded author'}
        </span>
        {selected && <span className="text-[var(--accent-commit)]">· Selected version</span>}
      </div>
      <div className="mt-3 overflow-hidden rounded-lg">
        <HistoryValue
          label="Before"
          value={entry.before}
          absent="No parent value"
          removed={entry.kind === 'removed'}
        />
        <HistoryValue label="Result" value={entry.after} absent="Removed" />
      </div>
    </article>
  );
}

function HistoryValue({
  label,
  value,
  absent,
  removed = false,
}: {
  label: 'Before' | 'Result';
  value: StateNodeHistoryValue;
  absent: string;
  removed?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const long = value.text.length > 140 || value.text.split('\n').length > 4;
  const result = label === 'Result';
  return (
    <div
      className={cn(
        'min-w-0 px-3 py-2.5',
        value.exists && result
          ? 'bg-[var(--diff-added-bg)]'
          : value.exists && removed
            ? 'bg-[var(--diff-removed-bg)]'
            : 'bg-[var(--surface-panel)]',
        result && 'border-t border-[var(--stroke-divider)]'
      )}
    >
      <p
        className={cn(
          'mb-1 flex items-center gap-1.5 text-xs font-medium',
          value.exists
            ? result
              ? 'text-[var(--diff-added-text)]'
              : 'text-[var(--diff-removed-text)]'
            : 'text-[var(--text-tertiary)]'
        )}
      >
        <span aria-hidden="true" className="w-2 text-center font-mono">
          {value.exists ? (result ? '+' : '−') : '·'}
        </span>
        {label}
      </p>
      <pre
        id={id}
        className={cn(
          'whitespace-pre-wrap font-mono text-[13px] leading-5 [overflow-wrap:anywhere]',
          !value.exists
            ? 'font-sans italic text-[var(--text-tertiary)]'
            : result
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)]',
          long && !expanded && 'line-clamp-4'
        )}
      >
        {value.exists ? value.text : absent}
      </pre>
      {long && (
        <button
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-[var(--accent-commit)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {expanded
            ? `Collapse ${label.toLowerCase()} value`
            : `Show full ${label.toLowerCase()} value`}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-3 transition-transform motion-reduce:transition-none',
              expanded && 'rotate-180'
            )}
          />
        </button>
      )}
    </div>
  );
}
