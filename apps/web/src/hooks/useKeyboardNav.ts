/**
 * useKeyboardNav — Global keyboard shortcuts for the Gold Step panel.
 *
 * Actions are injected via params so this hook stays decoupled from
 * Person A's stores (commandStore, commitStore, draftStore).
 * During migration, callers can pass no-ops for unimplemented actions.
 */

import { useEffect } from 'react';
import { usePhaseStore } from '@/store/phaseStore';

interface KeyboardNavActions {
  /** Cmd+Z — undo last YOp (review only) */
  undo?: () => void;
  /** Cmd+Shift+Z — redo (review only) */
  redo?: () => void;
  /** Cmd+Enter — commit all pending changes (review only) */
  commit?: () => void;
  /** Cmd+E — start extraction (idle only) */
  startExtraction?: () => void;
  /** Esc — cancel current edit or go back */
  stopEdit?: () => void;
}

export function useKeyboardNav(actions: KeyboardNavActions) {
  const phase = usePhaseStore((s) => s.phase);
  const viewTab = usePhaseStore((s) => s.viewTab);
  const setPhase = usePhaseStore((s) => s.setPhase);
  const setViewTab = usePhaseStore((s) => s.setViewTab);
  const togglePanel = usePhaseStore((s) => s.togglePanel);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when focused on input elements
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const meta = e.metaKey || e.ctrlKey;

      // Cmd+] — toggle panel collapsed/expanded
      if (meta && e.key === ']') {
        e.preventDefault();
        togglePanel();
        return;
      }

      // Cmd+E — start extraction (idle only)
      if (meta && e.key === 'e' && phase === 'idle') {
        e.preventDefault();
        actions.startExtraction?.();
        return;
      }

      // Cmd+Z — undo (review only)
      if (meta && e.key === 'z' && !e.shiftKey && phase === 'review') {
        e.preventDefault();
        actions.undo?.();
        return;
      }

      // Cmd+Shift+Z — redo (review only)
      if (meta && e.key === 'z' && e.shiftKey && phase === 'review') {
        e.preventDefault();
        actions.redo?.();
        return;
      }

      // Cmd+Enter — commit (review only)
      if (meta && e.key === 'Enter' && phase === 'review') {
        e.preventDefault();
        actions.commit?.();
        return;
      }

      // 'a' key — accept all (triage only)
      if (e.key === 'a' && !meta && viewTab === 'triage') {
        e.preventDefault();
        // TODO: call triageStore.acceptAll() — keep here or inject?
        return;
      }

      // Enter — proceed to next phase (triage → review)
      if (e.key === 'Enter' && !meta && viewTab === 'triage') {
        e.preventDefault();
        setPhase('review');
        return;
      }

      // Escape — back / cancel edit
      if (e.key === 'Escape') {
        if (viewTab === 'review') {
          e.preventDefault();
          const entryPath = usePhaseStore.getState().entryPath;
          if (entryPath === 'extract') {
            setViewTab('triage');
          }
          actions.stopEdit?.();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, viewTab, actions, setPhase, setViewTab, togglePanel]);
}
