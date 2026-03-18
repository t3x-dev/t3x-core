'use client';

/**
 * CommitFrameIndex — left sidebar for the frame-based commit detail page.
 *
 * Shows:
 * 1. Frame Index: list of frames with type name, frame ID, and diff status dot.
 * 2. Removed Frames: section below frame index showing removed frames (strikethrough).
 * 3. Leaves: leaf links + "Add" button to create new leaves.
 * 4. Sources: conversation and leaf source links.
 */

import type { Source } from '@t3x-dev/core';
import { ChevronRight, Leaf as LeafIcon, Loader2, MessageSquare, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { Leaf } from '@/lib/api';
import { createLeaf } from '@/lib/api';
import type { LeafType } from '@/lib/api/leaves';
import { useCommitDetailStore } from '@/store/commitDetailStore';
import { useProjectStore } from '@/store/projectStore';
import { DotIndicator } from './CommitDetailHelpers';

// ============================================================================
// Types
// ============================================================================

interface CommitFrameIndexProps {
  projectId: string;
  leaves: Leaf[];
  onLeavesChange: (leaves: Leaf[]) => void;
}

// ============================================================================
// Constants
// ============================================================================

const LEAF_TYPE_OPTIONS: { type: LeafType; label: string }[] = [
  { type: 'tweet', label: 'Twitter' },
  { type: 'weibo', label: '微博' },
  { type: 'wechat', label: '朋友圈' },
  { type: 'email', label: 'Email' },
  { type: 'article', label: '文章' },
  { type: 'slack', label: 'Slack' },
  { type: 'deploy_agent', label: 'Deploy Agent' },
];

// ============================================================================
// Helper — format frame type from snake_case to Title Case
// ============================================================================

function formatFrameType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ============================================================================
// Component
// ============================================================================

export function CommitFrameIndex({ projectId, leaves, onLeavesChange }: CommitFrameIndexProps) {
  const router = useRouter();

  // Store
  const commit = useCommitDetailStore((s) => s.commit);
  const enrichedFrames = useCommitDetailStore((s) => s.enrichedFrames);
  const removedFrames = useCommitDetailStore((s) => s.removedFrames);
  const activeFrameId = useCommitDetailStore((s) => s.activeFrameId);
  const setActiveFrame = useCommitDetailStore((s) => s.setActiveFrame);
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

  const handleFrameClick = useCallback(
    (frameId: string) => {
      setActiveFrame(frameId);
      setTimeout(() => {
        document.getElementById(`frame-card-${frameId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 50);
    },
    [setActiveFrame]
  );

  const handleCreateLeaf = useCallback(
    async (leafType: LeafType) => {
      if (!commit || leafCreating) return;
      setLeafMenuOpen(false);
      setLeafCreating(true);
      try {
        const label = LEAF_TYPE_OPTIONS.find((o) => o.type === leafType)?.label ?? leafType;
        const leaf = await createLeaf({
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
        const message = err instanceof Error ? err.message : 'Failed to create leaf';
        notifyCallback?.(message, 'error');
      } finally {
        setLeafCreating(false);
      }
    },
    [commit, leafCreating, leaves, onLeavesChange, projectId, router, notifyCallback]
  );

  // ── Render ────────────────────────────────────────

  return (
    <aside className="hidden w-[200px] shrink-0 overflow-y-auto border-r border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-2 md:block">
      {/* Frame Index header */}
      <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        Frame Index
      </div>

      {/* Active frames */}
      {enrichedFrames.map((ef) => (
        <button
          key={ef.frame.id}
          type="button"
          onClick={() => handleFrameClick(ef.frame.id)}
          className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-200 ${
            activeFrameId === ef.frame.id
              ? 'bg-[var(--accent-commit)]/8 text-[var(--text-primary)] ring-1 ring-[var(--accent-commit)]/20'
              : 'text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <DotIndicator status={ef.diffStatus} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium">{formatFrameType(ef.frame.type)}</div>
            <div className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
              {ef.frame.id}
            </div>
          </div>
        </button>
      ))}

      {/* Removed frames */}
      {removedFrames.length > 0 && (
        <>
          <div className="mt-3 mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--diff-removed-accent)]">
            Removed ({removedFrames.length})
          </div>
          {removedFrames.map((ef) => (
            <div
              key={ef.frame.id}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[var(--text-tertiary)] opacity-60"
            >
              <DotIndicator status="removed" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-medium line-through">
                  {formatFrameType(ef.frame.type)}
                </div>
                <div className="truncate font-mono text-[10px] line-through">{ef.frame.id}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Leaves + Sources */}
      <div className="mt-4 border-t border-[var(--stroke-divider)] pt-3 px-2">
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
                <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] py-1 shadow-lg">
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
