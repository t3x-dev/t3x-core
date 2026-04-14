'use client';

/**
 * usePendingCommitLayout — owns the sidebar | source-panel divider
 * drag state for the pending-commit workspace. Purely UI layout; no
 * server interaction.
 *
 * Extracted from usePendingCommitState (PR25).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePendingCommitLayoutReturn {
  sidebarSourceDividerPos: number;
  handleSidebarSourceDivider: (e: React.MouseEvent) => void;
  draftBodyRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function usePendingCommitLayout(): UsePendingCommitLayoutReturn {
  const [sidebarSourceDividerPos, setSidebarSourceDividerPos] = useState(240);
  const draftBodyRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  const handleSidebarSourceDivider = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draftBodyRef.current) return;
      const rect = draftBodyRef.current.getBoundingClientRect();
      const newWidth = moveEvent.clientX - rect.left;
      setSidebarSourceDividerPos(Math.max(220, Math.min(400, newWidth)));
    };

    const cleanup = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      dragCleanupRef.current = null;
    };

    const handleMouseUp = () => {
      cleanup();
    };

    dragCleanupRef.current = cleanup;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return { sidebarSourceDividerPos, handleSidebarSourceDivider, draftBodyRef };
}
