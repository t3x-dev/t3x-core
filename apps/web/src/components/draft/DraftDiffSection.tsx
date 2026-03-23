'use client';

/**
 * DraftDiffSection - Collapsible "Changes from Parent" section
 *
 * Shown when draft has a parent_commit_hash.
 * Fetches parent commit once, then recomputes diff locally on sentence changes.
 *
 * TODO: Migrate to FrameYAMLDiff once draft workspace moves from sentence-based
 * to frame-based (SemanticContent). Currently the draft store uses DraftSentence[]
 * which has no frame structure, so frameDiff() cannot be used here yet.
 */

import { Equal, Minus, Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { Badge } from '@/components/ui/badge';
import { getApiCommit } from '@/lib/api';
import type { DiffableSentence, DiffCache } from '@/lib/diffUtils';
import { type CommitDiff, incrementalDiffCommits, type WordDiffSegment } from '@/lib/diffUtils';
import { cn } from '@/lib/utils';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

export function DraftDiffSection() {
  const draft = useDraftWorkspaceStore((s) => s.draft);
  const [parentSentences, setParentSentences] = useState<DiffableSentence[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedHashRef = useRef<string | null>(null);

  const parentHash = draft?.parent_commit_hash;

  // Convert current draft sentences to diffable format
  const draftSentences = useMemo(() => {
    if (!draft) return [];
    return draft.sentences.filter((s) => s.included).map((s) => ({ id: s.id, text: s.text }));
  }, [draft]);

  // Fetch parent commit only when parentHash changes (not on every sentence toggle)
  useEffect(() => {
    if (!parentHash) {
      setParentSentences(null);
      fetchedHashRef.current = null;
      return;
    }

    // Skip re-fetch if already fetched for this hash
    if (fetchedHashRef.current === parentHash) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getApiCommit(parentHash)
      .then((parentCommit) => {
        if (cancelled) return;
        const content = parentCommit.content as import('@t3x-dev/core').SemanticContent;
        const sentences = content.frames.map((frame) => ({
          id: frame.id.startsWith('s_') ? frame.id : `s_${frame.id.replace('f_', '')}`,
          text: `[${frame.type}] ${Object.entries(frame.slots).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : String(v)}`).join('; ')}`,
        }));
        setParentSentences(sentences);
        fetchedHashRef.current = parentHash;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load parent commit');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [parentHash]);

  // Incremental diff cache — persists across renders for fast re-diff
  const diffCacheRef = useRef<DiffCache | null>(null);

  // Reset cache when parent changes (different base commit = new diff context)
  useEffect(() => {
    diffCacheRef.current = null;
  }, [parentHash]);

  // Compute diff incrementally (reuses cached pair results for unchanged sentences)
  const diff = useMemo<CommitDiff | null>(() => {
    if (!parentSentences || draftSentences.length === 0) {
      diffCacheRef.current = null;
      return null;
    }
    const [result, newCache] = incrementalDiffCommits(
      parentSentences,
      draftSentences,
      diffCacheRef.current
    );
    diffCacheRef.current = newCache;
    return result;
  }, [parentSentences, draftSentences]);

  // Don't render if no parent
  if (!parentHash) return null;

  // Build badge text
  const badge = diff
    ? `+${diff.onlyInTarget.length} / -${diff.onlyInSource.length} / ≈${diff.equivalent.length} / ~${diff.similar.length}`
    : loading
      ? '...'
      : '';

  return (
    <CollapsibleSection title="Changes from Parent" badge={badge} defaultOpen={false}>
      {loading && <p className="text-sm text-muted-foreground">Loading diff...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {diff && <DraftDiffContent diff={diff} />}
    </CollapsibleSection>
  );
}

function DraftDiffContent({ diff }: { diff: CommitDiff }) {
  const { identical, equivalent, similar, onlyInSource, onlyInTarget } = diff;

  if (
    identical.length === 0 &&
    equivalent.length === 0 &&
    similar.length === 0 &&
    onlyInSource.length === 0 &&
    onlyInTarget.length === 0
  ) {
    return <p className="text-sm text-muted-foreground">No changes detected.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Stats line */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {identical.length > 0 && <span>{identical.length} identical</span>}
        {equivalent.length > 0 && (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <Equal size={12} />
            {equivalent.length} equivalent
          </span>
        )}
        {onlyInTarget.length > 0 && (
          <span className="flex items-center gap-1 text-[var(--diff-added-accent)]">
            <Plus size={12} />
            {onlyInTarget.length} added
          </span>
        )}
        {onlyInSource.length > 0 && (
          <span className="flex items-center gap-1 text-[var(--diff-removed-accent)]">
            <Minus size={12} />
            {onlyInSource.length} removed
          </span>
        )}
        {similar.length > 0 && (
          <span className="flex items-center gap-1 text-[var(--diff-modified-accent)]">
            <Pencil size={12} />
            {similar.length} modified
          </span>
        )}
      </div>

      {/* Identical sentences (gray stripe) */}
      {identical.map((s) => (
        <div
          key={`id-${s.id}`}
          className="rounded-md border-l-4 border-gray-400 bg-gray-50 dark:bg-gray-900/20 px-3 py-2 text-sm"
        >
          <Badge
            variant="outline"
            className="text-[10px] px-1 py-0 mb-1 text-gray-500 dark:text-gray-400"
          >
            Identical
          </Badge>
          <span className="text-muted-foreground">{s.text}</span>
        </div>
      ))}

      {/* Equivalent pairs (high similarity, green stripe) */}
      {equivalent.map((pair) => (
        <div
          key={`eq-${pair.source.id}-${pair.target.id}`}
          className="rounded-md border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm"
        >
          <Badge
            variant="outline"
            className="text-[10px] px-1 py-0 mb-1 text-green-700 dark:text-green-300"
          >
            Equivalent
          </Badge>
          <WordDiffDisplay segments={pair.wordDiff} />
        </div>
      ))}

      {/* Added sentences (green-accent stripe) */}
      {onlyInTarget.map((s) => (
        <div
          key={s.id}
          className="rounded-md border-l-4 border-[var(--diff-added-accent)] bg-[var(--diff-added-bg)] px-3 py-2 text-sm"
        >
          <span className="text-[var(--diff-added-accent)] font-medium mr-2">+</span>
          {s.text}
        </div>
      ))}

      {/* Removed sentences (red-accent stripe) */}
      {onlyInSource.map((s) => (
        <div
          key={s.id}
          className="rounded-md border-l-4 border-[var(--diff-removed-accent)] bg-[var(--diff-removed-bg)] px-3 py-2 text-sm line-through opacity-75"
        >
          <span className="text-[var(--diff-removed-accent)] font-medium mr-2">-</span>
          {s.text}
        </div>
      ))}

      {/* Modified pairs with word-level diff (amber stripe) */}
      {similar.map((pair) => (
        <div
          key={`mod-${pair.source.id}-${pair.target.id}`}
          className="rounded-md border-l-4 border-amber-500 bg-[var(--diff-modified-bg)] px-3 py-2 text-sm"
        >
          <Badge
            variant="outline"
            className="text-[10px] px-1 py-0 mb-1 text-amber-700 dark:text-amber-300"
          >
            Modified
          </Badge>
          <WordDiffDisplay segments={pair.wordDiff} />
        </div>
      ))}
    </div>
  );
}

function WordDiffDisplay({ segments }: { segments: WordDiffSegment[] }) {
  return (
    <span>
      {segments.map((seg, i) => (
        <span
          key={`${seg.type}-${seg.text.slice(0, 20)}-${i}`}
          className={cn(
            seg.type === 'added' &&
              'bg-[var(--diff-added-accent)]/20 text-[var(--diff-added-accent)]',
            seg.type === 'removed' &&
              'bg-[var(--diff-removed-accent)]/20 text-[var(--diff-removed-accent)] line-through',
            seg.type === 'unchanged' && ''
          )}
        >
          {i > 0 && ' '}
          {seg.text}
        </span>
      ))}
    </span>
  );
}
