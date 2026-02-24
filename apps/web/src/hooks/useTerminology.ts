/**
 * useTerminology — Dual-mode noun/verb mapping for UI text.
 *
 * In default mode, uses governance-friendly terms (e.g., "Save", "Review").
 * In developer mode, uses Git-oriented terms (e.g., "Commit", "Merge").
 *
 * Only applies to user-visible UI text — not variable names or code identifiers.
 */

import { useSettingsStore } from '@/store/settingsStore';

const TERMINOLOGY: Record<string, { default: string; developer: string }> = {
  // Nouns
  commit: { default: 'Snapshot', developer: 'Commit' },
  branch: { default: 'Version', developer: 'Branch' },
  merge: { default: 'Combine', developer: 'Merge' },
  diff: { default: 'Changes', developer: 'Diff' },
  repository: { default: 'Project', developer: 'Repository' },
  head: { default: 'Latest', developer: 'HEAD' },
  hash: { default: 'ID', developer: 'Hash' },
  staging: { default: 'Draft', developer: 'Staging' },
  checkout: { default: 'Switch', developer: 'Checkout' },
  revert: { default: 'Undo', developer: 'Revert' },
  conflict: { default: 'Difference', developer: 'Conflict' },

  // Verbs / Actions
  commitAction: { default: 'Save', developer: 'Commit' },
  mergeAction: { default: 'Combine Versions', developer: 'Merge' },
  branchAction: { default: 'Create Version', developer: 'Create Branch' },
  pushAction: { default: 'Publish', developer: 'Push' },
  pullAction: { default: 'Sync', developer: 'Pull' },

  // Merge Review
  mergeReview: { default: 'Review Changes', developer: 'Merge Review' },
  mergeConfirm: { default: 'Confirm', developer: 'Execute Merge' },
  mergeReviewCancel: { default: 'Go Back', developer: 'Cancel' },
  unresolved: { default: 'Needs Decision', developer: 'Unresolved' },
  resolved: { default: 'Decided', developer: 'Resolved' },
};

export type TermKey = keyof typeof TERMINOLOGY;

/**
 * Returns the appropriate term for the current mode.
 *
 * @example
 * const t = useTerminology();
 * t('commit')       // "Snapshot" (default) or "Commit" (developer)
 * t('mergeAction')  // "Combine Versions" or "Merge"
 */
export function useTerminology() {
  const isDeveloper = useSettingsStore((s) => s.developerMode);

  return (key: TermKey): string => {
    const entry = TERMINOLOGY[key];
    if (!entry) return key;
    return isDeveloper ? entry.developer : entry.default;
  };
}

/**
 * Non-hook version for use outside React components (e.g., in stores).
 */
export function getTerminology(key: TermKey, developerMode: boolean): string {
  const entry = TERMINOLOGY[key];
  if (!entry) return key;
  return developerMode ? entry.developer : entry.default;
}
