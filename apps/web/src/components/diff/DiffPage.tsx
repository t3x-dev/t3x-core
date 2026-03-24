'use client';

/**
 * DiffPage — Frame-based diff comparison page.
 *
 * 3-column layout:
 *   Left (160px):  FrameDiffIndex — frame list with diff status icons
 *   Center (flex):  Tabbed content — Diff | Graph | JSON
 *   Right (240px):  Comparison metadata sidebar
 */

import type { Commit, FrameDiff } from '@t3x-dev/core';
import { ArrowLeft, GitBranch, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { relativeTime, shortHash } from '@/components/commit/CommitDetailHelpers';
import { FrameGraphView } from '@/components/frame-graph';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { getCommitAsFrames } from '@/lib/api/commitUnified';
import { API_V1, fetchWithTimeout, handleResponse } from '@/lib/api/core';
import type { CommitMeta, FrameDiffResponse } from '@/lib/api/frameDiff';
import { getFrameDiff } from '@/lib/api/frameDiff';
import { PAGE_ANIMATION_STYLES } from '@/lib/pageAnimations';
import { useProjectStore } from '@/store/projectStore';
import { DiffTreeOverview } from './DiffTreeOverview';
import { DiffYAMLSplitView } from './DiffYAMLSplitView';
import { DiffYAMLUnifiedView } from './DiffYAMLUnifiedView';
import { FrameDiffIndex } from './FrameDiffIndex';

// ============================================================================
// Types
// ============================================================================

interface DiffPageProps {
  projectId: string;
  baseHash: string;
  targetHash: string;
}

type TabId = 'diff' | 'graph' | 'json';

// ============================================================================
// CommitInfoBlock — metadata block for base/target in sidebar
// ============================================================================

function CommitInfoBlock({
  label,
  meta,
  accentColor,
}: {
  label: string;
  meta: CommitMeta;
  accentColor: string;
}) {
  return (
    <div className="space-y-1.5">
      <div
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: accentColor }}
      >
        {label}
      </div>
      <div className="space-y-1 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[var(--text-tertiary)]">{shortHash(meta.hash)}</span>
          {meta.branch && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-[var(--stroke-divider)] px-1.5 py-px text-[10px] text-[var(--text-tertiary)]">
              <GitBranch className="h-2.5 w-2.5" />
              {meta.branch}
            </span>
          )}
        </div>
        {meta.message && (
          <div className="text-[var(--text-secondary)] line-clamp-2">{meta.message}</div>
        )}
        <div className="text-[var(--text-tertiary)]">
          {meta.author?.name ?? meta.author?.type ?? 'unknown'} · {relativeTime(meta.committed_at)}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DiffStatsBlock — summary stats in sidebar
// ============================================================================

function DiffStatsBlock({ diff }: { diff: FrameDiff }) {
  const stats = [
    { label: 'Modified', count: diff.modified.length, color: 'var(--diff-modified-accent)' },
    { label: 'Added', count: diff.onlyInTarget.length, color: 'var(--diff-added-accent)' },
    { label: 'Removed', count: diff.onlyInSource.length, color: 'var(--diff-removed-accent)' },
    { label: 'Identical', count: diff.identical.length, color: 'var(--text-tertiary)' },
  ];

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        Frame Changes
      </div>
      <div className="space-y-1">
        {stats.map(
          (s) =>
            s.count > 0 && (
              <div key={s.label} className="flex items-center justify-between text-[11px]">
                <span style={{ color: s.color }}>{s.label}</span>
                <span className="font-mono text-[var(--text-secondary)]">{s.count}</span>
              </div>
            )
        )}
      </div>
    </div>
  );
}

// ============================================================================
// RelationChangesBlock — relation additions/removals in sidebar
// ============================================================================

