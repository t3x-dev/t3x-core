'use client';

/**
 * CommitDetailPage — full-page 3-panel view for a single committed snapshot.
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │ HEADER: breadcrumb · back · actions (view canvas / fork / export) │
 *  ├─────────────────────────────────────────────────────────────────┤
 *  │ HERO: message · author · time · branch · hash · diff stats     │
 *  ├─────────────────────────────────────────────────────────────────┤
 *  │ LINEAGE: parent · leaves count · sources count · kbd shortcuts │
 *  ├──────────┬─────────────────────────────┬────────────────────────┤
 *  │ LEFT     │ CENTER                      │ RIGHT                  │
 *  │ Sentence │ Sentence Cards (scrollable) │ Context Panel          │
 *  │ Index    │                             │ (source, linked,       │
 *  │ Leaves   │                             │  history, neighbors)   │
 *  │ Sources  │                             │                        │
 *  ├──────────┴─────────────────────────────┴────────────────────────┤
 *  │ BOTTOM: Provenance Graph (collapsible)                          │
 *  └─────────────────────────────────────────────────────────────────┘
 */

import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  GitBranch,
  GitCommit,
  Leaf as LeafIcon,
  Loader2,
  MessageSquare,
  Pin,
  Plus,
  Sparkles,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardHintBar } from '@/components/shared/KeyboardHintBar';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import type { CommitV4, DiffResultRaw, Leaf } from '@/lib/api';
import {
  createLeaf,
  diffRaw,
  getCommitV4,
  getCommitV4History,
  getProject,
  listLeavesByCommit,
} from '@/lib/api';
import type { LeafType } from '@/lib/api/leaves';
import { relativeTime, shortHash } from '@/lib/formatters';
import { PAGE_ANIMATION_STYLES } from '@/lib/pageAnimations';
import { CommitContextPanel } from './CommitContextPanel';
import { CopyButton, DotIndicator, useCountUp } from './CommitDetailHelpers';
import { ConnectionLines, ProvenanceGraph } from './CommitProvenanceGraph';
import { CommitSentenceCard, type SentenceDiffStatus } from './CommitSentenceCard';

// ============================================================================
// Types
// ============================================================================

interface CommitDetailPageProps {
  projectId: string;
  commitHash: string;
}

