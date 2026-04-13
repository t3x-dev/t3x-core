'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { AfterPanel } from './AfterPanel';
import { BeforePanel } from './BeforePanel';
import { WorkspaceTopbar } from './WorkspaceTopbar';

const DEFAULT_WIDTH = 700;
const COLLAPSED_WIDTH = 40;

export function YOpsWorkspace({ customWidth }: { customWidth?: number }) {
  const panelExpanded = useWorkspaceStore((s) => s.panelExpanded);
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const [showBefore, setShowBefore] = useState(false);
  const prevExpandedRef = useRef(panelExpanded);
  const sidebarWasCollapsedRef = useRef(true);

  // Auto-collapse sidebar when YOps panel expands, restore when it collapses.
  // Only fires on panelExpanded transitions — does NOT fight manual sidebar toggles.
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

  const width = panelExpanded ? (customWidth ?? DEFAULT_WIDTH) : COLLAPSED_WIDTH;

  if (!panelExpanded) {
    return (
      <div
        data-testid="yops-panel-collapsed"
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
      className="flex flex-col h-full bg-[var(--panel)] border-l border-[var(--stroke-default)]"
      style={{ width, minWidth: 500, maxWidth: 1200 }}
    >
      <WorkspaceTopbar />
      <div className="flex flex-1 min-h-0">
        {/* Collapsible Before panel — side by side on the left */}
        {showBefore && (
          <div className="flex-1 border-r border-[var(--stroke-default)] overflow-hidden">
            <BeforePanel />
          </div>
        )}
        {/* After panel — always visible, takes remaining space */}
        <div className="flex-1 overflow-hidden">
          <AfterPanel
            showBeforeToggle
            onToggleBefore={() => setShowBefore((p) => !p)}
            beforeVisible={showBefore}
          />
        </div>
      </div>
    </div>
  );
}
