'use client';

/**
 * Share Page — Read-only viewer for shared entities.
 *
 * Resolves a share token and displays the entity (Leaf or Commit)
 * in a minimal read-only layout without the App Shell (no sidebar).
 */

import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle,
  Clock,
  Coins,
  FileText,
  GitBranch,
  GitCommit,
  Loader2,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import * as api from '@/lib/api';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface RunData {
  runId: string;
  status: string;
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  resultJson?: string | null;
  traceSummaryJson?: string | null;
  createdAt: string;
  metadataJson?: string | null;
}

interface LeafData {
  id: string;
  title?: string;
  type: string;
  output?: string;
  constraints?: Array<{
    id: string;
    type: string;
    value: string;
  }>;
  assertions?: Array<{
    id: string;
    constraint_id: string;
    passed: boolean;
    details: string;
  }>;
}

interface ComparisonData {
  comparisonId: string;
  title: string;
  controlConfig: { model: string; prompt_version: string };
  treatmentConfig: { model: string; prompt_version: string };
  resultSnapshot: Record<string, unknown>;
  createdAt: string;
}

interface CommitData {
  hash: string;
  schema: string;
  parents: string[];
  author: { type?: string; name?: string; id?: string };
  committed_at: string;
  content: {
    sentences?: Array<{ id: string; text: string; confidence?: number }>;
    frames?: Array<{ id: string; type: string; slots: Record<string, unknown> }>;
    relations?: Array<{ from: string; to: string; type: string }>;
  };
  project_id?: string;
  message?: string;
  branch?: string;
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [entity, setEntity] = useState<unknown>(null);

