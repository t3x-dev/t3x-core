'use client';

/**
 * SourceSlideIn — slide-in panel showing original conversation context
 * for a clicked YAML slot in a tree card.
 *
 * Opens when `sourceViewer.isOpen` is true in commitDetailStore.
 * Auto-scrolls to the referenced turn. Highlights source turn with
 * colored border + reduced opacity on non-source turns.
 */

;
import { ChevronRight, ExternalLink, MessageSquare, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TurnBubble } from '@/components/shared/TurnBubble';
import { listTurns } from '@/lib/api/turns';
import { useCommitDetailStore } from '@/store/commitDetailStore';
import type { TurnBubbleData } from '@/types/sourceContext';

// ============================================================================
// Types
// ============================================================================

interface SourceSlideInProps {
  projectId: string;
}

interface LoadedTurn {
  turn_hash: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: string;
  conversation_id: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve the change status label for the header badge.
 * "changed" = slot existed in parent but differs,
 * "added"   = slot only in current,
 * "source"  = identical / not changed
 */
function resolveChangeStatus(
  _slotKey: string,
  _activeTab: 'previous' | 'current',
  diffStatus: string
): 'changed' | 'added' | 'source' {
  if (diffStatus === 'added') return 'added';
  if (diffStatus === 'modified') return 'changed';
  return 'source';
}

/**
 * Get the `SlotSourceRef` for the active slot from the active node.
 * Searches current tree for 'current' tab, previousNode for 'previous' tab.
 */
function getSlotSource(
  slotKey: string | null,
  _activeTab: 'previous' | 'current',
  _node: unknown,
  _previousNode: unknown
): { turn_hash?: string; turn?: string; start_char?: number; end_char?: number } | undefined {
  if (!slotKey) return undefined;
  const targetNode = (_activeTab === 'previous' ? _previousNode : _node) as
    | { slot_sources?: Record<string, { turn_hash?: string; turn?: string; start_char?: number; end_char?: number }> }
    | undefined;
  return targetNode?.slot_sources?.[slotKey];
}

/**
 * Get string value of a slot for display.
 */
function slotValueToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(slotValueToString).join(', ');
  if (typeof val === 'object' && 'ref' in (val as object)) {
    return `→ ${(val as { ref: string }).ref}`;
  }
  return JSON.stringify(val);
}

// ============================================================================
// StatusBadge
// ============================================================================

