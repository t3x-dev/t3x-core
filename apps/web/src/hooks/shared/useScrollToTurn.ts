/**
 * useScrollToTurn — bridge from "I have a turn hash" to "scroll the chat
 * to that turn and briefly highlight it."
 *
 * The chat side already renders `data-turn-hash` on every chat message
 * (`ChatMessage.tsx:494`). PR 4 of the YOps Workbench plan wires this
 * existing target up to op-card click handlers so users can click a
 * source quote in an op card and jump to the turn that produced it.
 *
 * Pure DOM lookup + scroll. Returns a stable callback so callers can
 * pass it directly to `onClick` without re-creating subscriptions.
 *
 * Highlight is a temporary CSS class (`data-scroll-highlight`)
 * scheduled to clear after 1.5s; the chat side opts in by styling that
 * attribute. No state in this hook — the highlight is purely visual.
 */

import { useCallback } from 'react';

const HIGHLIGHT_ATTR = 'data-scroll-highlight';
const HIGHLIGHT_DURATION_MS = 1500;

export interface ScrollToTurnOptions {
  /**
   * Apply a temporary highlight attribute (default true). Set false
   * for cases where the consumer wants to scroll without flashing
   * (e.g. programmatic restore on conversation load).
   */
  highlight?: boolean;
  /**
   * Override the document used for the lookup (test injection). In
   * normal use the global `document` is fine; tests pass a custom
   * container so they can verify scroll/highlight without depending
   * on jsdom's full layout engine.
   */
  document?: Document;
}

export type ScrollToTurnFn = (turnHash: string, opts?: ScrollToTurnOptions) => boolean;

/**
 * Find the chat element rendered for `turnHash` and scroll it into
 * view. Returns `true` if the element was found, `false` otherwise.
 *
 * Lookup is a single `querySelector` against `[data-turn-hash="..."]`
 * — chat messages already render that attribute on the outer turn
 * container, so no new DOM contract is added by this PR. The
 * implementation note in plan §10 explicitly calls out reusing the
 * existing target rather than introducing a parallel id scheme.
 */
export function useScrollToTurn(): ScrollToTurnFn {
  return useCallback((turnHash, opts = {}) => {
    const doc = opts.document ?? (typeof document !== 'undefined' ? document : null);
    if (!doc) return false;
    const escaped = turnHash.replace(/"/g, '\\"');
    const el = doc.querySelector(`[data-turn-hash="${escaped}"]`);
    if (!el || !(el instanceof HTMLElement)) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (opts.highlight !== false) {
      el.setAttribute(HIGHLIGHT_ATTR, 'true');
      // Scoping the timeout to the element keeps multiple rapid
      // clicks from compounding — each click resets its own timer
      // since we always re-set the attribute first.
      window.setTimeout(() => {
        // Only clear if our attribute is still the current one. A
        // later click on a different turn already moved the highlight
        // somewhere else; that timer should win.
        if (el.getAttribute(HIGHLIGHT_ATTR) === 'true') {
          el.removeAttribute(HIGHLIGHT_ATTR);
        }
      }, HIGHLIGHT_DURATION_MS);
    }
    return true;
  }, []);
}