  useEffect(() => {
    if (!token) return;

    api
      .resolveShareLink(token)
      .then((result) => {
        setEntityType(result.token_info.entity_type);
        setEntity(result.entity);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Share link not found or expired');
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Link Not Found</h1>
          <p className="text-[var(--text-secondary)] max-w-md">{error}</p>
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            Go to T3X
          </Button>
        </div>
      </div>
    );
  }

  if (entityType === 'leaf') {
    return <SharedLeafView leaf={entity as LeafData} />;
  }

  if (entityType === 'run') {
    return <SharedRunView run={entity as RunData} />;
  }

  if (entityType === 'comparison') {
    return <SharedComparisonView comparison={entity as ComparisonData} />;
  }

  if (entityType === 'commit') {
    return <SharedCommitView commit={entity as CommitData} />;
  }

  // Fallback for unsupported entity types
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
      <p className="text-[var(--text-secondary)]">Unsupported entity type: {entityType}</p>
    </div>
  );
}

function SharedLeafView({ leaf }: { leaf: LeafData }) {
  return (
    <div className="min-h-screen bg-[var(--surface-app)]">
      {/* Header */}
      <header className={cn('flex h-14 items-center gap-4 px-6 border-b', glass.panelBase)}>
        <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {leaf.title || 'Shared Leaf'}
        </h1>
        <span className="rounded-md bg-[var(--hover-bg)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
          {leaf.type}
        </span>
        <div className="flex-1" />
        <span className="text-xs text-[var(--text-tertiary)]">Shared via T3X</span>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        {/* Output */}
        {leaf.output && (
          <section>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Output</h2>
            <div className={cn('rounded-xl p-4', glass.cardBase, glass.highlight)}>
              <p className="text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                {leaf.output}
              </p>
            </div>
          </section>
        )}

        {/* Constraints */}
        {leaf.constraints && leaf.constraints.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              Constraints ({leaf.constraints.length})
            </h2>
            <div className="space-y-2">
              {leaf.constraints.map((c) => (
                <div key={c.id} className={cn('rounded-lg px-3 py-2 text-sm', glass.cardBase)}>
                  <span className="font-medium text-[var(--text-primary)]">{c.type}: </span>
                  <span className="text-[var(--text-secondary)]">{c.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Assertions */}
        {leaf.assertions && leaf.assertions.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              Assertions ({leaf.assertions.filter((a) => a.passed).length}/{leaf.assertions.length}{' '}
              passed)
            </h2>
            <div className="space-y-2">
              {leaf.assertions.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm flex items-center gap-2',
                    glass.cardBase
                  )}
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      a.passed ? 'bg-[var(--diff-added-accent)]' : 'bg-destructive'
                    )}
                  />
                  <span className="text-[var(--text-primary)]">{a.details}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SharedRunView({ run }: { run: RunData }) {
  let result: ReturnType<typeof JSON.parse> = null;
  let traceSummary: ReturnType<typeof JSON.parse> = null;
  let metadata: ReturnType<typeof JSON.parse> = null;
  try {
    if (run.resultJson) result = JSON.parse(run.resultJson);
  } catch {
    /* corrupt JSON */
  }
  try {
    if (run.traceSummaryJson) traceSummary = JSON.parse(run.traceSummaryJson);
  } catch {
    /* corrupt JSON */
  }
  try {
    if (run.metadataJson) metadata = JSON.parse(run.metadataJson);
  } catch {
    /* corrupt JSON */
  }
  const evalResult = result?.run_report?.eval_result;
  const passed = evalResult?.passed ?? run.status === 'completed';
  const score = evalResult?.score;
  const tags = run.tags ?? [];

  return (
    <div className="min-h-screen bg-[var(--surface-app)]">
      {/* Header */}
      <header className={cn('flex h-14 items-center gap-4 px-6 border-b', glass.panelBase)}>
        <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {run.title || 'Run Report'}
        </h1>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-medium',
            passed
              ? 'bg-green-500/10 text-[var(--status-success)]'
              : 'bg-red-500/10 text-[var(--status-error)]'
          )}
        >
          {passed ? 'Passed' : 'Failed'}
        </span>
        <div className="flex-1" />
        <span className="text-xs text-[var(--text-tertiary)]">Shared via T3X</span>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        {/* Description */}
        {run.description && <p className="text-[var(--text-secondary)]">{run.description}</p>}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-[var(--hover-bg)] px-2 py-0.5 text-xs text-[var(--text-secondary)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {score !== undefined && (
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {Math.round(score * 100)}%
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">Score</p>
            </div>
          )}
          {traceSummary?.latency_ms && (
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                <Clock className="inline h-4 w-4 mr-1" />
                {traceSummary.latency_ms < 1000
                  ? `${Math.round(traceSummary.latency_ms)}ms`
                  : `${(traceSummary.latency_ms / 1000).toFixed(1)}s`}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">Latency</p>
            </div>
          )}
          {traceSummary?.tokens?.total_tokens && (
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                <Coins className="inline h-4 w-4 mr-1" />
                {traceSummary.tokens.total_tokens >= 1000
                  ? `${(traceSummary.tokens.total_tokens / 1000).toFixed(1)}k`
                  : traceSummary.tokens.total_tokens}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">Tokens</p>
            </div>
          )}
          {metadata?.model && (
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                {metadata.model}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">Model</p>
            </div>
          )}
        </div>

        {/* Assertions */}
        {result?.assertions && result.assertions.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              Assertions (
              {result.assertions.filter((a: { type: string }) => a.type === 'pass').length}/
              {result.assertions.length} passed)
            </h2>
            <div className="space-y-2">
              {(
                result.assertions as Array<{
                  id?: string;
                  type: string;
                  message: string;
                  category?: string;
                }>
              ).map((a, i) => (
                <div
                  key={a.id || `a-${i}`}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm flex items-center gap-2',
                    glass.cardBase
                  )}
                >
                  {a.type === 'pass' ? (
                    <CheckCircle className="h-4 w-4 shrink-0 text-[var(--diff-added-accent)]" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span className="text-[var(--text-primary)]">{a.message}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SharedComparisonView({ comparison }: { comparison: ComparisonData }) {
  const snap = comparison.resultSnapshot as {
    control?: {
      model: string;
      prompt_version: string;
      run_count: number;
      pass_rate: number;
      avg_score: number;
      avg_latency_ms: number;
      avg_tokens: number;
    };
    treatment?: {
      model: string;
      prompt_version: string;
      run_count: number;
      pass_rate: number;
      avg_score: number;
      avg_latency_ms: number;
      avg_tokens: number;
    };
    winner?: string | null;
  };

  const control = snap.control;
  const treatment = snap.treatment;
  const winner = snap.winner;

  return (
    <div className="min-h-screen bg-[var(--surface-app)]">
      {/* Header */}
      <header className={cn('flex h-14 items-center gap-4 px-6 border-b', glass.panelBase)}>
        <ArrowLeftRight className="h-5 w-5 text-[var(--text-secondary)]" />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {comparison.title || 'Shared Comparison'}
        </h1>
        {winner && winner !== 'tie' && (
          <span className="rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-[var(--status-success)]">
            <Trophy className="inline h-3 w-3 mr-1" />
            {winner === 'control' ? 'Control wins' : 'Treatment wins'}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-[var(--text-tertiary)]">Shared via T3X</span>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        {/* Config Cards */}
        {control && treatment && (
          <div className="grid grid-cols-2 gap-4">
            <div className={cn('rounded-xl p-4', glass.cardBase)}>
              <p className="text-xs text-[var(--text-tertiary)] mb-1">Control (A)</p>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {control.model} + {control.prompt_version}
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">n = {control.run_count}</p>
            </div>
            <div className={cn('rounded-xl p-4', glass.cardBase)}>
              <p className="text-xs text-[var(--text-tertiary)] mb-1">Treatment (B)</p>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {treatment.model} + {treatment.prompt_version}
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">n = {treatment.run_count}</p>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        {control && treatment && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {Math.round(control.pass_rate * 100)}%
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">A Pass Rate</p>
            </div>
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {Math.round(treatment.pass_rate * 100)}%
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">B Pass Rate</p>
            </div>
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {control.avg_score.toFixed(2)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">A Avg Score</p>
            </div>
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {treatment.avg_score.toFixed(2)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">B Avg Score</p>
            </div>
          </div>
        )}

        {/* Latency + Tokens */}
        {control && treatment && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-lg font-bold text-[var(--text-primary)]">
                <Clock className="inline h-4 w-4 mr-1" />
                {control.avg_latency_ms < 1000
                  ? `${Math.round(control.avg_latency_ms)}ms`
                  : `${(control.avg_latency_ms / 1000).toFixed(1)}s`}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">A Latency</p>
            </div>
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-lg font-bold text-[var(--text-primary)]">
                <Clock className="inline h-4 w-4 mr-1" />
                {treatment.avg_latency_ms < 1000
                  ? `${Math.round(treatment.avg_latency_ms)}ms`
                  : `${(treatment.avg_latency_ms / 1000).toFixed(1)}s`}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">B Latency</p>
            </div>
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-lg font-bold text-[var(--text-primary)]">
                <Coins className="inline h-4 w-4 mr-1" />
                {Math.round(control.avg_tokens)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">A Tokens</p>
            </div>
            <div className={cn('rounded-xl p-4 text-center', glass.cardBase)}>
              <p className="text-lg font-bold text-[var(--text-primary)]">
                <Coins className="inline h-4 w-4 mr-1" />
                {Math.round(treatment.avg_tokens)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">B Tokens</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SharedCommitView({ commit }: { commit: CommitData }) {
  const shortHash = commit.hash.replace('sha256:', '').slice(0, 12);
  const sentences = commit.content.sentences ?? [];
  const frames = commit.content.frames ?? [];
  const relations = commit.content.relations ?? [];

  return (
    <div className="min-h-screen bg-[var(--surface-app)]">
      {/* Header */}
      <header className={cn('flex h-14 items-center gap-4 px-6 border-b', glass.panelBase)}>
        <GitCommit className="h-5 w-5 text-[var(--text-secondary)]" />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {commit.message || 'Shared Commit'}
        </h1>
        {commit.branch && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-branch,#8b5cf6)]/30 bg-[var(--accent-branch,#8b5cf6)]/8 px-2 py-0.5 text-xs font-medium text-[var(--accent-branch,#8b5cf6)]">
            <GitBranch size={11} />
            {commit.branch}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-xs text-[var(--text-tertiary)]">Shared via T3X</span>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span className="font-mono text-xs bg-[var(--hover-bg)] px-2 py-0.5 rounded">
            {shortHash}
          </span>
          <span>&middot;</span>
          <span>{commit.author?.name || commit.author?.type || 'unknown'}</span>
          <span>&middot;</span>
          <span>{new Date(commit.committed_at).toLocaleString()}</span>
          {commit.parents.length > 0 && (
            <>
              <span>&middot;</span>
              <span className="text-[var(--text-tertiary)]">
                {commit.parents.length} parent{commit.parents.length !== 1 ? 's' : ''}
              </span>
            </>
          )}
        </div>

        {/* Frames (V5) */}
        {frames.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              Frames ({frames.length})
            </h2>
            <div className="space-y-2">
              {frames.map((frame) => (
                <div key={frame.id} className={cn('rounded-lg px-4 py-3', glass.cardBase)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-[var(--accent-commit,#f59e0b)]">
                      {frame.id}
                    </span>
                    <span className="rounded bg-[var(--hover-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
                      {frame.type}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--text-primary)]">
                    {Object.entries(frame.slots).map(([key, val]) => (
                      <div key={key} className="flex gap-2 py-0.5">
                        <span className="shrink-0 text-[var(--text-tertiary)] text-xs font-mono">
                          {key}:
                        </span>
                        <span className="text-[var(--text-secondary)]">
                          {typeof val === 'string' ? val : JSON.stringify(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Relations */}
        {relations.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              Relations ({relations.length})
            </h2>
            <div
              className={cn('rounded-lg divide-y divide-[var(--stroke-divider)]', glass.cardBase)}
            >
              {relations.map((rel, i) => (
                <div
                  key={`${rel.from}-${rel.to}-${i}`}
                  className="flex items-center gap-2 px-4 py-2 text-xs"
                >
                  <span className="font-mono text-[var(--accent-commit,#f59e0b)]">{rel.from}</span>
                  <span className="text-[var(--text-tertiary)]">{rel.type}</span>
                  <span className="font-mono text-[var(--accent-commit,#f59e0b)]">{rel.to}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sentences (V4 fallback) */}
        {sentences.length > 0 && frames.length === 0 && (
          <section>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              Sentences ({sentences.length})
            </h2>
            <div className="space-y-2">
              {sentences.map((s) => (
                <div key={s.id} className={cn('rounded-lg px-4 py-3', glass.cardBase)}>
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-[var(--text-tertiary)] mt-0.5">
                      {s.id}
                    </span>
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed">{s.text}</p>
                  </div>
                  {s.confidence !== undefined && (
                    <div className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                      confidence: {(s.confidence * 100).toFixed(0)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
