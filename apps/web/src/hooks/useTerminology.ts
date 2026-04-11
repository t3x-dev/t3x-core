/**
 * useTerminology — Dual-mode noun/verb mapping for UI text.
 *
 * In default mode, uses governance-friendly terms (e.g., "Snapshot", "Review").
 * In developer mode, uses Git-oriented terms (e.g., "Commit", "Merge").
 *
 * Only applies to user-visible UI text — not variable names or code identifiers.
 */

import { useSettingsStore } from '@/store/settingsStore';

interface TermEntry {
  default: string;
  developer: string;
  /** Whether to show this term's UI block. Default: always. Some terms (e.g., hash) only show in developer mode. */
  showInDefault?: boolean;
}

const TERMINOLOGY: Record<string, TermEntry> = {
  // Nouns
  commit: { default: 'Commit', developer: 'Commit' },
  commits: { default: 'Commits', developer: 'Commits' },
  branch: { default: 'Branch', developer: 'Branch' },
  branches: { default: 'Branches', developer: 'Branches' },
  merge: { default: 'Merge', developer: 'Merge' },
  diff: { default: 'Diff', developer: 'Diff' },
  head: { default: 'HEAD', developer: 'HEAD' },
  hash: { default: 'Hash', developer: 'Hash', showInDefault: false },
  draft: { default: 'Draft', developer: 'Draft' },
  committed: { default: 'Committed', developer: 'Committed' },
  pending: { default: 'Pending', developer: 'Pending' },

  // Extended nouns / labels
  create_commit: { default: 'Create Commit', developer: 'Create Commit' },
  create_branch: { default: 'Create Branch', developer: 'Create Branch' },
  select_branch: { default: 'Select Branch', developer: 'Select Branch' },
  commit_history: { default: 'Commit History', developer: 'Commit History' },
  commit_hash: { default: 'Hash', developer: 'Hash', showInDefault: false },
  parent_commit: { default: 'Parent Commit', developer: 'Parent Commit' },
  branch_name: { default: 'Branch', developer: 'Branch' },
  pending_changes: { default: 'Pending Changes', developer: 'Pending Changes' },
  unit: { default: 'Unit', developer: 'Unit' },
  leaf: { default: 'Leaf', developer: 'Leaf' },
  conversation: { default: 'Conversation', developer: 'Conversation' },
  empty_canvas: { default: 'Empty canvas', developer: 'Empty canvas' },

  // Merge node categories
  identical_nodes: { default: 'Identical', developer: 'Identical' },
  equivalent_nodes: { default: 'Equivalent', developer: 'Equivalent' },
  modified_nodes: { default: 'Modified', developer: 'Modified' },
  added_nodes: { default: 'Added', developer: 'Added' },
  removed_nodes: { default: 'Removed', developer: 'Removed' },

  // Verbs / Actions
  commitAction: { default: 'Commit', developer: 'Commit' },
  mergeAction: { default: 'Merge', developer: 'Merge' },
  branchAction: { default: 'Create Branch', developer: 'Create Branch' },
  pushAction: { default: 'Push', developer: 'Push' },
  pullAction: { default: 'Pull', developer: 'Pull' },

  // Diff / Merge labels
  source: { default: 'Source', developer: 'Source' },
  target: { default: 'Target', developer: 'Target' },
  only_in_source: { default: 'Only in Source', developer: 'Only in Source' },
  only_in_target: { default: 'Only in Target', developer: 'Only in Target' },
  conflicts: { default: 'Conflicts', developer: 'Conflicts' },
  keep_source: { default: 'Keep Source', developer: 'Keep Source' },
  keep_target: { default: 'Keep Target', developer: 'Keep Target' },
  keep_both: { default: 'Keep Both', developer: 'Keep Both' },
  similarity: { default: 'Similarity', developer: 'Similarity' },
  auto_kept: { default: 'Auto-kept', developer: 'Auto-kept' },
  preview: { default: 'Preview', developer: 'Preview' },

  // Merge Review / Preview
  mergePreview: { default: 'Merge Preview', developer: 'Merge Preview' },
  mergeReview: { default: 'Merge Review', developer: 'Merge Review' },
  mergeConfirm: { default: 'Execute Merge', developer: 'Execute Merge' },
  mergeReviewCancel: { default: 'Cancel', developer: 'Cancel' },
  unresolved: { default: 'Unresolved', developer: 'Unresolved' },
  resolved: { default: 'Resolved', developer: 'Resolved' },

  // Batch 5: Commit/Draft/Merge workflow labels
  commit_draft: { default: 'Commit Draft', developer: 'Commit Draft' },
  commit_message: { default: 'Commit message', developer: 'Commit message' },
  committing: { default: 'Committing...', developer: 'Committing...' },
  knowledge_committed: { default: 'Knowledge committed', developer: 'Knowledge committed' },
  draft_committed: { default: 'Draft committed', developer: 'Draft committed' },
  commit_failed: { default: 'Commit failed', developer: 'Commit failed' },
  merge_failed: { default: 'Merge failed', developer: 'Merge failed' },
  commit_created: { default: 'Commit Created', developer: 'Commit Created' },
  merge_completed: { default: 'Merge Completed', developer: 'Merge Completed' },
  leaf_created: { default: 'Leaf Created', developer: 'Leaf Created' },
  leaf_generated: { default: 'Leaf Generated', developer: 'Leaf Generated' },
  run_completed: { default: 'Run Completed', developer: 'Run Completed' },
  run_failed: { default: 'Run Failed', developer: 'Run Failed' },
  draft_from_canvas: { default: 'Draft from Canvas', developer: 'Draft from Canvas' },

  // Batch 4: Command palette, tooltips, empty states
  search_command: { default: 'Search commands...', developer: 'Search commands...' },
  no_results: { default: 'No results found', developer: 'No results found' },
  empty_project: {
    default: 'Empty project. Create a conversation to start',
    developer: 'Empty project. Create a conversation to start',
  },
  loading: { default: 'Loading...', developer: 'Loading...' },
  all_branches: { default: 'All branches', developer: 'All branches' },
  configure_and_commit: { default: 'Configure and commit this unit', developer: 'Configure and commit this unit' },
  new_branch_name: { default: 'Enter new branch name', developer: 'Enter new branch name' },
  draft_from: { default: 'Draft from', developer: 'Draft from' },
};

