import { useCallback, useEffect, useState } from 'react';

interface UseKeyboardNavigationOptions {
  /** Ordered list of navigable item IDs. */
  ids: string[];
  /** Called when the active item changes (including null on deselect). */
  onSelect: (id: string | null) => void;
  /** Optional action triggered by the 'o' key on the current item. */
  onAction?: (id: string) => void;
  /** Set false to disable (e.g. while a modal is open). Default true. */
  enabled?: boolean;
  /**
   * Controlled active ID. When provided the hook reads this value instead of
   * managing its own internal state. Useful when the parent already owns the
   * active-item state (e.g. CommitDetailPage where clicks also set it).
   */
  activeId?: string | null;
}

/**
 * Shared keyboard navigation hook used across detail pages.
 *
 * Keys:
 *  j — next item (wraps)
 *  k — previous item (wraps)
 *  o — action on active item
 *  Escape — deselect
 *
 * Skips events when focus is in an input / textarea / contenteditable.
 *
 * Two modes:
 *  - **Uncontrolled** (default): hook manages `activeId` internally.
 *  - **Controlled**: pass `activeId` from parent; hook only fires `onSelect`.
 */
export function useKeyboardNavigation({
  ids,
  onSelect,
  onAction,
  enabled = true,
  activeId: controlledId,
}: UseKeyboardNavigationOptions): { activeId: string | null } {
  const isControlled = controlledId !== undefined;
  const [internalId, setInternalId] = useState<string | null>(null);
  const activeId = isControlled ? (controlledId ?? null) : internalId;

  const select = useCallback(
    (id: string | null) => {
      if (!isControlled) setInternalId(id);
      onSelect(id);
    },
    [onSelect, isControlled]
  );

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return;
      }

      const idx = activeId ? ids.indexOf(activeId) : -1;

      if (e.key === 'j') {
        e.preventDefault();
        const next = idx < ids.length - 1 ? ids[idx + 1] : ids[0];
        select(next);
      } else if (e.key === 'k') {
        e.preventDefault();
        const prev = idx > 0 ? ids[idx - 1] : ids[ids.length - 1];
        select(prev);
      } else if (e.key === 'o' && activeId) {
        e.preventDefault();
        onAction?.(activeId);
      } else if (e.key === 'Escape') {
        select(null);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeId, ids, select, onAction, enabled]);

  return { activeId };
}
