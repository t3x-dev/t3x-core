'use client';

import { useCallback, useRef, useState } from 'react';
import { WorkspaceTopbar } from './WorkspaceTopbar';
import { ScriptEditor } from './ScriptEditor';
import { BeforePanel } from './BeforePanel';
import { AfterPanel } from './AfterPanel';
import { useWorkspaceStore } from '@/store/workspaceStore';

const DEFAULT_WIDTH = 550;
const COLLAPSED_WIDTH = 40;

export function YOpsWorkspace({ customWidth }: { customWidth?: number }) {
  const panelExpanded = useWorkspaceStore((s) => s.panelExpanded);
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);
  const [splitRatio, setSplitRatio] = useState(0.55);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

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
      style={{ width, minWidth: 400, maxWidth: 800 }}
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
