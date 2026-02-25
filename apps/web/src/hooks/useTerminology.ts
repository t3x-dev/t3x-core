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
  commit: { default: '快照', developer: 'Commit' },
  commits: { default: '快照', developer: 'Commits' },
  branch: { default: '变体', developer: 'Branch' },
  branches: { default: '变体', developer: 'Branches' },
  merge: { default: '合并', developer: 'Merge' },
  diff: { default: '对比', developer: 'Diff' },
  head: { default: '最新版', developer: 'HEAD' },
  hash: { default: 'Hash', developer: 'Hash', showInDefault: false },
  draft: { default: '草稿', developer: 'Draft' },
  committed: { default: '已保存', developer: 'Committed' },
  pending: { default: '进行中', developer: 'Pending' },

  // Merge sentence categories
  identical_sentences: { default: '未变化', developer: 'Identical' },
  modified_sentences: { default: '已修改', developer: 'Modified' },
  added_sentences: { default: '新增', developer: 'Added' },
  removed_sentences: { default: '已移除', developer: 'Removed' },

  // Verbs / Actions
  commitAction: { default: 'Save', developer: 'Commit' },
  mergeAction: { default: 'Combine Versions', developer: 'Merge' },
  branchAction: { default: 'Create Version', developer: 'Create Branch' },
  pushAction: { default: 'Publish', developer: 'Push' },
  pullAction: { default: 'Sync', developer: 'Pull' },

  // Merge Review / Preview
  mergePreview: { default: '合并预览', developer: 'Merge Preview' },
  mergeReview: { default: 'Review Changes', developer: 'Merge Review' },
  mergeConfirm: { default: 'Confirm', developer: 'Execute Merge' },
  mergeReviewCancel: { default: 'Go Back', developer: 'Cancel' },
  unresolved: { default: 'Needs Decision', developer: 'Unresolved' },
  resolved: { default: 'Decided', developer: 'Resolved' },

  // Batch 4: Command palette, tooltips, empty states
  search_command: { default: '搜索命令...', developer: 'Search commands...' },
  no_results: { default: '没有找到结果', developer: 'No results found' },
  empty_project: {
    default: '还没有内容，开始你的第一个对话',
    developer: 'Empty project. Create a conversation to start',
  },
  loading: { default: '加载中...', developer: 'Loading...' },
  all_branches: { default: '全部变体', developer: 'All branches' },
  configure_and_commit: { default: '配置并保存', developer: 'Configure and commit this unit' },
  new_branch_name: { default: '输入新变体名称', developer: 'Enter new branch name' },
  draft_from: { default: '草稿来自', developer: 'Draft from' },
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
 * t('commit')           // "快照" (default) or "Commit" (developer)
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
