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

  // Extended nouns / labels
  create_commit: { default: 'Save Knowledge', developer: 'Create Commit' },
  create_branch: { default: 'Create Version', developer: 'Create Branch' },
  select_branch: { default: 'Select Version', developer: 'Select Branch' },
  commit_history: { default: 'History', developer: 'Commit History' },
  commit_hash: { default: 'ID', developer: 'Hash', showInDefault: false },
  parent_commit: { default: 'Previous', developer: 'Parent Commit' },
  branch_name: { default: 'Version', developer: 'Branch' },
  pending_changes: { default: 'In Progress', developer: 'Pending Changes' },
  unit: { default: '单元', developer: 'Unit' },
  leaf: { default: '输出', developer: 'Leaf' },
  conversation: { default: 'Conversation', developer: 'Conversation' },
  empty_canvas: { default: 'Start your first conversation', developer: 'Empty canvas' },

  // Merge node categories
  identical_nodes: { default: '未变化', developer: 'Identical' },
  equivalent_nodes: { default: '等价', developer: 'Equivalent' },
  modified_nodes: { default: '已修改', developer: 'Modified' },
  added_nodes: { default: '新增', developer: 'Added' },
  removed_nodes: { default: '已移除', developer: 'Removed' },

  // Verbs / Actions
  commitAction: { default: 'Save', developer: 'Commit' },
  mergeAction: { default: 'Combine Versions', developer: 'Merge' },
  branchAction: { default: 'Create Version', developer: 'Create Branch' },
  pushAction: { default: 'Publish', developer: 'Push' },
  pullAction: { default: 'Sync', developer: 'Pull' },

  // Diff / Merge labels
  source: { default: '原版', developer: 'Source' },
  target: { default: '新版', developer: 'Target' },
  only_in_source: { default: '仅在原版', developer: 'Only in Source' },
  only_in_target: { default: '仅在新版', developer: 'Only in Target' },
  conflicts: { default: '冲突', developer: 'Conflicts' },
  keep_source: { default: '保留原版', developer: 'Keep Source' },
  keep_target: { default: '保留新版', developer: 'Keep Target' },
  keep_both: { default: '全部保留', developer: 'Keep Both' },
  similarity: { default: '相似度', developer: 'Similarity' },
  auto_kept: { default: '自动保留', developer: 'Auto-kept' },
  preview: { default: '预览', developer: 'Preview' },

  // Merge Review / Preview
  mergePreview: { default: '合并预览', developer: 'Merge Preview' },
  mergeReview: { default: 'Review Changes', developer: 'Merge Review' },
  mergeConfirm: { default: 'Confirm', developer: 'Execute Merge' },
  mergeReviewCancel: { default: 'Go Back', developer: 'Cancel' },
  unresolved: { default: 'Needs Decision', developer: 'Unresolved' },
  resolved: { default: 'Decided', developer: 'Resolved' },

  // Batch 5: Commit/Draft/Merge workflow labels
  commit_draft: { default: '保存草稿', developer: 'Commit Draft' },
  commit_message: { default: '保存说明', developer: 'Commit message' },
  committing: { default: '保存中...', developer: 'Committing...' },
  knowledge_committed: { default: '知识已保存', developer: 'Knowledge committed' },
  draft_committed: { default: '草稿已保存', developer: 'Draft committed' },
  commit_failed: { default: '保存失败', developer: 'Commit failed' },
  merge_failed: { default: '合并失败', developer: 'Merge failed' },
  commit_created: { default: '快照已创建', developer: 'Commit Created' },
  merge_completed: { default: '合并完成', developer: 'Merge Completed' },
  leaf_created: { default: '输出已创建', developer: 'Leaf Created' },
  leaf_generated: { default: '输出已生成', developer: 'Leaf Generated' },
  run_completed: { default: '运行完成', developer: 'Run Completed' },
  run_failed: { default: '运行失败', developer: 'Run Failed' },
  draft_from_canvas: { default: '来自画布的草稿', developer: 'Draft from Canvas' },

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
