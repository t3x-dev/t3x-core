'use client';

/**
 * useTextSelection - Hook for tracking text selection within a container
 *
 * Listens for mouseup events and returns the selected text along with
 * its source turn metadata (turn_hash, role, char offsets).
 */

import { type RefObject, useCallback, useEffect, useState } from 'react';

export interface TextSelectionResult {
  text: string;
  turnHash: string;
  turnRole: string;
  startChar: number;
  endChar: number;
  rect: DOMRect;
}

export function useTextSelection(containerRef: RefObject<HTMLElement | null>): {
  selection: TextSelectionResult | null;
  clearSelection: () => void;
} {
  const [selection, setSelection] = useState<TextSelectionResult | null>(null);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  useEffect(() => {
    const handleMouseUp = () => {
      const container = containerRef.current;
      if (!container) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setSelection(null);
        return;
      }

      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      if (!text) {
        setSelection(null);
        return;
      }

      // Check selection is within the container
      if (!container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }

      // Find closest turn element (with data-turn-hash)
      const turnEl = findTurnElement(range.startContainer);
      if (!turnEl) {
        setSelection(null);
        return;
      }

      const turnHash = turnEl.getAttribute('data-turn-hash');
      const turnRole = turnEl.getAttribute('data-turn-role') || 'unknown';
      if (!turnHash) {
        setSelection(null);
        return;
      }

      // Compute character offsets relative to the turn's text content
      const contentEl = turnEl.querySelector('[data-turn-content]') || turnEl;
      const { start, end } = getCharOffsets(contentEl, range);

      const rect = range.getBoundingClientRect();

      setSelection({
        text,
        turnHash,
        turnRole,
        startChar: start,
        endChar: end,
        rect,
      });
    };

    // Clear selection when clicking outside
    const handleMouseDown = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      // If clicking outside the container, clear
      if (!container.contains(e.target as Node)) {
        setSelection(null);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef]);

  return { selection, clearSelection };
}

/**
 * Walk up the DOM tree to find an element with data-turn-hash
 */
function findTurnElement(node: Node): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.hasAttribute('data-turn-hash')) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * Compute character offsets of a Range relative to a container element's text content
 */
function getCharOffsets(container: Node, range: Range): { start: number; end: number } {
  const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let start = 0;
  let end = 0;
  let node: Node | null;

  while ((node = treeWalker.nextNode())) {
    if (node === range.startContainer) {
      start = charCount + range.startOffset;
    }
    if (node === range.endContainer) {
      end = charCount + range.endOffset;
      break;
    }
    charCount += node.textContent?.length ?? 0;
  }

  return { start, end };
}
