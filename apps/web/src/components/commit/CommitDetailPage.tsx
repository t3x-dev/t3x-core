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
 *  │ Frame    │ Frame Cards (scrollable)    │ Source SlideIn /        │
 *  │ Index    │                             │ Context                │
 *  │ Leaves   │                             │                        │
 *  │ Sources  │                             │                        │
 *  ├──────────┴─────────────────────────────┴────────────────────────┤
 *  │ BOTTOM: Provenance Graph (collapsible)                          │
 *  └─────────────────────────────────────────────────────────────────┘
 */

import {
  ArrowLeft,
  ExternalLink,
  Eye,
  GitBranch,
  GitCommit,
  Leaf as LeafIcon,
  Loader2,
  Pin,
  Sparkles,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Commit } from '@t3x-dev/core';
import { FrameGraphView } from '@/components/frame-graph';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { KeyboardHintBar } from '@/components/shared/KeyboardHintBar';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import type { Leaf } from '@/lib/api';
import { getProject, listLeavesByCommit } from '@/lib/api';
import { getCommitAsFrames, getCommitHistoryAsFrames } from '@/lib/api/commitUnified';
import { relativeTime, shortHash } from '@/lib/formatters';
import { PAGE_ANIMATION_STYLES } from '@/lib/pageAnimations';
import { useCommitDetailStore } from '@/store/commitDetailStore';
import { useProjectStore } from '@/store/projectStore';
import { CommitFrameIndex } from './CommitFrameIndex';
import { CopyButton, DotIndicator, useCountUp } from './CommitDetailHelpers';
import { CommitOperationsSidebar } from './CommitOperationsSidebar';
import { ProvenanceGraph } from './CommitProvenanceGraph';
import { CommitYAMLDocument } from './CommitYAMLDocument';
import { SourceSlideIn } from './SourceSlideIn';

// ============================================================================
// Types
// ============================================================================

interface CommitDetailPageProps {
  projectId: string;
  commitHash: string;
}

// ============================================================================
// Component
// ============================================================================

