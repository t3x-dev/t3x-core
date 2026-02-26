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
import type { CommitV4, DiffResultRaw } from '@/lib/api';
import { diffRaw, getCommitV4 } from '@/lib/api';
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
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
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
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">:(</div>
          <h1 className="text-xl font-semibold mb-2">Failed to load diff</h1>
          <p className="text-muted-foreground mb-4">{error || 'Unknown error'}</p>
          <button
            type="button"
            onClick={handleBack}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Back to canvas
          </button>
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

      {/* Layer 2: Stats Bar */}
      <DiffStatsBar
        identical={diffData.stats.sameCount}
        modified={diffData.stats.modifiedCount}
        added={diffData.stats.addedCount}
        removed={diffData.stats.removedCount}
        onJump={handleJump}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showSnippets={showSnippets}
        onToggleSnippets={() => setShowSnippets((v) => !v)}
      />

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
      />
    </div>
  );
}
