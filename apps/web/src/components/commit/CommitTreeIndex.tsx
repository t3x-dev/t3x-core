'use client';

/**
 * CommitTreeIndex — left sidebar for the tree-based commit detail page.
 *
 * Shows:
 * 1. Tree Index: list of trees with type name, tree ID, and diff status dot.
 * 2. Removed Frames: section below tree index showing removed trees (strikethrough).
 * 3. Leaves: leaf links + "Add" button to create new leaves.
 * 4. Sources: conversation and leaf source links.
 */

import { ChevronRight, Leaf as LeafIcon, Loader2, MessageSquare, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { useCreateLeaf } from '@/hooks/leaves/useCreateLeaf';
import { useCommitDetailStore } from '@/store/commitDetailStore';
import { useProjectStore } from '@/store/projectStore';
import type { Leaf, LeafType } from '@/types/api';
import { DotIndicator } from './CommitDetailHelpers';

// ============================================================================
// Types
// ============================================================================

/** Source reference from a commit */
interface Source {
  type: string;
  id: string;
  title?: string | null;
}

interface CommitTreeIndexProps {
  projectId: string;
  leaves: Leaf[];
  onLeavesChange: (leaves: Leaf[]) => void;
}

// ============================================================================
// Constants
// ============================================================================

const LEAF_TYPE_OPTIONS: { type: LeafType; label: string }[] = [
  { type: 'tweet', label: 'Twitter' },
  { type: 'weibo', label: 'Weibo' },
  { type: 'wechat', label: 'WeChat Moments' },
  { type: 'email', label: 'Email' },
  { type: 'article', label: 'Article' },
  { type: 'slack', label: 'Slack' },
  { type: 'deploy_agent', label: 'Deploy Agent' },
];

// ============================================================================
// Helper — format tree type from snake_case to Title Case
// ============================================================================

function formatNodeType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function TreeStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    identical: 'border-[var(--stroke-divider)] text-[var(--text-tertiary)] bg-transparent',
    same: 'border-[var(--stroke-divider)] text-[var(--text-tertiary)] bg-transparent',
    added:
      'border-[var(--diff-added-accent)]/35 bg-[var(--diff-added-bg)] text-[var(--diff-added-accent)]',
    modified:
      'border-[var(--diff-modified-accent)]/35 bg-[var(--diff-modified-bg)] text-[var(--diff-modified-accent)]',
    removed:
      'border-[var(--diff-removed-accent)]/35 bg-[var(--diff-removed-bg)] text-[var(--diff-removed-accent)]',
  };
  const labels: Record<string, string> = {
    identical: '=',
    same: '=',
    added: '+',
    modified: '~',
    removed: '-',
  };

  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${styles[status] ?? styles.identical}`}
    >
      {labels[status] ?? '='}
    </span>
  );
}

// ============================================================================
// Component
// ============================================================================

export function CommitTreeIndex({ projectId, leaves, onLeavesChange }: CommitTreeIndexProps) {
  const router = useRouter();
  const { create: createLeaf } = useCreateLeaf();

  // Store
  const commit = useCommitDetailStore((s) => s.commit);
  const enrichedNodes = useCommitDetailStore((s) => s.enrichedNodes);
  const removedNodes = useCommitDetailStore((s) => s.removedNodes);
  const activeNodeId = useCommitDetailStore((s) => s.activeNodeId);
  const setActiveNode = useCommitDetailStore((s) => s.setActiveNode);
  const notifyCallback = useProjectStore((s) => s.notifyCallback);

  // Leaf creation state
  const [leafMenuOpen, setLeafMenuOpen] = useState(false);
  const [leafCreating, setLeafCreating] = useState(false);

  // Sources derived from commit
  const sourceConversations: Source[] = (commit?.sources ?? []).filter(
    (src) => src.type === 'conversation'
  );
  const sourceLeafRefs: Source[] = (commit?.sources ?? []).filter((src) => src.type === 'leaf');

  // ── Handlers ──────────────────────────────────────

  const handleNodeClick = useCallback(
    (treeId: string) => {
      setActiveNode(treeId);
      setTimeout(() => {
        document.getElementById(`tree-card-${treeId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 50);
    },
    [setActiveNode]
  );

  const handleCreateLeaf = useCallback(
    async (leafType: LeafType) => {
      if (!commit || leafCreating) return;
      setLeafMenuOpen(false);
      setLeafCreating(true);
      try {
        const label = LEAF_TYPE_OPTIONS.find((o) => o.type === leafType)?.label ?? leafType;
        const leaf = await createLeaf({
          source: { type: 'user' },
          commit_hash: commit.hash,
          type: leafType,
          title: label,
          project_id: projectId,
          constraints: [],
          config: {},
        });
        onLeavesChange([...leaves, leaf]);
        router.push(`/project/${projectId}/leaf/${leaf.id}`);
      } catch (err) {
        const message = formatUserFacingError(err, 'Failed to create leaf.');
        notifyCallback?.(message, 'error');
      } finally {
        setLeafCreating(false);
      }
    },
    [commit, leafCreating, leaves, onLeavesChange, projectId, router, notifyCallback]
  );

  // ── Render ────────────────────────────────────────

  return (
    <aside className="hidden w-[230px] shrink-0 overflow-y-auto border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] md:block">
      {/* Tree Index header */}
      <div className="flex min-h-[38px] items-center justify-between border-b border-[var(--stroke-divider)] px-3 text-[12px] font-semibold text-[var(--text-primary)]">
        <span>Tree Index</span>
        <span className="rounded-full border border-[var(--accent-commit)]/25 bg-[var(--accent-commit)]/8 px-2 py-0.5 font-mono text-[10px] text-[var(--accent-commit)]">
          {enrichedNodes.length}
        </span>
      </div>

      {/* Active trees */}
      {enrichedNodes.map((ef) => (
        <button
          key={ef.path}
          type="button"
          onClick={() => handleNodeClick(ef.path)}
          className={`group flex min-h-[38px] w-full items-center gap-2 border-b border-[var(--stroke-divider)] px-3 text-left transition-colors ${
            activeNodeId === ef.path
              ? 'bg-[var(--accent-commit)]/8 text-[var(--text-primary)]'
              : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <DotIndicator status={ef.diffStatus} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium">{formatNodeType(ef.node.key)}</div>
            <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
              {ef.path}
            </div>
          </div>
          <TreeStatusBadge status={ef.diffStatus} />
        </button>
      ))}

      {/* Removed trees */}
      {removedNodes.length > 0 && (
        <>
          <div className="mt-3 mb-2 px-3 text-[10px] font-semibold uppercase text-[var(--diff-removed-accent)]">
            Removed ({removedNodes.length})
          </div>
          {removedNodes.map((ef) => (
            <div
              key={ef.path}
              className="flex min-h-[38px] w-full items-center gap-2 border-b border-[var(--stroke-divider)] px-3 text-[var(--text-tertiary)] opacity-60"
            >
              <DotIndicator status="removed" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium line-through">
                  {formatNodeType(ef.node.key)}
                </div>
                <div className="truncate font-mono text-[10px] line-through">{ef.path}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Leaves + Sources */}
      <div className="border-t border-[var(--stroke-divider)] px-3 pt-3">
        {/* Leaves header + Add button */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Leaves
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setLeafMenuOpen((prev) => !prev)}
              disabled={leafCreating}
              className="inline-flex items-center gap-1 rounded border border-[var(--stroke-divider)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
            >
              {leafCreating ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
              Add
            </button>
            {leafMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setLeafMenuOpen(false)}
                  onKeyDown={() => {}}
                  role="presentation"
                />
                <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-[var(--radius-lg)] border border-[var(--stroke-default)] bg-[var(--surface-panel)] py-1 shadow-[var(--fx-shadow-md)]">
                  {LEAF_TYPE_OPTIONS.map((opt) => (
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

        {/* Leaf links */}
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

        {/* Sources */}
        {(sourceConversations.length > 0 || sourceLeafRefs.length > 0) && (
          <>
            <div className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
              Sources
            </div>
            {sourceConversations.map((src) => (
              <Link
                key={src.id}
                href={`/chat/${src.id}`}
                className="group/link flex items-center gap-1.5 py-1.5 px-1.5 -mx-1.5 rounded text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] active:bg-[var(--active-bg)] transition-colors"
              >
                <MessageSquare size={10} className="shrink-0 text-[var(--accent-conversation)]" />
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
  );
}