export function CommitDetailPage({ projectId, commitHash }: CommitDetailPageProps) {
  const router = useRouter();
  const notify = useProjectStore((state) => state.notifyCallback);

  // ── Data state ────────────────────────────────────
  const [commit, setCommitLocal] = useState<Commit | null>(null);
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const [commitHistory, setCommitHistory] = useState<Commit[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Store ──────────────────────────────────────────
  const enrichedFrames = useCommitDetailStore((s) => s.enrichedFrames);
  const removedFrames = useCommitDetailStore((s) => s.removedFrames);
  const activeFrameId = useCommitDetailStore((s) => s.activeFrameId);
  const setActiveFrame = useCommitDetailStore((s) => s.setActiveFrame);
  const sourceViewer = useCommitDetailStore((s) => s.sourceViewer);
  const storeSetCommit = useCommitDetailStore((s) => s.setCommit);
  const openSourceViewer = useCommitDetailStore((s) => s.openSourceViewer);

  // ── UI state ──────────────────────────────────────
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  type CommitTab = 'yaml' | 'graph' | 'json' | 'relations';
  const [activeTab, setActiveTab] = useState<CommitTab>('yaml');

  // ── Refs ──────────────────────────────────────────
  const frameRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Fetch data ────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [commitData, leavesData, projectData] = await Promise.all([
          getCommitAsFrames(commitHash),
          listLeavesByCommit(commitHash).catch(() => [] as Leaf[]),
          getProject(projectId).catch(() => null),
        ]);
        setCommitLocal(commitData);
        setLeaves(leavesData);
        if (projectData?.name) setProjectName(projectData.name);

        // Fetch parent commit for diff computation (if single parent)
        let parentCommit: Commit | null = null;
        if (commitData.parents.length === 1) {
          try {
            parentCommit = await getCommitAsFrames(commitData.parents[0]);
          } catch {
            // Parent fetch failure is non-critical
          }
        }

        // Store computes enriched frames automatically
        storeSetCommit(commitData, parentCommit);

        // Fetch commit history
        try {
          const history = await getCommitHistoryAsFrames(commitHash, 10);
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
  }, [commitHash, projectId, storeSetCommit]);

  // ── Frame stats ─────────────────────────────────
  const frameStats = useMemo(
    () => ({
      added: enrichedFrames.filter((f) => f.diffStatus === 'added').length,
      modified: enrichedFrames.filter((f) => f.diffStatus === 'modified').length,
      identical: enrichedFrames.filter((f) => f.diffStatus === 'identical').length,
      removed: removedFrames.length,
    }),
    [enrichedFrames, removedFrames]
  );

  const countIdentical = useCountUp(frameStats.identical);
  const countModified = useCountUp(frameStats.modified);
  const countAdded = useCountUp(frameStats.added);
  const countRemoved = useCountUp(frameStats.removed);

  // ── Frame IDs for keyboard navigation ───────────
  const allFrameIds = useMemo(() => {
    return [
      ...enrichedFrames.map((ef) => ef.frame.id),
      ...removedFrames.map((ef) => ef.frame.id),
    ];
  }, [enrichedFrames, removedFrames]);

  // ── Callbacks ─────────────────────────────────────
  const scrollToFrame = useCallback((id: string) => {
    setActiveFrame(id);
    setTimeout(() => {
      frameRefs.current[id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 50);
  }, [setActiveFrame]);

  // ── Keyboard navigation (shared hook, controlled mode) ──
  useKeyboardNavigation({
    ids: allFrameIds,
    activeId: activeFrameId,
    onSelect: (id) => {
      if (id) scrollToFrame(id);
      else setActiveFrame(null);
    },
  });

  // ── Source info (from V5 commit) ────────────────
  const sourceConversations = useMemo(
    () => commit?.sources?.filter((ref) => ref.type === 'conversation') ?? [],
    [commit?.sources]
  );
  const sourceLeafRefs = useMemo(
    () => commit?.sources?.filter((ref) => ref.type === 'leaf') ?? [],
    [commit?.sources]
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
          <Breadcrumb
            className="text-[13px]"
            segments={[
              { label: projectName || 'Project', href: `/project/${projectId}` },
              ...(commit.branch
                ? [{ label: commit.branch, href: `/project/${projectId}/history` }]
                : []),
              { label: shortHash(commitHash) },
            ]}
          />
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
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
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

          {/* Frame count */}
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
            <Tag size={10} />
            <span className="font-medium text-[var(--text-secondary)]">
              {commit.content.frames.length} frame{commit.content.frames.length !== 1 ? 's' : ''}
            </span>
          </div>

          <span className="h-3 w-px bg-[var(--stroke-divider)]" />

          {/* Relation count */}
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
            <GitBranch size={10} />
            <span className="font-medium text-[var(--text-secondary)]">
              {commit.content.relations.length} relation{commit.content.relations.length !== 1 ? 's' : ''}
            </span>
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

          {/* Schema */}
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
            <Tag size={10} />
            <span className="font-mono text-[10px]">{commit.schema}</span>
          </div>

          {/* Keyboard shortcuts (right-aligned) */}
          <div className="ml-auto">
            <KeyboardHintBar
              hints={[
                { key: 'j k', label: 'navigate' },
                { key: 'esc', label: 'deselect' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ═══════ MAIN CONTENT: 3-Panel Layout ═══════ */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* LEFT: Frame Index */}
        <CommitFrameIndex
          projectId={projectId}
          leaves={leaves}
          onLeavesChange={setLeaves}
        />

        {/* CENTER: Tabbed Panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="flex gap-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 shrink-0">
            {(['yaml', 'graph', 'json', 'relations'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-2 text-[11px] font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-[var(--accent-commit)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-[var(--space-page)]">
            {/* YAML Tab — Nested YAML document */}
            {activeTab === 'yaml' && (
              <div className="mx-auto max-w-3xl">
                <CommitYAMLDocument
                  content={commit.content}
                  onSlotClick={(frameId, slotKey) => {
                    setActiveFrame(frameId);
                    openSourceViewer(slotKey);
                  }}
                />
              </div>
            )}

            {/* GRAPH Tab */}
            {activeTab === 'graph' && (
              <div className="mx-auto max-w-3xl">
                <div className="h-[500px]">
                  <FrameGraphView content={commit.content} className="h-full w-full" />
                </div>
              </div>
            )}

            {/* JSON Tab */}
            {activeTab === 'json' && (
              <div className="mx-auto max-w-3xl">
                <pre className="p-4 bg-[var(--surface-code,#0d1117)] text-[12px] font-mono text-[var(--text-secondary)] overflow-auto rounded-lg">
                  {JSON.stringify(commit, null, 2)}
                </pre>
              </div>
            )}

            {/* RELATIONS Tab */}
            {activeTab === 'relations' && (
              <div className="mx-auto max-w-3xl">
                {commit.content.relations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-sm text-[var(--text-tertiary)] italic">
                      No relations in this commit.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] divide-y divide-[var(--stroke-divider)]">
                    {commit.content.relations.map((rel, i) => (
                      <div key={`${rel.from}-${rel.to}-${i}`} className="flex items-center gap-2 px-4 py-1.5 text-[11px]">
                        <span className="font-mono text-[var(--accent-commit)]">{rel.from}</span>
                        <span className="text-[var(--diff-modified-accent)]">→</span>
                        <span className="text-[var(--text-tertiary)] text-[10px]">{rel.type}</span>
                        <span className="text-[var(--diff-modified-accent)]">→</span>
                        <span className="font-mono text-[var(--accent-commit)]">{rel.to}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Source Slide-In (pushes center) */}
        {sourceViewer.isOpen && <SourceSlideIn projectId={projectId} />}

        {/* RIGHT: Operations Sidebar (always visible) */}
        <CommitOperationsSidebar
          projectId={projectId}
          commitHash={commitHash}
          leaves={leaves}
          onLeavesChange={setLeaves}
        />
      </div>

      {/* ═══════ BOTTOM: Provenance Graph ═══════ */}
      <ProvenanceGraph
        activeSentenceId={activeFrameId}
        commit={commit}
        leaves={leaves}
        projectId={projectId}
        collapsed={bottomCollapsed}
        onToggleCollapse={() => setBottomCollapsed(!bottomCollapsed)}
      />
    </div>
  );
}
