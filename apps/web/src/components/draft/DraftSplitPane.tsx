'use client';

/**
 * DraftSplitPane - Resizable vertical split between main content and preview panel
 *
 * CSS flex-based with drag handle. Follows VS Code terminal / Overleaf pattern.
 * Persists bottom panel height to localStorage.
 * V2: Integrates scroll sync between sentence list and preview.
 */

import { ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useScrollSync } from '@/hooks/useScrollSync';
import { cn } from '@/lib/utils';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';

const STORAGE_KEY = 'draft-preview-panel-height';
const MAX_BOTTOM_RATIO = 0.6; // 60vh max
const DEFAULT_BOTTOM = 200; // px
const HEADER_HEIGHT = 37; // px - height of preview header bar

interface DraftSplitPaneProps {
  top: ReactNode;
  bottom: ReactNode;
}

function loadPersistedHeight(): number {
  if (typeof window === 'undefined') return DEFAULT_BOTTOM;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const n = Number.parseInt(stored, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return DEFAULT_BOTTOM;
}

export function DraftSplitPane({ top, bottom }: DraftSplitPaneProps) {
  const [initialHeight] = useState(loadPersistedHeight);
  const [bottomHeight, setBottomHeight] = useState(initialHeight);
  const [collapsed, setCollapsed] = useState(initialHeight <= HEADER_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const previewStatus = useDraftWorkspaceStore((s) => s.previewStatus);

  // Scroll sync: active only when preview is ready
  useScrollSync({
    sourceRef: topRef,
    targetRef: bottomRef,
    sentenceMap: previewStatus === 'ready' ? [] : null, // paragraph-level mapping
    enabled: previewStatus === 'ready' && !collapsed,
  });

  // Persist height
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed ? 0 : bottomHeight));
  }, [bottomHeight, collapsed]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startHeight.current = collapsed ? HEADER_HEIGHT : bottomHeight;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [bottomHeight, collapsed]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const containerHeight = containerRef.current.getBoundingClientRect().height;
      const maxBottom = containerHeight * MAX_BOTTOM_RATIO;
      const delta = startY.current - e.clientY;
      const newHeight = Math.max(HEADER_HEIGHT, Math.min(maxBottom, startHeight.current + delta));
      setBottomHeight(newHeight);
      setCollapsed(newHeight <= HEADER_HEIGHT);
    };

    const handleMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const toggleCollapse = useCallback(() => {
    if (collapsed) {
      setCollapsed(false);
      setBottomHeight(DEFAULT_BOTTOM);
    } else {
      setCollapsed(true);
    }
  }, [collapsed]);

  const handleDoubleClick = useCallback(() => {
    toggleCollapse();
  }, [toggleCollapse]);

  const effectiveHeight = collapsed ? HEADER_HEIGHT : bottomHeight;

  return (
    <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
      {/* Top content */}
      <div ref={topRef} className="flex-1 overflow-y-auto min-h-0">
        {top}
      </div>

      {/* Drag handle */}
      {/* biome-ignore lint/a11y/useSemanticElements: custom resize handle */}
      <div
        className={cn(
          'flex items-center justify-center h-[6px] cursor-row-resize',
          'hover:bg-primary/10 active:bg-primary/20 transition-colors',
          'relative group'
        )}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-valuenow={effectiveHeight}
        aria-label="Resize preview panel"
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
        {/* Toggle button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
          aria-label={collapsed ? 'Expand preview' : 'Collapse preview'}
        >
          {collapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Bottom preview panel */}
      <div
        ref={bottomRef}
        style={{ height: effectiveHeight, minHeight: HEADER_HEIGHT }}
        className="overflow-hidden flex-shrink-0"
      >
        {bottom}
      </div>
    </div>
  );
}
