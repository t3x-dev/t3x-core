import { describe, expect, it } from 'vitest';
import { stateNodeHistoryEntry } from '@/domain/project/stateNodeHistory';
import type { ApiCommit } from '@/types/api';

const commit = (slots: Record<string, unknown>): ApiCommit => ({
  hash: 'head',
  parents: [],
  schema: 't3x/commit/v2',
  project_id: 'project',
  branch: 'main',
  author: { type: 'human' },
  committed_at: '2026-09-04T00:00:00Z',
  message: null,
  sources: null,
  provenance: null,
  content: { relations: [], trees: [{ key: 'prd', slots, children: [] }] },
});

describe('stateNodeHistoryEntry', () => {
  it.each([
    null,
    false,
    0,
    '',
    [],
    {},
  ])('distinguishes an existing %j value from a missing path', (value) => {
    expect(stateNodeHistoryEntry(commit({ outcome: value }), commit({}), 'prd/outcome')?.kind).toBe(
      'added'
    );
    expect(stateNodeHistoryEntry(commit({}), commit({ outcome: value }), 'prd/outcome')?.kind).toBe(
      'removed'
    );
  });

  it('skips absent and unchanged paths including reordered object keys', () => {
    expect(stateNodeHistoryEntry(commit({}), commit({ title: 'other' }), 'prd/outcome')).toBeNull();
    expect(
      stateNodeHistoryEntry(
        commit({ outcome: { b: 2, a: 1 } }),
        commit({ outcome: { a: 1, b: 2 } }),
        'prd/outcome'
      )
    ).toBeNull();
  });

  it('compares values rather than lossy summaries, preserving scalar types and array changes', () => {
    const change = stateNodeHistoryEntry(
      commit({ outcome: '1' }),
      commit({ outcome: 1 }),
      'prd/outcome'
    );
    expect(change?.kind).toBe('modified');
    expect(change?.before.text).not.toBe(change?.after.text);
    expect(
      stateNodeHistoryEntry(
        commit({ outcome: ['new'] }),
        commit({ outcome: ['old'] }),
        'prd/outcome'
      )?.kind
    ).toBe('modified');
    expect(
      stateNodeHistoryEntry(
        commit({ outcome: ['new'] }),
        commit({ outcome: ['old'] }),
        'prd/outcome/0'
      )?.after.text
    ).toBe('new');
  });

  it('detects descendant changes when selecting a group and a root creation', () => {
    expect(
      stateNodeHistoryEntry(commit({ outcome: 'new' }), commit({ outcome: 'old' }), 'prd')?.kind
    ).toBe('modified');
    expect(
      stateNodeHistoryEntry(commit({ outcome: 'new' }), null, 'prd/outcome')?.before.exists
    ).toBe(false);
  });

  it('uses State path normalization but rejects ambiguous normalized paths', () => {
    expect(stateNodeHistoryEntry(commit({ 'a.b': 1 }), null, 'prd/a/b')?.after.text).toBe('1');
    expect(() => stateNodeHistoryEntry(commit({ 'a.b': 1, a: { b: 2 } }), null, 'prd/a/b')).toThrow(
      'ambiguous'
    );
  });
});
