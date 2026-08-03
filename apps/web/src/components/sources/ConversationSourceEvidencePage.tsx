'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileClock,
  GitBranch,
  GitCommit,
  Loader2,
  MessageSquare,
  Settings,
  ShieldQuestion,
  Terminal,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ErrorMessage, LoadingSpinner } from '@/components/layout/ApiStatus';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { repositoryConversationSourceHref } from '@/domain/sourceEvidenceNavigation';
import { useSourceEvidenceReader } from '@/hooks/sources/useSourceEvidenceReader';
import type { ConversationSourceEvidence, SourceAvailabilityMode } from '@/types/sourceEvidence';
import { safeInternalReturnTo, withReturnTo } from '@/utils/navigationReturn';

interface ConversationSourceEvidencePageProps {
  projectId: string;
  conversationId: string;
  branch?: string | null;
  commitId?: string | null;
  turnHash?: string | null;
  returnTo?: string | null;
}

const PAGE_SIZE = 100;

const modePresentation: Record<
  SourceAvailabilityMode,
  { label: string; title: string; description: string; className: string }
> = {
  available: {
    label: 'Available',
    title: 'Source is available',
    description: 'The repository can resolve this source and its complete turn history.',
    className:
      'border-[var(--status-success)]/30 bg-[var(--status-success-muted)] text-[var(--status-success)]',
  },
  partial: {
    label: 'Partial',
    title: 'Source is partially loaded',
    description: 'Some immutable turns are outside the current page. Nothing missing is assumed.',
    className:
      'border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] text-[var(--status-warning)]',
  },
  unavailable: {
    label: 'Unavailable',
    title: 'Source is unavailable',
    description: 'Evidence remains, but the repository cannot resolve the source record.',
    className:
      'border-[var(--status-error)]/30 bg-[var(--status-error-muted)] text-[var(--status-error)]',
  },
};

const roleIcons = {
  user: User,
  assistant: Bot,
  system: Settings,
  tool: Terminal,
} as const;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function shortDigest(value: string): string {
  const digest = value.replace(/^sha256:/, '');
  return digest.length > 14 ? `${digest.slice(0, 10)}…${digest.slice(-4)}` : digest;
}

function mergePage(
  current: ConversationSourceEvidence,
  next: ConversationSourceEvidence
): ConversationSourceEvidence {
  const seen = new Set(current.turns.items.map((turn) => turn.turn_hash));
  const items = [
    ...current.turns.items,
    ...next.turns.items.filter((turn) => !seen.has(turn.turn_hash)),
  ];
  const complete = items.length >= next.turns.total;
  const reasons = complete
    ? next.availability.reasons.filter((reason) => reason !== 'TURN_PAGE_INCOMPLETE')
    : next.availability.reasons;
  const mode: SourceAvailabilityMode =
    next.source === null ? 'unavailable' : !complete ? 'partial' : 'available';

  return {
    ...next,
    availability: { mode, reasons },
    turns: {
      ...next.turns,
      items,
      offset: 0,
      completeness: complete ? 'complete' : 'partial',
    },
  };
}

