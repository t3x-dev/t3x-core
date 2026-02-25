// @vitest-environment jsdom
/**
 * Tests for useTerminology hook and getTerminology / getTermItem functions
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook } from './hooks/renderHook';

// Mock settingsStore before importing useTerminology
vi.mock('@/store/settingsStore', () => {
  const { create } = require('zustand');
  const store = create(() => ({
    developerMode: false,
    setDeveloperMode: (enabled: boolean) => store.setState({ developerMode: enabled }),
    toggleDeveloperMode: () =>
      store.setState((s: { developerMode: boolean }) => ({
        developerMode: !s.developerMode,
      })),
  }));
  return { useSettingsStore: store };
});

import { getTermItem, getTerminology, useTerminology } from '@/hooks/useTerminology';
import { useSettingsStore } from '@/store/settingsStore';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  useSettingsStore.setState({ developerMode: false });
  vi.clearAllMocks();
});

afterEach(() => {
  cleanupRoots();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests: useTerminology hook
// ---------------------------------------------------------------------------

describe('useTerminology hook', () => {
  describe('t() function', () => {
    it('returns friendly terms in default mode', () => {
      const { result, unmount } = renderHook(() => useTerminology());

      expect(result.current.t('commit')).toBe('\u5FEB\u7167'); // 快照
      expect(result.current.t('branch')).toBe('\u53D8\u4F53'); // 变体
      expect(result.current.t('merge')).toBe('\u5408\u5E76'); // 合并
      expect(result.current.t('diff')).toBe('\u5BF9\u6BD4'); // 对比
      expect(result.current.t('head')).toBe('\u6700\u65B0\u7248'); // 最新版
      expect(result.current.t('draft')).toBe('\u8349\u7A3F'); // 草稿
      expect(result.current.t('committed')).toBe('\u5DF2\u4FDD\u5B58'); // 已保存
      expect(result.current.t('pending')).toBe('\u8FDB\u884C\u4E2D'); // 进行中
      unmount();
    });

    it('returns Git terms in developer mode', () => {
      useSettingsStore.setState({ developerMode: true });
      const { result, unmount } = renderHook(() => useTerminology());

      expect(result.current.t('commit')).toBe('Commit');
      expect(result.current.t('branch')).toBe('Branch');
      expect(result.current.t('merge')).toBe('Merge');
      expect(result.current.t('diff')).toBe('Diff');
      expect(result.current.t('head')).toBe('HEAD');
      expect(result.current.t('draft')).toBe('Draft');
      expect(result.current.t('committed')).toBe('Committed');
      expect(result.current.t('pending')).toBe('Pending');
      unmount();
    });

    it('returns the key itself for unknown keys', () => {
      const { result, unmount } = renderHook(() => useTerminology());
      expect(result.current.t('nonexistent_key')).toBe('nonexistent_key');
      unmount();
    });

    it('returns a string type', () => {
      const { result, unmount } = renderHook(() => useTerminology());
      const value = result.current.t('commit');
      expect(typeof value).toBe('string');
      unmount();
    });
  });

  describe('term() function', () => {
    it('returns { text, show } object', () => {
      const { result, unmount } = renderHook(() => useTerminology());
      const item = result.current.term('commit');
      expect(item).toHaveProperty('text');
      expect(item).toHaveProperty('show');
      unmount();
    });

    it('hash.show = false in default mode', () => {
      const { result, unmount } = renderHook(() => useTerminology());
      const hashTerm = result.current.term('hash');
      expect(hashTerm.text).toBe('Hash');
      expect(hashTerm.show).toBe(false);
      unmount();
    });

    it('hash.show = true in developer mode', () => {
      useSettingsStore.setState({ developerMode: true });
      const { result, unmount } = renderHook(() => useTerminology());
      const hashTerm = result.current.term('hash');
      expect(hashTerm.text).toBe('Hash');
      expect(hashTerm.show).toBe(true);
      unmount();
    });

    it('non-hash terms always show in default mode', () => {
      const { result, unmount } = renderHook(() => useTerminology());
      const commitTerm = result.current.term('commit');
      expect(commitTerm.show).toBe(true);

      const branchTerm = result.current.term('branch');
      expect(branchTerm.show).toBe(true);
      unmount();
    });

    it('unknown key returns { text: key, show: true }', () => {
      const { result, unmount } = renderHook(() => useTerminology());
      const unknown = result.current.term('totally_unknown');
      expect(unknown.text).toBe('totally_unknown');
      expect(unknown.show).toBe(true);
      unmount();
    });
  });

  describe('isDeveloperMode', () => {
    it('reflects false in default mode', () => {
      const { result, unmount } = renderHook(() => useTerminology());
      expect(result.current.isDeveloperMode).toBe(false);
      unmount();
    });

    it('reflects true in developer mode', () => {
      useSettingsStore.setState({ developerMode: true });
      const { result, unmount } = renderHook(() => useTerminology());
      expect(result.current.isDeveloperMode).toBe(true);
      unmount();
    });
  });

  describe('action verb terms', () => {
    it('returns friendly action verbs in default mode', () => {
      const { result, unmount } = renderHook(() => useTerminology());
      expect(result.current.t('commitAction')).toBe('Save');
      expect(result.current.t('mergeAction')).toBe('Combine Versions');
      expect(result.current.t('branchAction')).toBe('Create Version');
      expect(result.current.t('pushAction')).toBe('Publish');
      expect(result.current.t('pullAction')).toBe('Sync');
      unmount();
    });

    it('returns Git action verbs in developer mode', () => {
      useSettingsStore.setState({ developerMode: true });
      const { result, unmount } = renderHook(() => useTerminology());
      expect(result.current.t('commitAction')).toBe('Commit');
      expect(result.current.t('mergeAction')).toBe('Merge');
      expect(result.current.t('branchAction')).toBe('Create Branch');
      expect(result.current.t('pushAction')).toBe('Push');
      expect(result.current.t('pullAction')).toBe('Pull');
      unmount();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: getTerminology (non-hook)
// ---------------------------------------------------------------------------

describe('getTerminology (non-hook)', () => {
  it('returns friendly term when developerMode = false', () => {
    expect(getTerminology('commit', false)).toBe('\u5FEB\u7167'); // 快照
    expect(getTerminology('branch', false)).toBe('\u53D8\u4F53'); // 变体
  });

  it('returns Git term when developerMode = true', () => {
    expect(getTerminology('commit', true)).toBe('Commit');
    expect(getTerminology('branch', true)).toBe('Branch');
  });

  it('returns the key itself for unknown keys', () => {
    expect(getTerminology('unknown_key_xyz' as never, false)).toBe('unknown_key_xyz');
  });
});

// ---------------------------------------------------------------------------
// Tests: getTermItem (non-hook)
// ---------------------------------------------------------------------------

describe('getTermItem (non-hook)', () => {
  it('returns TermItem with correct text and show', () => {
    const item = getTermItem('commit', false);
    expect(item.text).toBe('\u5FEB\u7167'); // 快照
    expect(item.show).toBe(true);
  });

  it('hash.show = false when developerMode = false', () => {
    const item = getTermItem('hash', false);
    expect(item.show).toBe(false);
  });

  it('hash.show = true when developerMode = true', () => {
    const item = getTermItem('hash', true);
    expect(item.show).toBe(true);
  });

  it('unknown key returns { text: key, show: true }', () => {
    const item = getTermItem('xyz_missing' as never, false);
    expect(item.text).toBe('xyz_missing');
    expect(item.show).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Batch 4 terminology entries (tooltips, empty states, status bar)
// ---------------------------------------------------------------------------

describe('batch 4 terminology entries', () => {
  it('returns friendly terms for batch 4 entries in default mode', () => {
    const { result, unmount } = renderHook(() => useTerminology());

    expect(result.current.t('search_command')).toBe('\u641C\u7D22\u547D\u4EE4...'); // 搜索命令...
    expect(result.current.t('no_results')).toBe('\u6CA1\u6709\u627E\u5230\u7ED3\u679C'); // 没有找到结果
    expect(result.current.t('loading')).toBe('\u52A0\u8F7D\u4E2D...'); // 加载中...
    expect(result.current.t('all_branches')).toBe('\u5168\u90E8\u53D8\u4F53'); // 全部变体
    expect(result.current.t('new_branch_name')).toBe('\u8F93\u5165\u65B0\u53D8\u4F53\u540D\u79F0'); // 输入新变体名称
    expect(result.current.t('draft_from')).toBe('\u8349\u7A3F\u6765\u81EA'); // 草稿来自
    expect(result.current.t('configure_and_commit')).toBe('\u914D\u7F6E\u5E76\u4FDD\u5B58'); // 配置并保存
    unmount();
  });

  it('returns Git terms for batch 4 entries in developer mode', () => {
    useSettingsStore.setState({ developerMode: true });
    const { result, unmount } = renderHook(() => useTerminology());

    expect(result.current.t('search_command')).toBe('Search commands...');
    expect(result.current.t('no_results')).toBe('No results found');
    expect(result.current.t('loading')).toBe('Loading...');
    expect(result.current.t('all_branches')).toBe('All branches');
    expect(result.current.t('new_branch_name')).toBe('Enter new branch name');
    expect(result.current.t('draft_from')).toBe('Draft from');
    expect(result.current.t('configure_and_commit')).toBe('Configure and commit this unit');
    unmount();
  });

  it('empty_project returns friendly text in default mode', () => {
    const { result, unmount } = renderHook(() => useTerminology());
    expect(result.current.t('empty_project')).toContain('\u5F00\u59CB'); // contains 开始
    unmount();
  });

  it('empty_project returns dev text in developer mode', () => {
    useSettingsStore.setState({ developerMode: true });
    const { result, unmount } = renderHook(() => useTerminology());
    expect(result.current.t('empty_project')).toBe('Empty project. Create a conversation to start');
    unmount();
  });
});
