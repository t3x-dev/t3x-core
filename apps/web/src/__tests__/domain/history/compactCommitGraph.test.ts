import { describe, expect, it } from 'vitest';
import {
  COMPACT_GRAPH_ROW_HEIGHT,
  layoutCompactCommitGraph,
} from '@/domain/history/compactCommitGraph';
import type { ApiCommit } from '@/types/api';

function commit(hash: string, parents: string[] = [], branch = 'main'): ApiCommit {
  return {
    hash,
    parents,
    branch,
    project_id: 'p',
    schema: 't3x/commit/v2',
    committed_at: '2026-10-22T01:00:00Z',
    message: hash,
    author: { type: 'human' },
    content: { trees: [], relations: [] },
    sources: null,
    provenance: null,
  };
}

describe('compact commit graph', () => {
  it('keeps children above parents even when timestamps tie or input is shuffled', () => {
    const root = commit('root');
    const child = commit('child', ['root']);
    const newest = commit('newest', ['child']);
    const graph = layoutCompactCommitGraph([child, root, newest]);
    expect(graph.rows.map((row) => row.commit.hash)).toEqual(['newest', 'child', 'root']);
    expect(graph.rows.map((row) => row.lane)).toEqual([0, 0, 0]);
    expect(graph.rows.map((row) => row.incoming)).toEqual([false, true, true]);
    expect(graph.rows[0].segments[0].d).toBe(
      `M 10 ${COMPACT_GRAPH_ROW_HEIGHT / 2} V ${COMPACT_GRAPH_ROW_HEIGHT}`
    );
    expect(graph).toEqual(layoutCompactCommitGraph([newest, root, child]));
  });

  it('draws both merge parents even when all commits have the same origin label', () => {
    const graph = layoutCompactCommitGraph([
      commit('root'),
      commit('a', ['root']),
      commit('b', ['root']),
      commit('merged', ['a', 'b']),
    ]);
    const row = (hash: string) => graph.rows.find((item) => item.commit.hash === hash)!;
    expect(row('merged').segments).toHaveLength(2);
    expect(row('a').lane).not.toBe(row('b').lane);
    expect(row('root').segments).toHaveLength(1);
    expect(row('root').incoming).toBe(true);
    expect(graph.rows).toHaveLength(4);
  });

  it('preserves the parent topology of reciprocal merges without duplicating ancestors', () => {
    const commits = [
      commit('root'),
      commit('dev', ['root'], 'dev'),
      commit('main', ['root']),
      commit('merged', ['main', 'dev']),
      commit('synced', ['dev', 'merged'], 'dev'),
    ];
    const graph = layoutCompactCommitGraph([...commits, commits[0]]);
    expect(graph.rows.map((row) => row.commit.hash)).toEqual([
      'synced',
      'merged',
      'main',
      'dev',
      'root',
    ]);
    const index = new Map(graph.rows.map((row, i) => [row.commit.hash, i]));
    for (const { commit: item } of graph.rows)
      for (const parent of item.parents)
        expect(index.get(parent)).toBeGreaterThan(index.get(item.hash)!);
    expect(graph).toEqual(layoutCompactCommitGraph(commits.toReversed()));
  });

  it('reuses finished lanes instead of reserving a column for every historical branch', () => {
    const graph = layoutCompactCommitGraph([
      commit('one'),
      commit('two', ['one'], 'dev'),
      commit('three', ['two'], 'another-branch'),
    ]);
    expect(graph.width).toBe(22);
    expect(graph.rows.every((row) => row.lane === 0)).toBe(true);
  });

  it('keeps unloaded parents as continuation lines and never connects unrelated roots', () => {
    const graph = layoutCompactCommitGraph([
      commit('child', ['outside-page']),
      commit('unrelated'),
    ]);
    expect(graph.rows.every((row) => !row.incoming)).toBe(true);
    expect(layoutCompactCommitGraph([]).rows).toEqual([]);
  });
});
