'use client';

import { PanelRightOpen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { selectPanelExpanded, useWorkspaceStore } from '@/store/workspaceStore';
import { cn } from '@/utils/cn';
import { AfterPanel } from './AfterPanel';
import { ArchivedOpsPanel } from './ArchivedOpsPanel';
import { ReplayWarningBanner } from './ReplayWarningBanner';
import { ScriptEditor } from './ScriptEditor';
import { WorkspaceTopbar } from './WorkspaceTopbar';
import { splitOpsByCommittedness, YOpsLogPanel } from './YOpsLogPanel';

/**
 * Top-half tabs in the workspace, post plan PR 2 + PR 5.
 *
 * Per the workbench plan §8 + §11:
 *   - draft     → uncommitted proposal staged via Extract or manual edit
 *   - applied   → yops_log rows not yet referenced by a commit
 *   - committed → yops_log rows referenced by `commits.yops_log_ids`
 *   - archived  → yops_log rows with `superseded_at != null` (read-only audit)
 *   - script    → YOps editor
 */
type TopView = 'draft' | 'applied' | 'committed' | 'archived' | 'script';

const DEFAULT_WIDTH = 700;
const COLLAPSED_WIDTH = 48;
const DEFAULT_SPLIT_RATIO = 0.5;

export function YOpsWorkspace({ customWidth }: { customWidth?: number }) {
  const panelExpanded = useWorkspaceStore(selectPanelExpanded);
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO);
  const [showBefore, setShowBefore] = useState(false);
  // Default to whichever tab has live content: a staged draft, otherwise
  // applied ops, otherwise committed history, falling through to the
  // YOps editor when there's nothing to render.
  const draftCount = useWorkspaceStore((s) => s.draftOps.length);
  const opsLog = useWorkspaceStore((s) => s.opsLog);
  const conversationId = useWorkspaceStore((s) => s.conversationId);
  const opOrigins = useWorkspaceStore((s) => s.opOrigins);
  const rowsById = useWorkspaceStore((s) => s.rowsById);
  const initialTab = useMemo<TopView>(() => {
    if (draftCount > 0) return 'draft';
    const { applied, committed } = splitOpsByCommittedness(opsLog, opOrigins, rowsById);
    if (applied.length > 0) return 'applied';
    if (committed.length > 0) return 'committed';
    return 'script';
    // Computed once on mount; `topView` becomes user-controlled after,
    // unless the user hasn't manually picked yet AND a draft arrives
    // (the auto-switch effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [topView, setTopViewState] = useState<TopView>(initialTab);
  // Tracks whether the user has manually picked a tab. Once true, we
  // stop auto-switching — the user's pick wins. Reset to false only
  // on Discard / clearDraft (no auto-switch needed in that direction;
  // the next draft will re-engage the watcher).
  const userPickedTabRef = useRef(false);
  const prevDraftCountRef = useRef(draftCount);
  const prevConversationIdRef = useRef(conversationId);
  const setTopView = useCallback((next: TopView) => {
    userPickedTabRef.current = true;
    setTopViewState(next);
  }, []);
  // Auto-switch to the Draft tab when a fresh draft arrives, IFF the
  // user hasn't picked a tab manually yet. Common flow: workspace
  // mounts on YOps (empty conversation) → user clicks Extract →
  // draftCount > 0 → tab switches to Draft so the proposal is the
  // visible surface, matching the "elevate structured ops" thesis.
  // Once the user clicks a tab manually, the ref locks and store
  // updates stop dragging the view around.
  useEffect(() => {
    const prevDraftCount = prevDraftCountRef.current;
    const conversationChanged = prevConversationIdRef.current !== conversationId;
    const draftCleared = prevDraftCount > 0 && draftCount === 0;

    if (conversationChanged || draftCleared) {
      userPickedTabRef.current = false;
    }

    prevDraftCountRef.current = draftCount;
    prevConversationIdRef.current = conversationId;

    if (userPickedTabRef.current) return;
    if (draftCount > 0 && topView !== 'draft') {
      setTopViewState('draft');
    }
  }, [conversationId, draftCount, topView]);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const prevExpandedRef = useRef(panelExpanded);
  const sidebarWasCollapsedRef = useRef(true);

  useEffect(() => {
    if (panelExpanded === prevExpandedRef.current) return;
    prevExpandedRef.current = panelExpanded;

    if (panelExpanded) {
      sidebarWasCollapsedRef.current = useChatStore.getState().sidebarCollapsed;
      if (!sidebarWasCollapsedRef.current) {
        useChatStore.setState({ sidebarCollapsed: true });
      }
    } else if (!sidebarWasCollapsedRef.current) {
      useChatStore.setState({ sidebarCollapsed: false });
    }
  }, [panelExpanded]);

  const handleSplitDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const container = containerRef.current;
    if (!container) return;

    const handleMove = (ev: MouseEvent) => {
      if (!isDragging.current || !container) return;
      const rect = container.getBoundingClientRect();
      const topbarHeight = 44;
      const available = rect.height - topbarHeight;
      const y = ev.clientY - rect.top - topbarHeight;
      setSplitRatio(Math.max(0.15, Math.min(0.75, y / available)));
    };

    const handleUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, []);

  const width = panelExpanded ? (customWidth ?? DEFAULT_WIDTH) : COLLAPSED_WIDTH;

  if (!panelExpanded) {
    return (
      <div
        data-testid="yops-panel-collapsed"
        className="flex h-full flex-col items-center gap-2 border-l border-[var(--stroke-default)] bg-[var(--panel)] pt-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
        style={{ width: COLLAPSED_WIDTH }}
        onClick={() => setPanelExpanded(true)}
        title="Expand workspace"
      >
        <PanelRightOpen className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        <span className="text-[10px] font-bold text-[var(--source)] [writing-mode:vertical-rl] rotate-180">
          Workspace
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-[var(--panel)] border-l border-[var(--stroke-default)]"
      style={{ width, minWidth: 400 }}
    >
      <WorkspaceTopbar />
      <ReplayWarningBanner />

      <div
        style={{ height: `${splitRatio * 100}%` }}
        className="flex-shrink-0 overflow-hidden border-b border-[var(--stroke-default)] flex flex-col"
      >
        <div
          role="tablist"
          aria-label="Workspace top view"
          className="flex items-center gap-0 border-b border-[var(--stroke-default)] bg-[var(--panel)] px-2"
        >
          {(
            [
              { id: 'draft', label: 'Draft' },
              { id: 'applied', label: 'Applied' },
              { id: 'committed', label: 'Committed' },
              { id: 'archived', label: 'Archived' },
              // The id stays 'script' to minimize churn in tests / a11y
              // labels — the visible label is what users see.
              { id: 'script', label: 'YOps' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={topView === tab.id}
              onClick={() => setTopView(tab.id)}
              className={cn(
                'px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors',
                topView === tab.id
                  ? 'text-[var(--text-primary)] border-b-2 border-[var(--source)] -mb-px'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {topView === 'script' ? (
            <ScriptEditor />
          ) : topView === 'archived' ? (
            <ArchivedOpsPanel conversationId={conversationId} />
          ) : (
            <YOpsLogPanel
              tab={topView}
              mode={topView === 'applied' ? 'materialized' : 'ledger'}
            />
          )}
        </div>
      </div>

      <div
        onMouseDown={handleSplitDrag}
        className="h-[3px] bg-[var(--stroke-default)] cursor-row-resize hover:bg-[var(--source)] transition-colors flex-shrink-0"
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AfterPanel
          showBeforeToggle
          onToggleBefore={() => setShowBefore((p) => !p)}
          beforeVisible={showBefore}
        />
      </div>
    </div>
  );
}
