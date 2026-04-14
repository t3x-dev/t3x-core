'use client';

/**
 * CommitOperationsSidebar — right sidebar for the commit detail page.
 *
 * Sections (top to bottom):
 * 1. Leaves — compact cards with status, assertions, and "+ New" creation
 * 2. Integrations — placeholder for future n8n/runner wiring
 * 3. Sources — conversation and leaf source links
 * 4. Parent — parent commit hash links
 */

import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  GitCommit,
  Leaf as LeafIcon,
  Loader2,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  X,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useCreateLeaf } from '@/hooks/useCreateLeaf';
import { shortHash } from '@/lib/formatters';
import { useCommitDetailStore } from '@/store/commitDetailStore';
import { useProjectStore } from '@/store/projectStore';
import type { Assertion, Constraint, Leaf, LeafType } from '@/types/api';

// ============================================================================
// Types
// ============================================================================

interface CommitOperationsSidebarProps {
  projectId: string;
  commitHash: string;
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
// Helpers
// ============================================================================

function leafStatusIcon(leaf: Leaf) {
  const assertions = leaf.assertions;
  if (!assertions || assertions.length === 0) {
    // Idle — no assertions yet
    return <Minus size={10} className="text-[var(--text-tertiary)]" />;
  }
  const allPassed = assertions.every((a) => a.passed);
  const anyRunning = false; // TODO: wire running state when available
  if (anyRunning) {
    return <RefreshCw size={10} className="animate-spin text-[var(--status-info)]" />;
  }
  if (allPassed) {
    return <Check size={10} className="text-[var(--status-success)]" />;
  }
  return <X size={10} className="text-[var(--status-error)]" />;
}

function assertionBadge(assertions: Assertion[] | null) {
  if (!assertions || assertions.length === 0) return null;
  const passed = assertions.filter((a) => a.passed).length;
  const total = assertions.length;
  const allPassed = passed === total;
  return (
    <span
      className={`ml-auto font-mono text-[9px] ${
        allPassed ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'
      }`}
    >
      {passed}/{total}
    </span>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function AssertionInline({
  assertion,
  constraint,
}: {
  assertion: Assertion;
  constraint: Constraint | undefined;
}) {
  return (
    <div className="py-1">
      <div className="flex items-start gap-1.5">
        {assertion.passed ? (
          <Check size={9} className="mt-0.5 shrink-0 text-[var(--status-success)]" />
        ) : (
          <X size={9} className="mt-0.5 shrink-0 text-[var(--status-error)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="rounded bg-[var(--surface-app)] px-1 py-px text-[8px] font-medium uppercase text-[var(--text-tertiary)] border border-[var(--stroke-divider)]">
              {constraint?.type ?? '?'}
            </span>
            <span className="truncate text-[10px] text-[var(--text-secondary)]">
              {constraint?.value ?? assertion.constraint_id}
            </span>
          </div>
          {!assertion.passed && assertion.lesson && (
            <div className="mt-1 flex items-start gap-1 rounded bg-amber-500/10 px-1.5 py-1 text-[9px]">
              <BookOpen size={8} className="mt-0.5 shrink-0 text-amber-600" />
              <span className="text-amber-900 dark:text-amber-300">{assertion.lesson}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeafCard({
  leaf,
  projectId,
  defaultExpanded,
}: {
  leaf: Leaf;
  projectId: string;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const constraintMap = new Map(leaf.constraints.map((c) => [c.id, c]));
  const hasAssertions = leaf.assertions && leaf.assertions.length > 0;

  return (
    <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-app)]">
      {/* Leaf header row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {/* Expand toggle (only if assertions exist) */}
        {hasAssertions ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 rounded p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] transition-colors"
          >
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}

        {/* Status icon */}
        <span className="shrink-0">{leafStatusIcon(leaf)}</span>

        {/* Title — click navigates to leaf page */}
        <Link
          href={`/project/${projectId}/leaf/${leaf.id}`}
          className="min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          {leaf.title || leaf.id}
        </Link>

        {/* Assertion badge */}
        {assertionBadge(leaf.assertions)}
      </div>

      {/* Expanded assertions list */}
      {expanded && hasAssertions && (
        <div className="border-t border-[var(--stroke-divider)] px-2 py-1">
          {leaf.assertions!.map((assertion) => (
            <AssertionInline
              key={assertion.id}
              assertion={assertion}
              constraint={constraintMap.get(assertion.constraint_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CommitOperationsSidebar({
  projectId,
  commitHash,
  leaves,
  onLeavesChange,
}: CommitOperationsSidebarProps) {
  const router = useRouter();
  const commit = useCommitDetailStore((s) => s.commit);
  const notifyCallback = useProjectStore((s) => s.notifyCallback);
  const { create: createLeaf } = useCreateLeaf();

  // Leaf creation state
  const [leafMenuOpen, setLeafMenuOpen] = useState(false);
  const [leafCreating, setLeafCreating] = useState(false);

  // Sources from commit
  const sourceConversations = (commit?.sources ?? []).filter((s) => s.type === 'conversation');
  const sourceLeafRefs = (commit?.sources ?? []).filter((s) => s.type === 'leaf');

  // ── Handlers ──────────────────────────────────────

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
    <aside className="hidden w-[240px] shrink-0 overflow-y-auto border-l border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 lg:block">
      {/* ═══════ SECTION 1: Leaves ═══════ */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Leaves
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setLeafMenuOpen((prev) => !prev)}
              disabled={leafCreating}
              className="inline-flex items-center gap-1 rounded border border-[var(--stroke-divider)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
            >
              {leafCreating ? <Loader2 size={9} className="animate-spin" /> : <Plus size={9} />}
              New
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

        {/* Leaf cards */}
        {leaves.length > 0 ? (
          <div className="space-y-1.5">
            {leaves.map((leaf, i) => (
              <LeafCard key={leaf.id} leaf={leaf} projectId={projectId} defaultExpanded={i === 0} />
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--text-tertiary)] italic py-2">No leaves yet.</p>
        )}
      </div>

      {/* ═══════ SECTION 2: Integrations ═══════ */}
      <div className="mt-4 border-t border-[var(--stroke-divider)] pt-3">
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          Integrations
        </div>
        <div className="flex items-center gap-1.5 py-2 text-[10px] text-[var(--text-tertiary)] italic">
          <Zap size={10} className="shrink-0 opacity-40" />
          No integrations configured
        </div>
      </div>

      {/* ═══════ SECTION 3: Sources ═══════ */}
      {(sourceConversations.length > 0 || sourceLeafRefs.length > 0) && (
        <div className="mt-4 border-t border-[var(--stroke-divider)] pt-3">
          <div className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Sources
          </div>
          <div className="space-y-1">
            {sourceConversations.map((src) => (
              <Link
                key={src.id}
                href={`/chat/${src.id}`}
                className="group/src flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                <MessageSquare size={10} className="shrink-0 text-[var(--accent-conversation)]" />
                <span className="min-w-0 flex-1 truncate">{src.title || src.id}</span>
                <ChevronRight
                  size={9}
                  className="shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover/src:opacity-100 transition-opacity"
                />
              </Link>
            ))}
            {sourceLeafRefs.map((src) => (
              <Link
                key={src.id}
                href={`/project/${projectId}/leaf/${src.id}`}
                className="group/src flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                <LeafIcon size={10} className="shrink-0 text-[var(--accent-leaf)]" />
                <span className="min-w-0 flex-1 truncate">{src.title || src.id}</span>
                <ChevronRight
                  size={9}
                  className="shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover/src:opacity-100 transition-opacity"
                />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══════ SECTION 4: Parent ═══════ */}
      <div className="mt-4 border-t border-[var(--stroke-divider)] pt-3">
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          Parent
        </div>
        {commit && commit.parents.length > 0 ? (
          <div className="space-y-1">
            {commit.parents.map((parentHash) => (
              <Link
                key={parentHash}
                href={`/project/${projectId}/commit/${encodeURIComponent(parentHash)}`}
                className="group/parent flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
              >
                <GitCommit size={10} className="shrink-0 text-[var(--accent-commit)]" />
                <span className="font-mono">{shortHash(parentHash)}</span>
                <ChevronRight
                  size={9}
                  className="shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover/parent:opacity-100 transition-opacity"
                />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--text-tertiary)] italic py-1">Root commit</p>
        )}
      </div>
    </aside>
  );
}
