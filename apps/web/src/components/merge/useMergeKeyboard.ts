import type React from 'react';
import { useEffect } from 'react';

interface UseMergeKeyboardOptions {
  saveDraft: () => void;
  canCommit: () => boolean;
  handleCancel: () => void;
  showReviewDialog: boolean;
  setShowReviewDialog: (open: boolean) => void;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isTreeMode: boolean;
  allTreeConflictsResolved: () => boolean;
  message: string;
}

/**
 * Keyboard shortcuts for the merge workspace:
 * - Cmd/Ctrl+S: save draft
 * - Cmd/Ctrl+Enter: open review dialog (if can commit)
 * - Cmd/Ctrl+B: toggle sidebar
 * - Escape: cancel merge (if no dialog open and not in an input)
 */
export function useMergeKeyboard({
  saveDraft,
  canCommit,
  handleCancel,
  showReviewDialog,
  setShowReviewDialog,
  setSidebarCollapsed,
  isTreeMode,
  allTreeConflictsResolved,
  message,
}: UseMergeKeyboardOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveDraft();
      }

      // Cmd/Ctrl + Enter to open review dialog
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (isTreeMode ? allTreeConflictsResolved() && message.trim() : canCommit()) {
          setShowReviewDialog(true);
        }
      }

      // Cmd/Ctrl + B to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }

      // Escape to cancel merge (only if dialog is not open)
      if (e.key === 'Escape' && !showReviewDialog) {
        // Don't cancel if user is typing in an input
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.getAttribute('contenteditable'))
        ) {
          return; // let the input handle Escape
        }
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    saveDraft,
    canCommit,
    handleCancel,
    showReviewDialog,
    setShowReviewDialog,
    setSidebarCollapsed,
    isTreeMode,
    allTreeConflictsResolved,
    message,
  ]);
}
