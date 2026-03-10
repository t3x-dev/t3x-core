'use client';

/**
 * DiffPage — Full-screen diff comparison with three-layer provenance.
 *
 * Layer 0: Page Header (breadcrumb + commit badges)
 * Layer 1: Source Cards (macro provenance — all contributing sources)
 * Layer 2: Stats Bar (stats + view/snippet toggles)
 * Layer 3: Diff Body (sentences with source group headers + context snippets)
 */

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardHintBar } from '@/components/shared/KeyboardHintBar';
import { useKeyboardNavigation } from '@/hooks/useKeyboardNavigation';
import type { CommitV4, DiffResultRaw } from '@/lib/api';
import { diffRaw, getCommitV4 } from '@/lib/api';
import { shortHash } from '@/lib/formatters';
import { useProjectStore } from '@/store/projectStore';
import { DiffHeader } from './DiffHeader';
import type { DiffSideBySideHandle } from './DiffSideBySide';
import { DiffSideBySide } from './DiffSideBySide';
import { DiffSourceCards } from './DiffSourceCards';
import { DiffStatsBar } from './DiffStatsBar';

// ============================================================================
// Types
// ============================================================================

interface DiffPageProps {
  projectId: string;
  baseHash: string;
  targetHash: string;
}

export interface SourceInfo {
  conversationId: string;
  title: string | null;
  type: 'conversation' | 'leaf';
  baseSentenceCount: number;
  targetSentenceCount: number;
  isNew: boolean;
  branch: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

/** Format column label: "branch @ shortHash" or just shortHash */
function formatCommitLabel(branch: string | null | undefined, hash: string): string {
  const short = shortHash(hash);
  return branch ? `${branch} @ ${short}` : short;
}

/** Build source map from both commits' sentences and source_refs */
function buildSourceMap(
  baseCommit: CommitV4 | null,
  targetCommit: CommitV4 | null
): Map<string, SourceInfo> {
  const map = new Map<string, SourceInfo>();

  // Collect commit-level source_refs for titles
  const titleMap = new Map<string, { title: string | null; type: 'conversation' | 'leaf' }>();
  for (const ref of baseCommit?.source_refs ?? []) {
    titleMap.set(ref.id, { title: ref.title ?? null, type: ref.type });
  }
  for (const ref of targetCommit?.source_refs ?? []) {
    titleMap.set(ref.id, { title: ref.title ?? null, type: ref.type });
  }

  // Count sentences per conversation in base
  const baseConvIds = new Set<string>();
  for (const s of baseCommit?.content.sentences ?? []) {
    const convId = s.source_ref?.conversation_id;
    if (!convId) continue;
    baseConvIds.add(convId);
    const existing = map.get(convId);
    if (existing) {
      existing.baseSentenceCount++;
    } else {
      const meta = titleMap.get(convId);
      map.set(convId, {
        conversationId: convId,
        title: meta?.title ?? null,
        type: meta?.type ?? 'conversation',
        baseSentenceCount: 1,
        targetSentenceCount: 0,
        isNew: false,
        branch: baseCommit?.branch ?? null,
      });
    }
  }

  // Count sentences per conversation in target
  for (const s of targetCommit?.content.sentences ?? []) {
    const convId = s.source_ref?.conversation_id;
    if (!convId) continue;
    const existing = map.get(convId);
    if (existing) {
      existing.targetSentenceCount++;
    } else {
      const meta = titleMap.get(convId);
      map.set(convId, {
        conversationId: convId,
        title: meta?.title ?? null,
        type: meta?.type ?? 'conversation',
        baseSentenceCount: 0,
        targetSentenceCount: 1,
        isNew: true,
        branch: targetCommit?.branch ?? null,
      });
    }
  }

  // Mark sources that only appear in target as "new"
  for (const [convId, info] of map) {
    if (!baseConvIds.has(convId)) {
      info.isNew = true;
    }
  }

  return map;
}

// ============================================================================
// Component
// ============================================================================

export function DiffPage({ projectId, baseHash, targetHash }: DiffPageProps) {
  const router = useRouter();
  const sideBySideRef = useRef<DiffSideBySideHandle>(null);

  // State
  const [baseCommit, setBaseCommit] = useState<CommitV4 | null>(null);
  const [targetCommit, setTargetCommit] = useState<CommitV4 | null>(null);
  const [diffData, setDiffData] = useState<DiffResultRaw | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'unified' | 'document'>('document');
  const [showSourceCards, setShowSourceCards] = useState(true);
  const [showSnippets, setShowSnippets] = useState(false);

  // Project name for breadcrumb
  const getProject = useProjectStore((s) => s.getProject);
  const project = getProject(projectId);

  // Data fetching
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getCommitV4(baseHash), getCommitV4(targetHash), diffRaw(baseHash, targetHash)])
      .then(([base, target, diff]) => {
        if (cancelled) return;
        setBaseCommit(base);
        setTargetCommit(target);
        setDiffData(diff);
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

  // Derived: source map
  const sourceMap = useMemo(
    () => buildSourceMap(baseCommit, targetCommit),
    [baseCommit, targetCommit]
  );

  // Derived: source ref titles (conversation ID → title from commit-level source_refs)
  const sourceRefTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const ref of baseCommit?.source_refs ?? []) {
      if (ref.title) map.set(ref.id, ref.title);
    }
    for (const ref of targetCommit?.source_refs ?? []) {
      if (ref.title) map.set(ref.id, ref.title);
    }
    return map;
  }, [baseCommit, targetCommit]);

  // Handlers
  const handleBack = useCallback(() => {
    router.push(`/project/${projectId}`);
  }, [router, projectId]);

  const handleJump = useCallback((section: string) => {
    sideBySideRef.current?.jumpToSection(section);
  }, []);

  const handleScrollToSource = useCallback((conversationId: string) => {
    sideBySideRef.current?.scrollToSource?.(conversationId);
  }, []);

  // Navigable segment IDs for keyboard nav (only changed segments)
  const changedSegmentIds = useMemo(() => {
    if (!diffData) return [];
    return diffData.segmentDiffs.filter((s) => s.diffType !== 'same').map((s) => s.segmentId);
  }, [diffData]);

  // Keyboard navigation for diff changes
  useKeyboardNavigation({
    ids: changedSegmentIds,
    onSelect: (id) => {
      if (id) {
        const el = document.querySelector(`[data-segment-id="${id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    enabled: !loading && !!diffData,
  });

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
  if (error || !diffData) {
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

  const hasSources = sourceMap.size > 0;

  return (
    <div className="flex flex-col h-screen bg-[var(--surface-app)]">
      {/* Layer 0: Page Header */}
      <DiffHeader
        baseCommit={{
          hash: baseHash,
          message: baseCommit?.message,
          branch: baseCommit?.branch,
        }}
        targetCommit={{
          hash: targetHash,
          message: targetCommit?.message,
          branch: targetCommit?.branch,
        }}
        onClose={handleBack}
        mode="page"
        projectName={project?.name}
      />

      {/* Layer 1: Source Cards */}
      {hasSources && (
        <DiffSourceCards
          sourceMap={sourceMap}
          collapsed={!showSourceCards}
          onToggle={() => setShowSourceCards((v) => !v)}
          onScrollToSource={handleScrollToSource}
        />
      )}

      {/* Layer 2: Stats Bar + Keyboard Hints */}
      <DiffStatsBar
        identical={diffData.stats.sameCount}
        equivalent={diffData.stats.equivalentCount ?? 0}
        modified={diffData.stats.modifiedCount}
        added={diffData.stats.addedCount}
        removed={diffData.stats.removedCount}
        onJump={handleJump}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showSnippets={showSnippets}
        onToggleSnippets={() => setShowSnippets((v) => !v)}
      />
      <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-app)] px-6 py-1.5">
        <div className="ml-auto w-fit">
          <KeyboardHintBar
            hints={[
              { key: 'j k', label: 'navigate changes' },
              { key: 'esc', label: 'deselect' },
            ]}
          />
        </div>
      </div>

      {/* Layer 3: Diff Body */}
      <DiffSideBySide
        ref={sideBySideRef}
        segmentDiffs={diffData.segmentDiffs}
        baseSentences={baseCommit?.content.sentences ?? []}
        targetSentences={targetCommit?.content.sentences ?? []}
        projectId={projectId}
        viewMode={viewMode}
        showSnippets={showSnippets}
        groupBySource
        sourceRefTitles={sourceRefTitles}
        baseLabel={formatCommitLabel(baseCommit?.branch, baseHash)}
        targetLabel={formatCommitLabel(targetCommit?.branch, targetHash)}
      />
    </div>
  );
}
