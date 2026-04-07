'use client';

/**
 * DraftDiffSection - Collapsible "Changes from Parent" section
 *
 * Shown when draft has a parent_commit_hash.
 * Fetches parent commit once, then recomputes diff locally on node changes.
 *
 * TODO: Migrate to YAMLDiff once draft workspace moves from node-based
 * to tree-based (SemanticContent). Currently the draft store uses DraftNode[]
 * which has no tree structure, so diffCommits() cannot be used here yet.
 */

import { Equal, Minus, Pencil, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { Badge } from '@/components/ui/badge';
import { getApiCommit } from '@/lib/api';
import type { DiffableNode, DiffCache } from '@/lib/diffUtils';
import { type CommitDiff, incrementalDiffCommits, type WordDiffSegment } from '@/lib/diffUtils';
import { cn } from '@/lib/utils';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

export function DraftDiffSection() {
  const draft = useDraftWorkspaceStore((s) => s.draft);
  const [parentNodes, setParentNodes] = useState<DiffableNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedHashRef = useRef<string | null>(null);

  const parentHash = draft?.parent_commit_hash;

  // Convert current draft nodes to diffable format
  const draftNodes = useMemo(() => {
    if (!draft) return [];
    return draft.nodes.filter((s) => s.included).map((s) => ({ id: s.id, text: s.text }));
  }, [draft]);

  // Fetch parent commit only when parentHash changes (not on every node toggle)
  useEffect(() => {
    if (!parentHash) {
      setParentNodes(null);
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
        const { treesToNodes } = require('@/lib/treeCompat') as typeof import('@/lib/treeCompat');
        const compatNodes = treesToNodes(content.trees);
        const nodes: import('@/lib/diffUtils').DiffableNode[] = compatNodes.map((node) => ({
          id: node.id,
          text: `[${node.type}] ${Object.entries(node.slots)
            .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : String(v)}`)
            .join('; ')}`,
        }));
        setParentNodes(nodes);
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

  // Compute diff incrementally (reuses cached pair results for unchanged nodes)
  const diff = useMemo<CommitDiff | null>(() => {
    if (!parentNodes || draftNodes.length === 0) {
      diffCacheRef.current = null;
      return null;
    }
    const [result, newCache] = incrementalDiffCommits(
      parentNodes,
      draftNodes,
      diffCacheRef.current
    );
    diffCacheRef.current = newCache;
    return result;
  }, [parentNodes, draftNodes]);

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
          <span className="flex items-center gap-1 text-[var(--status-success)]">
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

      {/* Identical nodes (gray stripe) */}
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
          className="rounded-md border-l-4 border-[var(--status-success)] bg-[var(--status-success-muted)] px-3 py-2 text-sm"
        >
          <Badge
            variant="outline"
            className="text-[10px] px-1 py-0 mb-1 text-[var(--status-success)]"
          >
            Equivalent
          </Badge>
          <WordDiffDisplay segments={pair.wordDiff} />
        </div>
      ))}

      {/* Added nodes (green-accent stripe) */}
      {onlyInTarget.map((s) => (
        <div
          key={s.id}
          className="rounded-md border-l-4 border-[var(--diff-added-accent)] bg-[var(--diff-added-bg)] px-3 py-2 text-sm"
        >
          <span className="text-[var(--diff-added-accent)] font-medium mr-2">+</span>
          {s.text}
        </div>
      ))}

      {/* Removed nodes (red-accent stripe) */}
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
          className="rounded-md border-l-4 border-[var(--status-warning)] bg-[var(--diff-modified-bg)] px-3 py-2 text-sm"
        >
          <Badge
            variant="outline"
            className="text-[10px] px-1 py-0 mb-1 text-[var(--status-warning)]"
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