function StatusBadge({ status }: { status: 'changed' | 'added' | 'source' }) {
  const styles = {
    changed:
      'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
    added:
      'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
    source:
      'bg-[var(--surface-card)] text-[var(--text-tertiary)] border border-[var(--stroke-divider)]',
  } as const;

  const labels = { changed: 'changed', added: 'added', source: 'source' } as const;

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

// ============================================================================
// TabToggle
// ============================================================================

function TabToggle({
  activeTab,
  onTabChange,
}: {
  activeTab: 'previous' | 'current';
  onTabChange: (tab: 'previous' | 'current') => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-[var(--stroke-divider)] overflow-hidden text-[11px]">
      <button
        type="button"
        onClick={() => onTabChange('previous')}
        className={`px-2.5 py-1 transition-colors ${
          activeTab === 'previous'
            ? 'bg-[var(--accent-commit)] text-white font-medium'
            : 'bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
        }`}
      >
        Previous
      </button>
      <button
        type="button"
        onClick={() => onTabChange('current')}
        className={`px-2.5 py-1 transition-colors ${
          activeTab === 'current'
            ? 'bg-[var(--accent-commit)] text-white font-medium'
            : 'bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
        }`}
      >
        Current
      </button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SourceSlideIn({ projectId }: SourceSlideInProps) {
  const { commit, enrichedNodes, activeNodeId, sourceViewer, closeSourceViewer, setSourceTab } =
    useCommitDetailStore();

  const { isOpen, activeSlotKey, activeTab } = sourceViewer;

  // ── Local state ──
  const [turns, setTurns] = useState<LoadedTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceTurnRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Derived: active enriched node ──
  const enrichedNode = enrichedNodes.find((ef) => ef.path === activeNodeId);
  const activeNode = enrichedNode?.node;
  const previousNode = enrichedNode?.previousNode;
  const diffStatus = enrichedNode?.diffStatus ?? 'identical';

  // ── Derived: slot source ref for current tab ──
  const slotSource = getSlotSource(activeSlotKey, activeTab, activeNode, previousNode);

  // ── Derived: slot values for value summary bar ──
  const currentSlotValue =
    activeSlotKey && activeNode ? slotValueToString(activeNode.slots[activeSlotKey]) : '';
  const previousSlotValue =
    activeSlotKey && previousNode ? slotValueToString(previousNode.slots[activeSlotKey]) : '';

  const changeStatus = resolveChangeStatus(activeSlotKey ?? '', activeTab, diffStatus);
  const showTabs = diffStatus === 'modified' && !!previousNode;

  // ── Fetch turns when panel opens ──
  const fetchTurns = useCallback(
    async (convId: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listTurns(projectId, convId, 200, 0);
        setTurns(
          data.turns.map((t) => ({
            turn_hash: t.turn_hash,
            role: t.role,
            content: t.content,
            created_at: t.created_at,
            conversation_id: t.conversation_id,
          }))
        );
        setConversationId(convId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
        setTurns([]);
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  // Resolve conversation ID from commit sources when panel opens
  useEffect(() => {
    if (!isOpen || !commit) return;

    // Look for conversation source
    const convSource = commit.sources?.find((s) => s.type === 'conversation');
    if (convSource) {
      fetchTurns(convSource.id);
      return;
    }

    // No conversation source found — clear turns
    setTurns([]);
    setConversationId(null);
    setError(null);
    setLoading(false);
  }, [isOpen, commit, fetchTurns]);

  // ── Auto-scroll to source turn when turns load or tab changes ──
  useEffect(() => {
    if (!isOpen || !slotSource || turns.length === 0) return;

    // Small delay to let DOM paint
    const timer = setTimeout(() => {
      if (sourceTurnRef.current) {
        sourceTurnRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [isOpen, slotSource, turns, activeTab]);

  // ── Esc key closes panel ──
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSourceViewer();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeSourceViewer]);

  // ── Match a turn to the source ref ──
  function isSourceTurn(turn: LoadedTurn): boolean {
    if (!slotSource) return false;
    // Match by turn_hash if available
    if (slotSource.turn_hash) {
      return (
        turn.turn_hash === slotSource.turn_hash || turn.turn_hash.startsWith(slotSource.turn_hash)
      );
    }
    // Fallback: match by turn tag (e.g., "T3" → index 2)
    if (slotSource.turn && /^T\d+$/.test(slotSource.turn)) {
      const idx = parseInt(slotSource.turn.slice(1), 10) - 1;
      return turns.indexOf(turn) === idx;
    }
    return false;
  }

  // ── Build TurnBubbleData ──
  function buildTurnData(turn: LoadedTurn): TurnBubbleData {
    const isTarget = isSourceTurn(turn);
    const data: TurnBubbleData = {
      turn_hash: turn.turn_hash,
      role: turn.role,
      content: turn.content,
      created_at: turn.created_at,
      is_target: isTarget,
    };
    if (isTarget && slotSource && slotSource.start_char != null && slotSource.end_char != null) {
      data.highlight = { start: slotSource.start_char, end: slotSource.end_char };
    }
    return data;
  }

  // ── Render ──

  if (!isOpen) return null;

  const hasSource = !!slotSource;
  const hasNoTurns = !loading && !error && turns.length === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40"
        onClick={closeSourceViewer}
        aria-hidden="true"
      />

      {/* Slide-in Panel */}
      <aside
        ref={panelRef}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col bg-[var(--surface-panel)] shadow-2xl border-l border-[var(--stroke-divider)] animate-in slide-in-from-right duration-300"
        aria-label="Source context viewer"
      >
        {/* ── Header ── */}
        <header className="flex shrink-0 flex-col gap-2 border-b border-[var(--stroke-divider)] px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-[var(--accent-commit)] shrink-0" />
            <span className="flex-1 truncate font-mono text-[13px] font-semibold text-[var(--text-primary)]">
              {activeSlotKey ?? '—'}
            </span>
            <StatusBadge status={changeStatus} />
            {showTabs && (
              <TabToggle activeTab={activeTab} onTabChange={(tab) => setSourceTab(tab)} />
            )}
            <button
              type="button"
              onClick={closeSourceViewer}
              className="ml-1 rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Close source viewer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Value summary bar — only for modified/changed slots */}
          {diffStatus === 'modified' && previousSlotValue && currentSlotValue && (
            <div className="flex items-center gap-1.5 rounded-md bg-[var(--surface-card)] px-2 py-1.5 text-[11px]">
              <span className="text-[var(--text-tertiary)] font-medium shrink-0">was:</span>
              <span className="text-amber-700 dark:text-amber-400 truncate max-w-[140px]">
                {previousSlotValue}
              </span>
              <ChevronRight size={11} className="text-[var(--text-tertiary)] shrink-0" />
              <span className="text-[var(--text-tertiary)] font-medium shrink-0">now:</span>
              <span className="text-emerald-700 dark:text-emerald-400 truncate max-w-[140px]">
                {currentSlotValue}
              </span>
            </div>
          )}
        </header>

        {/* ── Body: Turn list ── */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-[var(--text-tertiary)]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--stroke-divider)] border-t-[var(--accent-commit)]" />
              <span className="text-[13px]">Loading conversation…</span>
            </div>
          )}

          {error && (
            <div className="mx-4 my-6 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-3 py-2.5">
              <p className="text-[12px] text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {hasNoTurns && !error && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
              <MessageSquare size={24} className="text-[var(--text-tertiary)]" />
              <p className="text-[13px] text-[var(--text-tertiary)]">
                {!hasSource ? 'No source available for this slot.' : 'No conversation turns found.'}
              </p>
            </div>
          )}

          {!loading && !error && turns.length > 0 && (
            <div className="flex flex-col gap-2 p-3">
              {turns.map((turn) => {
                const isTarget = isSourceTurn(turn);
                const turnData = buildTurnData(turn);
                return (
                  <div
                    key={turn.turn_hash}
                    ref={isTarget ? sourceTurnRef : undefined}
                    className={`rounded-lg transition-all duration-200 ${
                      isTarget
                        ? 'ring-2 ring-[var(--accent-commit)] ring-offset-1 ring-offset-[var(--surface-panel)]'
                        : 'opacity-50'
                    }`}
                  >
                    <TurnBubble turn={turnData} highlightColor="green" showTargetRing={false} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Bottom bar ── */}
        {conversationId && (
          <footer className="shrink-0 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                {conversationId}
              </span>
              <Link
                href={`/project/${projectId}/conversation/${encodeURIComponent(conversationId)}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-commit)] transition-colors"
                onClick={closeSourceViewer}
              >
                Open full conversation
                <ExternalLink size={11} />
              </Link>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}
