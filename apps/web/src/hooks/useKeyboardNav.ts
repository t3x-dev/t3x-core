/**
 * useKeyboardNav — Global keyboard shortcuts for the YOps Workspace panel.
 *
 * Actions are injected via params so this hook stays decoupled from
 * the store implementations.
 */

import { useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';

interface KeyboardNavActions {
  /** Cmd+Z — undo last YOp (executed only) */
  undo?: () => void;
  /** Cmd+Shift+Z — redo (executed only) */
  redo?: () => void;
  /** Cmd+Enter — commit all pending changes (executed only) */
  commit?: () => void;
  /** Cmd+E — start extraction (idle only) */
  startExtraction?: () => void;
  /** Esc — cancel current edit or go back */
  stopEdit?: () => void;
}

export function useKeyboardNav(actions: KeyboardNavActions) {
  const mode = useWorkspaceStore((s) => s.mode);
  const panelExpanded = useWorkspaceStore((s) => s.panelExpanded);
  const setPanelExpanded = useWorkspaceStore((s) => s.setPanelExpanded);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when focused on input elements
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const meta = e.metaKey || e.ctrlKey;

      // Cmd+] — toggle panel collapsed/expanded
      if (meta && e.key === ']') {
        e.preventDefault();
        setPanelExpanded(!panelExpanded);
        return;
      }

      // Cmd+E — start extraction (idle only)
      if (meta && e.key === 'e' && mode === 'idle') {
        e.preventDefault();
        actions.startExtraction?.();
        return;
      }

      // Cmd+Z — undo (executed only)
      if (meta && e.key === 'z' && !e.shiftKey && mode === 'executed') {
        e.preventDefault();
        actions.undo?.();
        return;
      }

      // Cmd+Shift+Z — redo (executed only)
      if (meta && e.key === 'z' && e.shiftKey && mode === 'executed') {
        e.preventDefault();
        actions.redo?.();
        return;
      }

      // Cmd+Enter — commit (executed only)
      if (meta && e.key === 'Enter' && mode === 'executed') {
        e.preventDefault();
        actions.commit?.();
        return;
      }

      // Escape — cancel current edit
      if (e.key === 'Escape' && mode === 'executed') {
        e.preventDefault();
        actions.stopEdit?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, panelExpanded, actions, setPanelExpanded]);
}