function AvailabilityNotice({ mode }: { mode: SourceAvailabilityMode }) {
  const presentation = modePresentation[mode];
  const Icon =
    mode === 'available' ? CheckCircle2 : mode === 'unavailable' ? AlertTriangle : FileClock;
  return (
    <div className={`rounded-xl border px-4 py-3 ${presentation.className}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{presentation.title}</p>
          <p className="mt-0.5 text-xs leading-5 opacity-85">{presentation.description}</p>
        </div>
      </div>
    </div>
  );
}

function TurnCard({
  turn,
  targeted,
  targetRef,
}: {
  turn: ConversationSourceEvidence['turns']['items'][number];
  targeted: boolean;
  targetRef: (node: HTMLDivElement | null) => void;
}) {
  const Icon = roleIcons[turn.role];
  return (
    <article
      ref={targeted ? targetRef : undefined}
      className={`rounded-xl border bg-[var(--surface-card)] p-4 shadow-[var(--fx-shadow-sm)] ${
        targeted
          ? 'border-[var(--accent-commit)] ring-2 ring-[var(--accent-commit)]/15'
          : 'border-[var(--stroke-divider)]'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-conversation)]/10 text-[var(--accent-conversation)]">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-semibold capitalize text-[var(--text-primary)]">
            {turn.role}
          </span>
          {targeted && (
            <span className="rounded-full border border-[var(--accent-commit)]/25 bg-[var(--accent-commit-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-commit)]">
              Referenced turn
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
          <Clock3 className="h-3 w-3" />
          {formatTimestamp(turn.created_at)}
        </span>
      </div>
      <div className="prose prose-sm max-w-none break-words text-[var(--text-primary)] prose-headings:text-[var(--text-primary)] prose-p:text-[var(--text-primary)] prose-code:text-[var(--accent-commit)] dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
      </div>
      {turn.content_blocks && turn.content_blocks.length > 0 && (
        <details className="mt-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-app)] px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-medium text-[var(--text-secondary)]">
            {turn.content_blocks.length} structured content block
            {turn.content_blocks.length === 1 ? '' : 's'}
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-[var(--text-tertiary)]">
            {JSON.stringify(turn.content_blocks, null, 2)}
          </pre>
        </details>
      )}
      <div className="mt-3 border-t border-[var(--stroke-divider)] pt-2 font-mono text-[10px] text-[var(--text-tertiary)]">
        {shortDigest(turn.turn_hash)}
      </div>
    </article>
  );
}

export function ConversationSourceEvidencePage({
  projectId,
  conversationId,
  branch,
  commitId,
  turnHash,
  returnTo,
}: ConversationSourceEvidencePageProps) {
  const [data, setData] = useState<ConversationSourceEvidence | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const fetchSourceEvidence = useSourceEvidenceReader();

  const currentHref = useMemo(
    () =>
      repositoryConversationSourceHref({
        projectId,
        conversationId,
        branch,
        commitId,
        turnHash,
        returnTo,
      }),
    [branch, commitId, conversationId, projectId, returnTo, turnHash]
  );
  const commitHref = commitId
    ? `/project/${encodeURIComponent(projectId)}/commit/${encodeURIComponent(commitId)}`
    : null;
  const backHref = safeInternalReturnTo(
    returnTo,
    commitHref ?? `/project/${encodeURIComponent(projectId)}`
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchSourceEvidence(projectId, conversationId, {
          limit: PAGE_SIZE,
          offset: 0,
          signal,
        });
        setData(result);
      } catch (caught) {
        if (signal?.aborted) return;
        setError(caught instanceof Error ? caught : new Error('Failed to load source evidence.'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [conversationId, fetchSourceEvidence, projectId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!turnHash || !data || !targetRef.current) return;
    targetRef.current.scrollIntoView({ block: 'center' });
  }, [data, turnHash]);

  const loadMore = useCallback(async () => {
    if (!data || loadingMore || data.turns.items.length >= data.turns.total) return;
    setLoadingMore(true);
    try {
      const next = await fetchSourceEvidence(projectId, conversationId, {
        limit: PAGE_SIZE,
        offset: data.turns.items.length,
      });
      setData((current) => (current ? mergePage(current, next) : next));
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('Failed to load more turns.'));
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, data, fetchSourceEvidence, loadingMore, projectId]);

  if (loading && !data) {
    return <LoadingSpinner className="min-h-[60vh]" message="Loading source evidence..." />;
  }

  if (error && !data) {
    return (
      <div className="min-h-[60vh]">
        <ErrorMessage error={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (!data) return null;

  const presentation = modePresentation[data.availability.mode];
  const sourceTitle = data.source?.title || data.source?.alias || 'Conversation source';
  const hasMore = data.turns.items.length < data.turns.total;

  return (
    <div className="min-h-full bg-[var(--surface-app)]">
      <header className="sticky top-0 z-20 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]/95 px-[var(--space-page)] py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={backHref}
              aria-label="Back"
              className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Breadcrumb
              segments={[
                { label: 'Repository', href: `/project/${encodeURIComponent(projectId)}` },
                ...(commitId
                  ? [
                      {
                        label: shortDigest(commitId),
                        href: `/project/${encodeURIComponent(projectId)}/commit/${encodeURIComponent(commitId)}`,
                      },
                    ]
                  : []),
                { label: 'Source evidence' },
              ]}
            />
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${presentation.className}`}
          >
            {presentation.label}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] space-y-5 px-[var(--space-page)] py-6">
        <section className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-5 shadow-[var(--fx-shadow-sm)]">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-conversation)]">
                <MessageSquare className="h-3.5 w-3.5" /> Conversation source
              </div>
              <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                {sourceTitle}
              </h1>
              <p className="mt-2 font-mono text-xs text-[var(--text-tertiary)]">{conversationId}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
              {branch && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2.5 py-1">
                  <GitBranch className="h-3 w-3" /> {branch}
                </span>
              )}
              {commitId && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2.5 py-1 font-mono">
                  <GitCommit className="h-3 w-3" /> {shortDigest(commitId)}
                </span>
              )}
            </div>
          </div>
          {data.source && (
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--stroke-divider)] pt-4 text-xs text-[var(--text-tertiary)]">
              <span>Created {formatTimestamp(data.source.created_at)}</span>
              {data.source.provider && <span>Provider {data.source.provider}</span>}
              {data.source.model && <span>Model {data.source.model}</span>}
            </div>
          )}
        </section>

        <AvailabilityNotice mode={data.availability.mode} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Immutable turns
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  Showing {data.turns.items.length} of {data.turns.total}
                </p>
              </div>
              {data.turns.completeness === 'partial' && (
                <span className="text-[11px] font-medium text-[var(--status-warning)]">
                  Partial history
                </span>
              )}
            </div>

            {data.turns.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-10 text-center">
                <MessageSquare className="mx-auto h-6 w-6 text-[var(--text-tertiary)]" />
                <p className="mt-3 text-sm text-[var(--text-secondary)]">No turns are available.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.turns.items.map((turn) => {
                  const targeted = Boolean(
                    turnHash && (turn.turn_hash === turnHash || turn.turn_hash.startsWith(turnHash))
                  );
                  return (
                    <TurnCard
                      key={turn.turn_hash}
                      turn={turn}
                      targeted={targeted}
                      targetRef={(node) => {
                        if (targeted) targetRef.current = node;
                      }}
                    />
                  );
                })}
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] disabled:opacity-60"
                  >
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Load more turns
                  </button>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4">
              <h2 className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <ShieldQuestion className="h-3.5 w-3.5 text-[var(--accent-commit)]" /> Evidence
                selection
              </h2>
              <p className="mt-3 text-sm font-medium text-[var(--text-secondary)]">
                {data.evidence_selection.turn_hashes.length} immutable turn
                {data.evidence_selection.turn_hashes.length === 1 ? '' : 's'} referenced
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                Proposal and verification evidence is resolved from the committed Transition graph.
              </p>
            </section>

            <section className="rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4">
              <h2 className="text-xs font-semibold text-[var(--text-primary)]">
                Referring commits
              </h2>
              <div className="mt-3 space-y-2">
                {data.referring_commits.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)]">
                    No commit references observed.
                  </p>
                ) : (
                  data.referring_commits.map((reference) => (
                    <Link
                      key={reference.commit_digest}
                      href={withReturnTo(
                        `/project/${encodeURIComponent(projectId)}/commit/${encodeURIComponent(reference.commit_digest)}`,
                        currentHref
                      )}
                      className="block rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 transition-colors hover:border-[var(--accent-commit)]/35 hover:bg-[var(--hover-bg)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                          {reference.intent || 'Repository change'}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                        <span>{shortDigest(reference.commit_digest)}</span>
                        <span>·</span>
                        <span>{reference.evidence_refs.length} evidence ref(s)</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4">
              <h2 className="text-xs font-semibold text-[var(--text-primary)]">Source revisions</h2>
              <div className="mt-3 space-y-2">
                {data.revisions.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)]">
                    No controlled revisions recorded.
                  </p>
                ) : (
                  data.revisions.map((revision) => (
                    <details
                      key={revision.revision_id}
                      className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2"
                    >
                      <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">
                        <span className="font-medium capitalize">{revision.action}</span>{' '}
                        <span className="text-[var(--text-tertiary)]">· {revision.status}</span>
                      </summary>
                      <div className="mt-2 space-y-2 text-[11px] leading-5 text-[var(--text-tertiary)]">
                        {revision.selected_text && (
                          <p className="rounded bg-[var(--status-error-muted)] px-2 py-1 line-through">
                            {revision.selected_text}
                          </p>
                        )}
                        {revision.replacement_text && (
                          <p className="rounded bg-[var(--status-success-muted)] px-2 py-1">
                            {revision.replacement_text}
                          </p>
                        )}
                        <p className="font-mono">turn {shortDigest(revision.turn_hash)}</p>
                      </div>
                    </details>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