interface EnrichedSentence {
  id: string;
  text: string;
  confidence: number | undefined;
  diffStatus: SentenceDiffStatus;
  oldText?: string;
  wordDiff?: import('@t3x/core').WordDiffSegment[];
  sourceRef?: {
    conversation_id: string;
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
  inheritedFrom?: string;
}

// CSS animations imported from shared module
// (injected via <style> tag, same pattern as before)

// ============================================================================
// Component
// ============================================================================

export function CommitDetailPage({ projectId, commitHash }: CommitDetailPageProps) {
  const router = useRouter();

  // ── Data state ────────────────────────────────────
  const [commit, setCommit] = useState<CommitV4 | null>(null);
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [diffResult, setDiffResult] = useState<DiffResultRaw | null>(null);
  const [commitHistory, setCommitHistory] = useState<CommitV4[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────
  const [activeSentence, setActiveSentence] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [leafMenuOpen, setLeafMenuOpen] = useState(false);
  const [leafCreating, setLeafCreating] = useState(false);

  // ── Refs ──────────────────────────────────────────
  const sentenceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);

  // ── Fetch data ────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [commitData, leavesData, projectData] = await Promise.all([
          getCommitV4(commitHash),
          listLeavesByCommit(commitHash).catch(() => [] as Leaf[]),
          getProject(projectId).catch(() => null),
        ]);
        setCommit(commitData);
        setLeaves(leavesData);
        if (projectData?.name) setProjectName(projectData.name);

        // Fetch diff vs parent if single parent exists
        if (commitData.parents.length === 1) {
          try {
            const diff = await diffRaw(commitData.parents[0], commitHash);
            setDiffResult(diff);
          } catch {
            // Diff fetch failure is non-critical
          }
        }

        // Fetch commit history
        try {
          const history = await getCommitV4History(commitHash, 10);
          setCommitHistory(history);
        } catch {
          // History fetch failure is non-critical
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load commit');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [commitHash]);

  // ── Build enriched sentences with diff info ───────
  const enrichedSentences = useMemo((): EnrichedSentence[] => {
    if (!commit) return [];

    // Build diff map: segmentId → diffInfo
    const diffMap = new Map<
      string,
      {
        diffType: string;
        matchedText?: string;
        wordDiff?: import('@t3x/core').WordDiffSegment[];
        similarity?: number;
      }
    >();
    if (diffResult) {
      for (const seg of diffResult.segmentDiffs) {
        diffMap.set(seg.segmentId, {
          diffType: seg.diffType,
          matchedText: seg.matchedText,
          wordDiff: seg.wordDiff as import('@t3x/core').WordDiffSegment[],
          similarity: seg.similarity,
        });
      }
    }

    // Derive confidence: prefer sentence.confidence > diff.similarity > nothing.
    // Never fabricate 100% — only show real data.
    function derivedConfidence(
      diff: { diffType: string; similarity?: number } | undefined,
    ): number | undefined {
      if (diff?.similarity != null) return diff.similarity;
      return undefined;
    }

    return commit.content.sentences.map((s) => {
      const diff = diffMap.get(s.id);
      let diffStatus: SentenceDiffStatus = 'identical';
      if (diff) {
        diffStatus = diff.diffType as SentenceDiffStatus;
      } else if (commit.parents.length === 0) {
        diffStatus = 'added'; // Root commit: all sentences are new
      }
      // Normalize 'same' to 'identical'
      if (diffStatus === ('same' as string)) diffStatus = 'identical';

      return {
        id: s.id,
        text: s.text,
        confidence: s.confidence ?? derivedConfidence(diff),
        diffStatus,
        oldText: diff?.matchedText,
        wordDiff: diff?.wordDiff,
        sourceRef: s.source_ref
          ? {
              conversation_id: s.source_ref.conversation_id,
              turn_hash: s.source_ref.turn_hash,
              start_char: s.source_ref.start_char,
              end_char: s.source_ref.end_char,
            }
          : undefined,
        inheritedFrom: s.inherited_from,
      };
    });
  }, [commit, diffResult]);

  // ── Removed sentences from diff ───────────────────
  const removedSentences = useMemo((): EnrichedSentence[] => {
    if (!diffResult) return [];
    return diffResult.segmentDiffs
      .filter((seg) => seg.diffType === 'removed')
      .map((seg) => ({
        id: seg.segmentId,
        text: seg.text,
        confidence: 0,
        diffStatus: 'removed' as SentenceDiffStatus,
      }));
  }, [diffResult]);

  // All sentences (current + removed) for keyboard navigation
  const allSentenceIds = useMemo(() => {
    return [...enrichedSentences.map((s) => s.id), ...removedSentences.map((s) => s.id)];
  }, [enrichedSentences, removedSentences]);

  // ── Diff stats ────────────────────────────────────
  const stats = diffResult?.stats;
  const countIdentical = useCountUp(stats?.sameCount ?? 0);
  const countModified = useCountUp(stats?.modifiedCount ?? 0);
  const countAdded = useCountUp(
    stats?.addedCount ?? (commit?.parents.length === 0 ? enrichedSentences.length : 0)
  );
  const countRemoved = useCountUp(stats?.removedCount ?? 0);

  // ── Source info ───────────────────────────────────
  const sourceConversations = useMemo(
    () => commit?.source_refs?.filter((ref) => ref.type === 'conversation') ?? [],
    [commit?.source_refs]
  );
  const sourceLeafRefs = useMemo(
    () => commit?.source_refs?.filter((ref) => ref.type === 'leaf') ?? [],
    [commit?.source_refs]
  );

  // ── Callbacks ─────────────────────────────────────
  const toggleSource = useCallback((id: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const scrollToSentence = useCallback((id: string) => {
    setActiveSentence(id);
    setTimeout(() => {
      sentenceRefs.current[id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 50);
  }, []);

  // ── Keyboard navigation (shared hook, controlled mode) ──
  useKeyboardNavigation({
    ids: allSentenceIds,
    activeId: activeSentence,
    onSelect: (id) => {
      if (id) scrollToSentence(id);
      else {
        setActiveSentence(null);
        setExpandedSources(new Set());
      }
    },
    onAction: toggleSource,
  });

  // ── Create leaf ──────────────────────────────────
  const leafTypeOptions: { type: LeafType; label: string }[] = [
    { type: 'tweet', label: 'Twitter' },
    { type: 'weibo', label: '微博' },
    { type: 'wechat', label: '朋友圈' },
    { type: 'email', label: 'Email' },
    { type: 'article', label: '文章' },
    { type: 'slack', label: 'Slack' },
    { type: 'deploy_agent', label: 'Deploy Agent' },
  ];

  const handleCreateLeaf = useCallback(
    async (leafType: LeafType) => {
      if (!commit || leafCreating) return;
      setLeafMenuOpen(false);
      setLeafCreating(true);
      try {
        const label = leafTypeOptions.find((o) => o.type === leafType)?.label || leafType;
        const leaf = await createLeaf({
          commit_hash: commit.hash,
          type: leafType,
          title: label,
          project_id: projectId,
          constraints: [],
          config: {},
        });
        setLeaves((prev) => [...prev, leaf]);
        router.push(`/project/${projectId}/leaf/${leaf.id}`);
      } catch (err) {
        console.error('Failed to create leaf:', err);
      } finally {
        setLeafCreating(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, leafCreating, projectId, router]
  );

  // ── Loading state ─────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--surface-app)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--text-tertiary)]" />
          <span className="text-sm text-[var(--text-tertiary)]">Loading commit...</span>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────
  if (error || !commit) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--surface-app)]">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <p className="text-sm text-[var(--status-error)]">{error || 'Commit not found'}</p>
          <button
            type="button"
            onClick={() => router.push(`/project/${projectId}`)}
            className="flex items-center gap-2 text-sm text-[var(--status-info)] hover:underline"
          >
            <ArrowLeft size={14} />
            Back to Canvas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--surface-app)]">
      {/* Shared animation styles */}
      <style>{PAGE_ANIMATION_STYLES}</style>

      {/* ═══════ HEADER ═══════ */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/project/${projectId}`)}
            className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={16} />
          </button>
          <nav className="flex items-center gap-1 text-[13px]">
            <Link
              href={`/project/${projectId}`}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              {projectName || 'Canvas'}
            </Link>
            <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
            {commit.branch && (
              <>
                <Link
                  href={`/project/${projectId}/history`}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  {commit.branch}
                </Link>
                <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
              </>
            )}
            <span className="font-mono text-[var(--text-primary)] font-medium">
              {shortHash(commitHash)}
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-transparent px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)]"
          >
            <Eye size={13} /> View Canvas
          </Link>
          {commit.parents.length === 1 && (
            <Link
              href={`/project/${projectId}/diff?base=${encodeURIComponent(commit.parents[0])}&target=${encodeURIComponent(commitHash)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-transparent px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)]"
            >
              <Sparkles size={13} /> View Diff
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              const data = JSON.stringify(commit, null, 2);
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `commit-${shortHash(commitHash)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--stroke-default)] bg-transparent px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)]"
          >
            <ExternalLink size={13} /> Export
          </button>
        </div>
      </header>

      {/* ═══════ COMPACT HERO + STATS ═══════ */}
      <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-[var(--space-page)] py-3">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-semibold leading-tight text-[var(--text-primary)] tracking-[-0.01em] truncate">
              {commit.message || 'No message'}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]">
                  {commit.author?.type === 'agent' ? (
                    <Sparkles size={9} />
                  ) : (
                    <span className="text-[8px] font-bold">
                      {(commit.author?.name || 'U')[0].toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="font-medium">
                  {commit.author?.name || commit.author?.type || 'unknown'}
                </span>
              </span>
              <span className="text-[var(--text-tertiary)]">&middot;</span>
              <span
                className="text-[var(--text-tertiary)]"
                title={new Date(commit.committed_at).toLocaleString()}
              >
                {relativeTime(commit.committed_at)}
              </span>
              {commit.branch && (
                <>
                  <span className="text-[var(--text-tertiary)]">&middot;</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-branch)]/30 bg-[var(--accent-branch)]/8 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-branch)]">
                    <GitBranch size={9} />
                    {commit.branch}
                  </span>
                </>
              )}
              <span className="text-[var(--text-tertiary)]">&middot;</span>
              <span className="inline-flex items-center gap-0.5 font-mono text-[11px] text-[var(--text-tertiary)]">
                {commitHash.replace('sha256:', '').slice(0, 12)}...
                <CopyButton text={commitHash} size={10} />
              </span>
              {commit.merge_summary && (
                <>
                  <span className="text-[var(--text-tertiary)]">&middot;</span>
                  <span className="rounded-full border border-[var(--accent-branch)]/30 bg-[var(--accent-branch)]/8 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-branch)]">
                    merge
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Stats bar with count-up */}
          <div className="flex items-center gap-2 shrink-0">
            {[
              {
                label: 'identical',
                count: countIdentical,
                symbol: '=',
                style: 'border-[var(--stroke-divider)] text-[var(--text-tertiary)] bg-transparent',
              },
              {
                label: 'modified',
                count: countModified,
                symbol: '~',
                style:
                  'border-[var(--diff-modified-accent)]/40 text-[var(--diff-modified-accent)] bg-[var(--diff-modified-bg)]',
              },
              {
                label: 'added',
                count: countAdded,
                symbol: '+',
                style:
                  'border-[var(--diff-added-accent)]/40 text-[var(--diff-added-accent)] bg-[var(--diff-added-bg)]',
              },
              {
                label: 'removed',
                count: countRemoved,
                symbol: '-',
                style:
                  'border-[var(--diff-removed-accent)]/40 text-[var(--diff-removed-accent)] bg-[var(--diff-removed-bg)]',
              },
            ].map((stat) => (
              <span
                key={stat.label}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${stat.style}`}
              >
                <span className="font-mono">{stat.symbol}</span>
                {stat.count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════ LINEAGE BAR ═══════ */}
      <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-app)] px-[var(--space-page)] py-2">
        <div className="mx-auto flex max-w-6xl items-center gap-4 text-[11px]">
          {/* Parent */}
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
            <GitCommit size={11} className="text-[var(--accent-commit)]" />
            <span>
              {commit.parents.length === 0
                ? 'Root commit'
                : commit.parents.length === 1
                  ? 'Parent:'
                  : 'Parents:'}
            </span>
            {commit.parents.map((parentHash) => (
              <Link
                key={parentHash}
                href={`/project/${projectId}/commit/${encodeURIComponent(parentHash)}`}
                className="font-mono text-[var(--accent-commit)] hover:underline"
              >
                {shortHash(parentHash)}
              </Link>
            ))}
          </div>

          <span className="h-3 w-px bg-[var(--stroke-divider)]" />

          {/* Leaves count */}
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
            <LeafIcon size={10} className="text-[var(--accent-leaf)]" />
            <span className="font-medium text-[var(--text-secondary)]">
              {leaves.length} lea{leaves.length !== 1 ? 'ves' : 'f'}
            </span>
          </div>

          <span className="h-3 w-px bg-[var(--stroke-divider)]" />

          {/* Sources count */}
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
            <Pin size={10} className="text-[var(--accent-conversation)]" />
            <span className="font-medium text-[var(--text-secondary)]">
              {sourceConversations.length + sourceLeafRefs.length} source
              {sourceConversations.length + sourceLeafRefs.length !== 1 ? 's' : ''}
            </span>
          </div>

          <span className="h-3 w-px bg-[var(--stroke-divider)]" />

          {/* Schema / tags */}
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
            <Tag size={10} />
            <span className="font-mono text-[10px]">{commit.schema}</span>
          </div>

          {/* Keyboard shortcuts (right-aligned) */}
          <div className="ml-auto">
            <KeyboardHintBar
              hints={[
                { key: 'j k', label: 'navigate' },
                { key: 'o', label: 'source' },
                { key: 'esc', label: 'deselect' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ═══════ MAIN CONTENT: 3-Panel Layout ═══════ */}
      <div ref={mainAreaRef} className="relative flex flex-1 overflow-hidden">
        {/* SVG Connection Lines Overlay */}
        <ConnectionLines
          activeSentenceId={activeSentence}
          sentenceRefs={sentenceRefs}
          rightPanelRef={rightPanelRef}
          containerRef={mainAreaRef}
        />

        {/* LEFT: Sentence Index */}
        <aside className="hidden w-[200px] shrink-0 overflow-y-auto border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-2 md:block">
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Sentence Index
          </div>
          {enrichedSentences.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToSentence(s.id)}
              className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-200 ${
                activeSentence === s.id
                  ? 'bg-[var(--accent-commit)]/8 text-[var(--text-primary)] sidebar-item-active'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <DotIndicator status={s.diffStatus} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[10px]">{s.id}</div>
                <div className="truncate text-[11px]">{s.text.slice(0, 30)}&hellip;</div>
              </div>
            </button>
          ))}

          {/* Removed sentences */}
          {removedSentences.length > 0 && (
            <>
              <div className="mt-3 mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--diff-removed-accent)]">
                Removed ({removedSentences.length})
              </div>
              {removedSentences.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollToSentence(s.id)}
                  className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-200 ${
                    activeSentence === s.id
                      ? 'bg-[var(--diff-removed-accent)]/8 text-[var(--text-primary)]'
                      : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <DotIndicator status="removed" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[10px]">{s.id}</div>
                    <div className="truncate text-[11px] line-through">
                      {s.text.slice(0, 30)}&hellip;
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {/* Leaf & Source quick links */}
          <div className="mt-4 border-t border-[var(--stroke-divider)] pt-3 px-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                Leaves
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLeafMenuOpen(!leafMenuOpen)}
                  disabled={leafCreating}
                  className="inline-flex items-center gap-1 rounded border border-[var(--stroke-divider)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
                >
                  {leafCreating ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Plus size={10} />
                  )}
                  Add
                </button>
                {leafMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setLeafMenuOpen(false)}
                      onKeyDown={() => {}}
                      role="button"
                      tabIndex={-1}
                    />
                    <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] py-1 shadow-lg">
                      {leafTypeOptions.map((opt) => (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => handleCreateLeaf(opt.type)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
                        >
                          <LeafIcon size={10} className="text-[var(--accent-leaf)]" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            {leaves.length > 0 && (
              <>
                {leaves.map((leaf) => {
                  const passedCount = leaf.assertions?.filter((a) => a.passed).length ?? 0;
                  const totalCount = leaf.assertions?.length ?? 0;
                  return (
                    <Link
                      key={leaf.id}
                      href={`/project/${projectId}/leaf/${leaf.id}`}
                      className="group/link flex items-center gap-1.5 py-1.5 px-1.5 -mx-1.5 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] active:bg-[var(--active-bg)] transition-colors"
                    >
                      <LeafIcon size={10} className="shrink-0 text-[var(--accent-leaf)]" />
                      <span className="truncate flex-1">{leaf.title || leaf.id}</span>
                      {totalCount > 0 && (
                        <span
                          className={`ml-auto font-mono text-[9px] ${
                            passedCount === totalCount
                              ? 'text-[var(--status-success)]'
                              : 'text-[var(--status-error)]'
                          }`}
                        >
                          {passedCount}/{totalCount}
                        </span>
                      )}
                      <ChevronRight
                        size={10}
                        className="shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover/link:opacity-100 transition-opacity"
                      />
                    </Link>
                  );
                })}
              </>
            )}
            {sourceConversations.length > 0 && (
              <>
                <div className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                  Sources
                </div>
                {sourceConversations.map((src) => (
                  <Link
                    key={src.id}
                    href={`/project/${projectId}/conversation/${src.id}`}
                    className="group/link flex items-center gap-1.5 py-1.5 px-1.5 -mx-1.5 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] active:bg-[var(--active-bg)] transition-colors"
                  >
                    <MessageSquare
                      size={10}
                      className="shrink-0 text-[var(--accent-conversation)]"
                    />
                    <span className="truncate flex-1">{src.title || src.id}</span>
                    <ChevronRight
                      size={10}
                      className="shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover/link:opacity-100 transition-opacity"
                    />
                  </Link>
                ))}
                {sourceLeafRefs.map((src) => (
                  <Link
                    key={src.id}
                    href={`/project/${projectId}/leaf/${src.id}`}
                    className="group/link flex items-center gap-1.5 py-1.5 px-1.5 -mx-1.5 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] active:bg-[var(--active-bg)] transition-colors"
                  >
                    <LeafIcon size={10} className="shrink-0 text-[var(--accent-leaf)]" />
                    <span className="truncate flex-1">{src.title || src.id}</span>
                    <ChevronRight
                      size={10}
                      className="shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover/link:opacity-100 transition-opacity"
                    />
                  </Link>
                ))}
              </>
            )}
          </div>
        </aside>

        {/* CENTER: Sentence Cards */}
        <div className="flex-1 overflow-y-auto p-[var(--space-page)]">
          <div className="mx-auto max-w-3xl space-y-3">
            {enrichedSentences.map((s) => (
              <CommitSentenceCard
                key={s.id}
                id={s.id}
                text={s.text}
                confidence={s.confidence}
                diffStatus={s.diffStatus}
                oldText={s.oldText}
                wordDiff={s.wordDiff}
                sourceRef={s.sourceRef}
                inheritedFrom={s.inheritedFrom}
                isActive={activeSentence === s.id}
                isSourceExpanded={expandedSources.has(s.id)}
                onSelect={() => setActiveSentence(s.id)}
                onToggleSource={() => toggleSource(s.id)}
                cardRef={(el) => {
                  sentenceRefs.current[s.id] = el;
                }}
                projectId={projectId}
                parentHashes={commit.parents}
              />
            ))}

            {/* Removed sentences section */}
            {removedSentences.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-bold text-[var(--diff-removed-accent)] uppercase tracking-wider mb-3">
                  Removed from parent ({removedSentences.length})
                </h3>
                <div className="space-y-3">
                  {removedSentences.map((s) => (
                    <CommitSentenceCard
                      key={s.id}
                      id={s.id}
                      text={s.text}
                      confidence={0}
                      diffStatus="removed"
                      isActive={activeSentence === s.id}
                      isSourceExpanded={false}
                      onSelect={() => setActiveSentence(s.id)}
                      onToggleSource={() => {}}
                      cardRef={(el) => {
                        sentenceRefs.current[s.id] = el;
                      }}
                      projectId={projectId}
                      parentHashes={commit.parents}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {enrichedSentences.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-[var(--text-tertiary)] italic">
                  No sentences in this commit.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Context Panel */}
        <CommitContextPanel
          activeSentenceId={activeSentence}
          commit={commit}
          commitHistory={commitHistory}
          projectId={projectId}
          panelRef={rightPanelRef}
        />
      </div>

      {/* ═══════ BOTTOM: Provenance Graph ═══════ */}
      <ProvenanceGraph
        activeSentenceId={activeSentence}
        commit={commit}
        leaves={leaves}
        projectId={projectId}
        collapsed={bottomCollapsed}
        onToggleCollapse={() => setBottomCollapsed(!bottomCollapsed)}
      />
    </div>
  );
}
