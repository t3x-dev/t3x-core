'use client';

import type { TreeNode } from '@t3x-dev/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { AfterPanel } from './AfterPanel';
import { ScriptEditor } from './ScriptEditor';
import { WorkspaceTopbar } from './WorkspaceTopbar';

const DEFAULT_WIDTH = 700;
const COLLAPSED_WIDTH = 40;
const WORKSPACE_TOPBAR_HEIGHT = 44;
const SPLIT_HANDLE_HEIGHT = 3;
const TREE_ROW_HEIGHT = 26;
const RESULT_HEADER_HEIGHT = 30;
const RESULT_FOOTER_HEIGHT = 52;
const RESULT_MIN_HEIGHT = 180;

function countTreeRows(trees: TreeNode[]): number {
  let rows = 0;
  const walk = (node: TreeNode) => {
    rows += 1;
    rows += Object.keys(node.slots || {}).filter((key) => !key.startsWith('_')).length;
    for (const child of node.children ?? []) walk(child);
  };
  for (const tree of trees) walk(tree);
  return rows;
}

export function YOpsWorkspace({ customWidth }: { customWidth?: number }) {
  const panelExpanded = useWorkspaceStore((s) => s.panelExpanded);
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const tree = useWorkspaceStore((s) => s.tree);
  const [splitRatio, setSplitRatio] = useState(0.3);
  const [showBefore, setShowBefore] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const hasManualSplitRef = useRef(false);
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

  useEffect(() => {
    if (hasManualSplitRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const availableHeight =
      container.clientHeight - WORKSPACE_TOPBAR_HEIGHT - SPLIT_HANDLE_HEIGHT;
    if (availableHeight <= 0) return;

    const visibleRows = Math.max(countTreeRows((tree.trees as TreeNode[]) ?? []), 4);
    const desiredBottomHeight = Math.min(
      Math.max(
        RESULT_MIN_HEIGHT,
        RESULT_HEADER_HEIGHT + visibleRows * TREE_ROW_HEIGHT + RESULT_FOOTER_HEIGHT
      ),
      Math.floor(availableHeight * 0.58)
    );

    const nextRatio = 1 - desiredBottomHeight / availableHeight;
    setSplitRatio(Math.max(0.2, Math.min(0.75, nextRatio)));
  }, [tree.trees]);

  const handleSplitDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    hasManualSplitRef.current = true;
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

      <div
        style={{ height: `${splitRatio * 100}%` }}
        className="flex-shrink-0 overflow-hidden border-b border-[var(--stroke-default)]"
      >
        <ScriptEditor />
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
