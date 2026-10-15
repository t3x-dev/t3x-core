import { describe, expect, it } from 'vitest';
import { HISTORY_LANE_LAYOUT, layoutHistoryLanes } from '@/domain/history/historyLaneLayout';
import type { ApiCommit } from '@/types/api';

function commit(
  hash: string,
  parents: string[],
  branch: string | undefined = 'main',
  committedAt = '2026-09-14T03:20:00Z'
): ApiCommit {
  return {
    hash,
    schema: 't3x/commit/v2',
    project_id: 'proj_test',
    branch,
    parents,
    author: { type: 'human', name: 'Maya Chen' },
    committed_at: committedAt,
    message: hash,
    content: { trees: [], relations: [] },
    sources: [],
    provenance: null,
  } as ApiCommit;
}

const root = commit('sha256:root', [], 'main', '2026-09-14T01:00:00Z');
const feature = commit('sha256:feature', [root.hash], 'feature/canary', '2026-09-14T02:00:00Z');
const main = commit('sha256:main', [root.hash], 'main', '2026-09-14T03:00:00Z');
const merge = commit('sha256:merge', [main.hash, feature.hash], 'main', '2026-09-14T04:00:00Z');

describe('layoutHistoryLanes', () => {
  it('lays out every commit with parents before children', () => {
    const layout = layoutHistoryLanes([merge, main, feature, root]);

    expect(layout.nodes.map((node) => node.hash)).toEqual([
      root.hash,
      feature.hash,
      main.hash,
      merge.hash,
    ]);
    expect(layout.nodes.map((node) => node.column)).toEqual([0, 1, 2, 3]);
    expect(layout.nodes.find((node) => node.hash === root.hash)?.root).toBe(true);
    expect(layout.nodes.filter((node) => node.root)).toHaveLength(1);
  });

  it('puts main in the first lane and each branch in its own lane', () => {
    const layout = layoutHistoryLanes([merge, main, feature, root]);

    expect(layout.lanes.map((lane) => lane.branch)).toEqual(['main', 'feature/canary']);
    const laneOf = (hash: string) => layout.nodes.find((node) => node.hash === hash)?.lane;
    expect([root, main, merge].map((item) => laneOf(item.hash))).toEqual([0, 0, 0]);
    expect(laneOf(feature.hash)).toBe(1);
    expect(layout.height).toBe(
      HISTORY_LANE_LAYOUT.padding * 2 + 2 * HISTORY_LANE_LAYOUT.laneHeight
    );
  });

  it('marks forks and merge parents as cross-lane edges', () => {
    const layout = layoutHistoryLanes([merge, main, feature, root]);
    const edge = (parent: string, child: string) =>
      layout.edges.find((item) => item.parentHash === parent && item.childHash === child);

    expect(edge(root.hash, main.hash)?.crossLane).toBe(false);
    expect(edge(main.hash, merge.hash)?.crossLane).toBe(false);
    expect(edge(root.hash, feature.hash)?.crossLane).toBe(true);
    expect(edge(feature.hash, merge.hash)?.crossLane).toBe(true);
    expect(edge(root.hash, main.hash)?.d).toMatch(/^M [\d.]+ [\d.]+ L /);
    expect(layout.edges).toHaveLength(4);
  });

  it('inherits the first parent branch and ignores parents outside the loaded page', () => {
    const orphan = commit('sha256:orphan', ['sha256:not-loaded'], 'dev');
    const child = commit('sha256:child', [orphan.hash], '');
    const layout = layoutHistoryLanes([child, orphan]);

    expect(layout.nodes.map((node) => [node.hash, node.branch, node.root])).toEqual([
      [orphan.hash, 'dev', true],
      [child.hash, 'dev', false],
    ]);
    expect(layout.edges).toHaveLength(1);
  });

  it('is deterministic regardless of input order', () => {
    const first = layoutHistoryLanes([merge, main, feature, root]);
    const second = layoutHistoryLanes([root, feature, merge, main]);

    expect(second).toEqual(first);
  });
});