export type TermKey = keyof typeof TERMINOLOGY;

export interface TermItem {
  text: string;
  show: boolean;
}

/**
 * Returns terminology helpers bound to the current developer mode setting.
 *
 * @example
 * const { t, term, isDeveloperMode } = useTerminology();
 * t('commit')           // "Commit" (default & developer)
 * term('hash')          // { text: "Hash", show: false } in default mode
 * term('hash').show     // false in default, true in developer
 */
export function useTerminology() {
  const isDeveloperMode = useSettingsStore((s) => s.developerMode);

  const t = (key: TermKey): string => {
    const entry = TERMINOLOGY[key];
    if (!entry) return key;
    return isDeveloperMode ? entry.developer : entry.default;
  };

  const term = (key: TermKey): TermItem => {
    const entry = TERMINOLOGY[key];
    if (!entry) return { text: key, show: true };
    return {
      text: isDeveloperMode ? entry.developer : entry.default,
      show: isDeveloperMode || entry.showInDefault !== false,
    };
  };

  return { t, term, isDeveloperMode };
}

/**
 * Non-hook version for use outside React components (e.g., in stores).
 */
export function getTerminology(key: TermKey, developerMode: boolean): string {
  const entry = TERMINOLOGY[key];
  if (!entry) return key;
  return developerMode ? entry.developer : entry.default;
}

/**
 * Non-hook version of term() for use outside React components.
 */
export function getTermItem(key: TermKey, developerMode: boolean): TermItem {
  const entry = TERMINOLOGY[key];
  if (!entry) return { text: key, show: true };
  return {
    text: developerMode ? entry.developer : entry.default,
    show: developerMode || entry.showInDefault !== false,
  };
}
