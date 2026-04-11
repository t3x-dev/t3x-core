'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkspaceTopbar } from './WorkspaceTopbar';
import { ScriptEditor } from './ScriptEditor';
import { BeforePanel } from './BeforePanel';
import { AfterPanel } from './AfterPanel';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

const DEFAULT_WIDTH = 700;
const COLLAPSED_WIDTH = 40;

export function YOpsWorkspace({ customWidth }: { customWidth?: number }) {
  const panelExpanded = useWorkspaceStore((s) => s.panelExpanded);
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const [splitRatio, setSplitRatio] = useState(0.3);
  const [showBefore, setShowBefore] = useState(false);
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
      <div
        onMouseDown={handleSplitDrag}
        className="h-[3px] bg-[var(--stroke-default)] cursor-row-resize hover:bg-[var(--source)] transition-colors flex-shrink-0"
      />
      <div className="flex flex-1 min-h-0">
        {/* Collapsible Before panel — side by side on the left */}
        {showBefore && (
          <div className="flex-1 border-r border-[var(--stroke-default)] overflow-hidden">
            <BeforePanel />
          </div>
        )}
        {/* After panel — always visible, takes remaining space */}
        <div className="flex-1 overflow-hidden">
          <AfterPanel showBeforeToggle onToggleBefore={() => setShowBefore((p) => !p)} beforeVisible={showBefore} />
        </div>
      </div>
    </div>
  );
}
