'use client';

import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkspaceTopbar } from './WorkspaceTopbar';
import { ScriptEditor } from './ScriptEditor';
import { BeforePanel } from './BeforePanel';
import { AfterPanel } from './AfterPanel';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const DEFAULT_WIDTH = 700;
const COLLAPSED_WIDTH = 40;

/** Advisory questions panel — only renders when questions exist */
function AdvisoryQuestionsBar() {
  const questions = useWorkspaceStore((s) => s.advisoryQuestions);
  if (questions.length === 0) return null;

  return (
    <div className="border-b border-[var(--stroke-default)] bg-[var(--status-info-muted)] px-3 py-2 shrink-0 max-h-32 overflow-y-auto">
      <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--status-info)] mb-1.5 flex items-center gap-1">
        <Info className="h-3 w-3" />
        {questions.length} question{questions.length > 1 ? 's' : ''} to clarify
      </div>
      {questions.map((q) => (
        <div key={q.id} className="text-[10px] text-[var(--text-secondary)] py-0.5">
          <span className="font-mono text-[var(--status-info)] mr-1">{q.treeId}{q.slotKey ? `.${q.slotKey}` : ''}:</span>
          {q.question}
          {q.currentValue !== undefined && (
            <span className="text-[var(--text-tertiary)] ml-1">(current: {String(q.currentValue)})</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Inline gate issues bar — only renders when issues exist */
function GateIssuesBar() {
  const gateIssues = useWorkspaceStore((s) => s.gateIssues);
  const allIssues = Object.values(gateIssues).flat();
  if (allIssues.length === 0) return null;

  const errors = allIssues.filter((i) => i.severity === 'error');
  const warnings = allIssues.filter((i) => i.severity === 'warning');

  return (
    <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--stroke-default)] bg-[var(--editor-gutter)] text-[9px] shrink-0 overflow-x-auto">
      {errors.length > 0 && (
        <span className="flex items-center gap-1 text-[var(--status-error)]">
          <XCircle className="h-3 w-3 shrink-0" />
          {errors.length} error{errors.length > 1 ? 's' : ''}
        </span>
      )}
      {warnings.length > 0 && (
        <span className="flex items-center gap-1 text-[var(--status-warning)]">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {warnings.length} warning{warnings.length > 1 ? 's' : ''}
        </span>
      )}
      <span className="text-[var(--text-tertiary)] truncate">
        {allIssues[0]?.description}
      </span>
    </div>
  );
}

export function YOpsWorkspace({ customWidth }: { customWidth?: number }) {
  const panelExpanded = useWorkspaceStore((s) => s.panelExpanded);
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const [splitRatio, setSplitRatio] = useState(0.3);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const prevExpandedRef = useRef(panelExpanded);
  const sidebarWasCollapsedRef = useRef(true);

  // Auto-collapse sidebar when YOps panel expands, restore when it collapses.
  // Only fires on panelExpanded transitions — does NOT fight manual sidebar toggles.
  useEffect(() => {
    if (panelExpanded === prevExpandedRef.current) return;
    prevExpandedRef.current = panelExpanded;

    if (panelExpanded) {
      // Remember sidebar state, then collapse it
      sidebarWasCollapsedRef.current = useChatStore.getState().sidebarCollapsed;
      if (!sidebarWasCollapsedRef.current) {
        useChatStore.setState({ sidebarCollapsed: true });
      }
    } else {
      // Restore sidebar if it was open before
      if (!sidebarWasCollapsedRef.current) {
        useChatStore.setState({ sidebarCollapsed: false });
      }
    }
  }, [panelExpanded]);

  const width = panelExpanded ? (customWidth ?? DEFAULT_WIDTH) : COLLAPSED_WIDTH;

  const handleSplitDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const container = containerRef.current;
    if (!container) return;

    const handleMove = (ev: MouseEvent) => {
      if (!isDragging.current || !container) return;
      const rect = container.getBoundingClientRect();
      const topbarHeight = 34;
      const available = rect.height - topbarHeight;
      const y = ev.clientY - rect.top - topbarHeight;
      setSplitRatio(Math.max(0.25, Math.min(0.75, y / available)));
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

  if (!panelExpanded) {
    return (
      <div
        className="flex flex-col items-center py-4 gap-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
        style={{ width: COLLAPSED_WIDTH }}
        onClick={() => setPanelExpanded(true)}
      >
        <span className="text-[10px] font-bold text-[var(--source)] [writing-mode:vertical-rl] rotate-180">
          YOps
        </span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-[var(--panel)] border-l border-[var(--stroke-default)]"
      style={{ width, minWidth: 500, maxWidth: 1200 }}
    >
      <WorkspaceTopbar />
      <div style={{ height: `${splitRatio * 100}%` }} className="flex-shrink-0 overflow-hidden border-b border-[var(--stroke-default)]">
        <ScriptEditor />
      </div>
      <GateIssuesBar />
      <AdvisoryQuestionsBar />
      <div
        onMouseDown={handleSplitDrag}
        className="h-[3px] bg-[var(--stroke-default)] cursor-row-resize hover:bg-[var(--source)] transition-colors flex-shrink-0"
      />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 border-r border-[var(--stroke-default)] overflow-hidden">
          <BeforePanel />
        </div>
        <div className="flex-1 overflow-hidden">
          <AfterPanel />
        </div>
      </div>
    </div>
  );
}
