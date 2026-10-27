import type { ApiCommit } from '@/types/api';
import { layoutHistoryLanes } from './historyLaneLayout';

export const COMPACT_GRAPH_ROW_HEIGHT = 23;
const LANE_WIDTH = 12;
const x = (lane: number) => 10 + lane * LANE_WIDTH;

export interface CompactGraphSegment {
  d: string;
  color: string;
}

/** Newest-first topological rows. Lanes track pending parent hashes, not branch
 * labels: merges into the same branch still retain their distinct parent edges. */
export function layoutCompactCommitGraph(commits: readonly ApiCommit[]) {
  const ordered = layoutHistoryLanes(commits).nodes.toReversed();
  const colors = new Map(ordered.map((node) => [node.hash, node.color]));
  const pending: Array<string | undefined> = [];
  let lanes = 1;
  const rows = ordered.map(({ commit, color }) => {
    let lane = pending.indexOf(commit.hash);
    const incoming = lane >= 0;
    if (!incoming) {
      lane = pending.indexOf(undefined);
      if (lane < 0) lane = pending.length;
    }
    const segments: CompactGraphSegment[] = [];
    const middle = COMPACT_GRAPH_ROW_HEIGHT / 2;
    for (const [index, hash] of pending.entries()) {
      if (!hash) continue;
      segments.push({
        d: `M ${x(index)} 0 V ${hash === commit.hash ? middle : COMPACT_GRAPH_ROW_HEIGHT}`,
        color: colors.get(hash) ?? color,
      });
    }
    pending[lane] = undefined;
    for (const [index, parent] of [...new Set(commit.parents)].entries()) {
      let target = pending.indexOf(parent);
      if (target < 0) {
        target = index === 0 ? lane : pending.indexOf(undefined);
        if (target < 0 || pending[target]) target = pending.length;
        pending[target] = parent;
      }
      segments.push({
        d:
          target === lane
            ? `M ${x(lane)} ${middle} V ${COMPACT_GRAPH_ROW_HEIGHT}`
            : `M ${x(lane)} ${middle} C ${x(lane)} ${COMPACT_GRAPH_ROW_HEIGHT}, ${x(target)} ${middle}, ${x(target)} ${COMPACT_GRAPH_ROW_HEIGHT}`,
        color: colors.get(parent) ?? color,
      });
    }
    lanes = Math.max(lanes, lane + 1, pending.length);
    while (pending.length && pending.at(-1) === undefined) pending.pop();
    return { commit, lane, x: x(lane), color, incoming, segments };
  });
  return { rows, width: x(lanes - 1) + 12 };
}