function RelationChangesBlock({ diff }: { diff: FrameDiff }) {
  const added = diff.relationsAdded?.length ?? 0;
  const removed = diff.relationsRemoved?.length ?? 0;

  if (added === 0 && removed === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        Relation Changes
      </div>
      <div className="space-y-1">
        {added > 0 && (
          <div className="flex items-center justify-between text-[11px]">
            <span style={{ color: 'var(--diff-added-accent)' }}>Added</span>
            <span className="font-mono text-[var(--text-secondary)]">{added}</span>
          </div>
        )}
        {removed > 0 && (
          <div className="flex items-center justify-between text-[11px]">
            <span style={{ color: 'var(--diff-removed-accent)' }}>Removed</span>
            <span className="font-mono text-[var(--text-secondary)]">{removed}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TabBar
// ============================================================================

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'diff', label: 'Diff' },
  { id: 'graph', label: 'Graph' },
  { id: 'json', label: 'JSON' },
];

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  return (
    <div className="flex shrink-0 border-b border-[var(--stroke-divider)]">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 text-[12px] font-medium transition-colors border-b-2 ${
            activeTab === tab.id
              ? 'border-[var(--accent-commit)] text-[var(--text-primary)]'
              : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Component
// ============================================================================

export function DiffPage({ projectId, baseHash, targetHash }: DiffPageProps) {
  const router = useRouter();

  // State
  const [diffResponse, setDiffResponse] = useState<FrameDiffResponse | null>(null);
  const [targetCommit, setTargetCommit] = useState<Commit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('diff');
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [showIdentical, setShowIdentical] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [baseCommit, setBaseCommit] = useState<Commit | null>(null);

  // Project name for breadcrumb
  const getProject = useProjectStore((s) => s.getProject);
  const project = getProject(projectId);

  // Data fetching
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getFrameDiff(baseHash, targetHash), getCommitAsFrames(targetHash), getCommitAsFrames(baseHash)])
      .then(([diffResp, tgtCommit, baseCommitData]) => {
        if (cancelled) return;
        setDiffResponse(diffResp);
        setTargetCommit(tgtCommit);
        setBaseCommit(baseCommitData);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [baseHash, targetHash]);

  // Handlers
  const handleBack = useCallback(() => {
    router.push(`/project/${projectId}`);
  }, [router, projectId]);

  const handleSelectFrame = useCallback((id: string) => {
    setActiveFrameId(id);
  }, []);

  const handleToggleIdentical = useCallback(() => {
    setShowIdentical((v) => !v);
  }, []);

  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Start merge from diff page
  const handleStartMerge = useCallback(async () => {
    if (!diffResponse) return;
    setMergeLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_V1}/merge/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          source_hash: baseHash,
          target_hash: targetHash,
          source_branch: diffResponse.base.branch || 'source',
          target_branch: diffResponse.target.branch || 'main',
        }),
      });
      const data = await handleResponse<{ draftId: string }>(res);
      router.push(`/project/${projectId}/merge/${data.draftId}`);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Failed to create merge draft');
    } finally {
      setMergeLoading(false);
    }
  }, [diffResponse, projectId, baseHash, targetHash, router]);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
          <span className="text-[var(--text-tertiary)]">Loading diff...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !diffResponse) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <div className="flex flex-col items-center justify-center p-8 text-center max-w-md">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Failed to load diff</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {error || 'An unexpected error occurred'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={handleBack}
              className="px-4 py-2 bg-[var(--surface-card)] border border-[var(--stroke-default)] text-[var(--text-primary)] rounded-md hover:bg-[var(--hover-bg)] text-sm"
            >
              Back to canvas
            </button>
          </div>
        </div>
      </div>
    );
  }

  const diff = diffResponse.diff;

  return (
    <div className="flex flex-col h-screen bg-[var(--surface-app)]">
      <style>{PAGE_ANIMATION_STYLES}</style>

      {/* ═══════ HEADER ═══════ */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4">
        <div className="flex items-center gap-3">
          {/* Back button */}
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Breadcrumb */}
          <Breadcrumb
            className="text-[12px]"
            segments={[
              { label: project?.name ?? 'Project', href: `/project/${projectId}` },
              { label: 'Diff' },
            ]}
          />

          {/* Commit badges */}
          <div className="flex items-center gap-2 ml-3">
            <Link
              href={`/project/${projectId}/commit/${encodeURIComponent(baseHash)}`}
              title={baseHash}
              className="inline-flex items-center rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)] hover:border-[var(--accent-commit)] hover:text-[var(--text-secondary)] transition-colors"
            >
              base: {shortHash(baseHash)}
            </Link>
            <span className="text-[var(--text-tertiary)] text-[10px]">vs</span>
            <Link
              href={`/project/${projectId}/commit/${encodeURIComponent(targetHash)}`}
              title={targetHash}
              className="inline-flex items-center rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)] hover:border-[var(--accent-commit)] hover:text-[var(--text-secondary)] transition-colors"
            >
              target: {shortHash(targetHash)}
            </Link>
          </div>
        </div>
      </header>

      {/* ═══════ BODY: 3-column layout ═══════ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar: Frame index ── */}
        <FrameDiffIndex
          diff={diff}
          activeFrameId={activeFrameId}
          onSelectFrame={handleSelectFrame}
          showIdentical={showIdentical}
          onToggleIdentical={handleToggleIdentical}
        />

        {/* ── Center: Tabbed content ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Tab content */}
          <div className="flex-1 overflow-auto">
            {activeTab === 'diff' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* View mode toggle */}
                <div className="flex items-center justify-end px-4 py-1.5 border-b border-[var(--stroke-divider)]">
                  <div className="flex rounded-md border border-[var(--stroke-divider)] bg-[rgba(255,255,255,0.04)] p-0.5">
                    <button type="button" onClick={() => setViewMode('split')}
                      className={`px-3 py-0.5 rounded text-[11px] font-semibold transition-colors ${viewMode === 'split' ? 'bg-[rgba(255,255,255,0.1)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
                      Split
                    </button>
                    <button type="button" onClick={() => setViewMode('unified')}
                      className={`px-3 py-0.5 rounded text-[11px] font-semibold transition-colors ${viewMode === 'unified' ? 'bg-[rgba(255,255,255,0.1)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
                      Unified
                    </button>
                  </div>
                </div>
                {/* Diff content */}
                <div className="flex-1 overflow-auto">
                  {viewMode === 'split' ? (
                    <DiffYAMLSplitView diff={diff} activeFrameId={activeFrameId} onSelectFrame={handleSelectFrame} showIdentical={showIdentical} />
                  ) : (
                    <DiffYAMLUnifiedView diff={diff} activeFrameId={activeFrameId} onSelectFrame={handleSelectFrame} showIdentical={showIdentical} />
                  )}
                </div>
              </div>
            )}

            {activeTab === 'graph' && targetCommit?.content && (
              <div className="h-full">
                <FrameGraphView content={targetCommit.content} />
              </div>
            )}

            {activeTab === 'json' && (
              <div className="p-[var(--space-page)]">
                <pre className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4 font-mono text-[11px] text-[var(--text-secondary)] overflow-auto max-h-[calc(100vh-200px)]">
                  {JSON.stringify(diff, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar: Metadata ── */}
        <aside className="hidden w-[240px] shrink-0 overflow-y-auto border-l border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 lg:block">
          <div className="space-y-5">
            {/* Base commit info */}
            <CommitInfoBlock
              label="Base"
              meta={diffResponse.base}
              accentColor="var(--diff-removed-accent)"
            />

            <div className="border-t border-[var(--stroke-divider)]" />

            {/* Target commit info */}
            <CommitInfoBlock
              label="Target"
              meta={diffResponse.target}
              accentColor="var(--diff-added-accent)"
            />

            {/* Tree overview */}
            {baseCommit?.content && targetCommit?.content && (
              <>
                <div className="border-t border-[var(--stroke-divider)]" />
                <DiffTreeOverview
                  diff={diff}
                  baseContent={baseCommit.content}
                  targetContent={targetCommit.content}
                />
              </>
            )}

            <div className="border-t border-[var(--stroke-divider)]" />

            {/* Diff stats */}
            <DiffStatsBlock diff={diff} />

            {/* Relation changes */}
            <RelationChangesBlock diff={diff} />

            {/* Merge button */}

            <div className="border-t border-[var(--stroke-divider)]" />
            <button
              type="button"
              className="w-full rounded-md border border-[var(--accent-commit)]/30 bg-[var(--accent-commit)]/8 px-3 py-2 text-[12px] font-medium text-[var(--accent-commit)] hover:bg-[var(--accent-commit)]/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleStartMerge}
              disabled={mergeLoading}
            >
              {mergeLoading ? (
                <Loader2 className="inline-block h-3.5 w-3.5 mr-1.5 -mt-0.5 animate-spin" />
              ) : (
                <GitBranch className="inline-block h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              )}
              {mergeLoading ? 'Creating merge...' : 'Start Merge'}
            </button>
            {mergeError && <p className="text-[10px] text-red-400 mt-1">{mergeError}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
