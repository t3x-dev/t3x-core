'use client';

import { PanelRightOpen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildMaterializedOpGroups } from '@/domain/yops/opCardGroups';
import { selectPanelExpanded, selectScriptDirty, useWorkspaceStore } from '@/store/workspaceStore';
import {
  WORKSPACE_PANEL_FALLBACK_WIDTH,
  WORKSPACE_PANEL_MIN_WIDTH,
} from '@/utils/chatWorkspaceLayout';
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
type LogView = Exclude<TopView, 'script'>;

const LOG_VIEW_META: Record<LogView, { label: string; desc: string }> = {
  draft: { label: 'Draft', desc: 'Unapplied proposal' },
  applied: { label: 'Applied', desc: 'Materialized, not committed' },
  committed: { label: 'Committed', desc: 'Referenced by commits' },
  archived: { label: 'Archived', desc: 'Superseded audit trail' },
};

const COLLAPSED_WIDTH = 48;
const DEFAULT_SPLIT_RATIO = 0.5;

export function YOpsWorkspace({ customWidth }: { customWidth?: number }) {
  const panelExpanded = useWorkspaceStore(selectPanelExpanded);
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO);
  const [showBefore, setShowBefore] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const draftOps = useWorkspaceStore((s) => s.draftOps);
  const opsLog = useWorkspaceStore((s) => s.opsLog);
  const scriptDirty = useWorkspaceStore(selectScriptDirty);
  const conversationId = useWorkspaceStore((s) => s.conversationId);
  const opOrigins = useWorkspaceStore((s) => s.opOrigins);
  const rowsById = useWorkspaceStore((s) => s.rowsById);
  const [topView, setTopViewState] = useState<TopView>('script');
  const containerRef = useRef<HTMLDivElement>(null);
  const logsMenuRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const logCounts = useMemo(() => {
    const { applied, committed } = splitOpsByCommittedness(opsLog, opOrigins, rowsById);
    return {
      draft: draftOps.length,
      applied: applied.length,
      committed: committed.length,
      archived: null,
    } satisfies Record<LogView, number | null>;
  }, [draftOps.length, opOrigins, opsLog, rowsById]);

  const workspaceSummary = useMemo(() => {
    const groups = buildMaterializedOpGroups({
      ops: opsLog,
      pendingDraftOps: draftOps,
      scriptDirty,
    });
    return `${opsLog.length} ops · ${groups.pending.count} pending`;
  }, [draftOps, opsLog, scriptDirty]);

  const setTopView = useCallback((next: TopView) => {
    setTopViewState(next);
    setLogsOpen(false);
  }, []);

  useEffect(() => {
    if (!logsOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (logsMenuRef.current?.contains(target)) return;
      setLogsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [logsOpen]);

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

  const width = panelExpanded ? (customWidth ?? WORKSPACE_PANEL_FALLBACK_WIDTH) : COLLAPSED_WIDTH;
  const logsActive = logsOpen || topView !== 'script';
  const logsMenu = (
    <div ref={logsMenuRef} className="relative inline-flex h-6 items-center">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={logsOpen}
        aria-current={topView !== 'script' ? 'page' : undefined}
        onClick={() => setLogsOpen((open) => !open)}
        className={cn(
          'inline-flex h-6 items-center justify-center gap-1.5 rounded border px-2 text-[10px] font-bold leading-none transition-colors',
          logsActive
            ? 'border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)]'
            : 'border-[var(--stroke-default)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
        )}
      >
        Logs
        <span className="text-[9px] leading-none text-[var(--text-tertiary)]">▾</span>
      </button>
      {logsOpen && (
        <div
          role="menu"
          className="absolute right-0 top-7 z-20 w-56 overflow-hidden rounded-md border border-[var(--stroke-default)] bg-[var(--surface-panel)] shadow-[var(--fx-shadow-lg)]"
        >
          <div className="border-b border-[var(--stroke-divider)] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Operation Logs
          </div>
          {(Object.keys(LOG_VIEW_META) as LogView[]).map((view) => {
            const count = logCounts[view];
            return (
              <button
                key={view}
                type="button"
                role="menuitem"
                onClick={() => setTopView(view)}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-[var(--stroke-divider)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--hover-bg)]',
                  topView === view && 'bg-[var(--source)]/5'
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-[var(--text-primary)]">
                    {LOG_VIEW_META[view].label}
                  </span>
                  <span className="block truncate text-[10px] text-[var(--text-tertiary)]">
                    {LOG_VIEW_META[view].desc}
                  </span>
                </span>
                {count !== null && (
                  <span className="inline-flex h-[18px] min-w-[22px] items-center justify-center rounded-full bg-[var(--status-success)]/10 px-1.5 text-[9px] font-bold text-[var(--status-success)]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!panelExpanded) {
    return (
      <div
        data-testid="yops-panel-collapsed"
        className="flex h-full flex-col items-center gap-2 border-l border-[var(--stroke-divider)] bg-[var(--panel)] pt-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
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
      className="flex h-full flex-col bg-[var(--panel)]"
      style={{ width, minWidth: WORKSPACE_PANEL_MIN_WIDTH }}
    >
      <WorkspaceTopbar />
      <ReplayWarningBanner />

      <div
        style={{ height: `${splitRatio * 100}%` }}
        className="flex-shrink-0 overflow-hidden border-b border-[var(--stroke-default)] flex flex-col"
      >
        <div className="flex h-8 items-center gap-2 border-b border-[var(--stroke-default)] bg-[var(--panel)] px-3">
          {topView === 'script' ? (
            <span
              className="min-w-0 max-w-[180px] truncate text-[10px] font-mono text-[var(--text-tertiary)]"
              title={workspaceSummary}
            >
              {workspaceSummary}
            </span>
          ) : (
            <span className="min-w-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Logs /{' '}
              <span className="text-[var(--text-primary)]">{LOG_VIEW_META[topView].label}</span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {logsMenu}
            <button
              type="button"
              disabled={topView === 'script'}
              aria-current={topView === 'script' ? 'page' : undefined}
              onClick={() => setTopView('script')}
              className={cn(
                'inline-flex h-6 items-center justify-center rounded border px-2 text-[10px] font-bold leading-none transition-colors',
                topView === 'script'
                  ? 'cursor-default border-[var(--source)]/30 bg-[var(--source)]/10 text-[var(--source)]'
                  : 'border-[var(--stroke-default)] text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
              )}
            >
              YOps
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {topView === 'script' ? (
            <ScriptEditor />
          ) : topView === 'archived' ? (
            <ArchivedOpsPanel conversationId={conversationId} />
          ) : (
            <YOpsLogPanel tab={topView} mode={topView === 'applied' ? 'materialized' : 'ledger'} />
          )}
        </div>
      </div>

      <div
        onMouseDown={handleSplitDrag}
        className="group relative z-10 -my-[3px] h-1.5 flex-shrink-0 cursor-row-resize bg-transparent"
      >
        <span
          aria-hidden="true"
          className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-[var(--stroke-divider)]/60 transition-colors group-hover:bg-[var(--source)]/35 group-active:bg-[var(--source)]/50"
        />
      </div>

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
