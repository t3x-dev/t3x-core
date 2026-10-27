import type { ApiCommit } from '@/types/api';

export const HISTORY_LANE_LAYOUT = Object.freeze({
  padding: 48,
  laneLabelWidth: 120,
  columnWidth: 300,
  laneHeight: 200,
  nodeWidth: 240,
  nodeHeight: 132,
});

/** Small graphs render every card; larger ones only render what the viewport shows. */
export const HISTORY_VIRTUALIZE_AFTER = 40;

const LANE_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6'];

export interface HistoryLane {
  branch: string;
  index: number;
  color: string;
  y: number;
}

export interface HistoryLaneNode {
  commit: ApiCommit;
  hash: string;
  branch: string;
  lane: number;
  column: number;
  color: string;
  x: number;
  y: number;
  root: boolean;
}

export interface HistoryLaneEdge {
  key: string;
  parentHash: string;
  childHash: string;
  /** The child leaves its parent's lane: a fork, or the extra parent of a merge. */
  crossLane: boolean;
  color: string;
  d: string;
}

export interface HistoryLaneLayout {
  lanes: HistoryLane[];
  nodes: HistoryLaneNode[];
  edges: HistoryLaneEdge[];
  width: number;
  height: number;
}

function comparePortable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function commitTime(commit: ApiCommit): number {
  const time = Date.parse(commit.committed_at);
  return Number.isFinite(time) ? time : 0;
}

/** Parents always precede children; ties fall back to commit time, then hash. */
function topologicalOrder(commits: readonly ApiCommit[]): ApiCommit[] {
  const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
  const pending = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const commit of byHash.values()) {
    const parents = [...new Set(commit.parents)].filter((parent) => byHash.has(parent));
    pending.set(commit.hash, parents.length);
    for (const parent of parents) {
      children.set(parent, [...(children.get(parent) ?? []), commit.hash]);
    }
  }
  const before = (left: ApiCommit, right: ApiCommit) =>
    commitTime(left) - commitTime(right) || comparePortable(left.hash, right.hash);
  const ready = [...byHash.values()].filter((commit) => pending.get(commit.hash) === 0);
  const ordered: ApiCommit[] = [];
  while (ready.length > 0) {
    ready.sort(before);
    const next = ready.shift()!;
    ordered.push(next);
    for (const child of children.get(next.hash) ?? []) {
      const remaining = (pending.get(child) ?? 0) - 1;
      pending.set(child, remaining);
      if (remaining === 0) ready.push(byHash.get(child)!);
    }
  }
  // A cycle cannot come from content-addressed history; keep any leftovers visible anyway.
  const placed = new Set(ordered.map((commit) => commit.hash));
  return [
    ...ordered,
    ...[...byHash.values()].filter((commit) => !placed.has(commit.hash)).sort(before),
  ];
}

function edgePath(parent: HistoryLaneNode, child: HistoryLaneNode): string {
  const { nodeWidth, nodeHeight } = HISTORY_LANE_LAYOUT;
  const startX = parent.x + nodeWidth;
  const startY = parent.y + nodeHeight / 2;
  const endX = child.x;
  const endY = child.y + nodeHeight / 2;
  if (startY === endY) return `M ${startX} ${startY} L ${endX} ${endY}`;
  const bend = Math.max(48, (endX - startX) / 2);
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`;
}

/** Deterministic lane layout: one column per commit, one lane per branch, main first. */
export function layoutHistoryLanes(commits: readonly ApiCommit[]): HistoryLaneLayout {
  const { padding, laneLabelWidth, columnWidth, laneHeight, nodeWidth, nodeHeight } =
    HISTORY_LANE_LAYOUT;
  const ordered = topologicalOrder(commits);
  const branchOf = new Map<string, string>();
  for (const commit of ordered) {
    const firstParent = commit.parents.find((parent) => branchOf.has(parent));
    branchOf.set(
      commit.hash,
      commit.branch?.trim() || (firstParent ? branchOf.get(firstParent)! : 'main')
    );
  }
  const firstSeen = new Map<string, number>();
  ordered.forEach((commit, column) => {
    const branch = branchOf.get(commit.hash)!;
    if (!firstSeen.has(branch)) firstSeen.set(branch, column);
  });
  const lanes: HistoryLane[] = [...firstSeen.keys()]
    .sort(
      (left, right) =>
        Number(right === 'main') - Number(left === 'main') ||
        firstSeen.get(left)! - firstSeen.get(right)! ||
        comparePortable(left, right)
    )
    .map((branch, index) => ({
      branch,
      index,
      color: LANE_COLORS[index % LANE_COLORS.length]!,
      y: padding + index * laneHeight,
    }));
  const laneByBranch = new Map(lanes.map((lane) => [lane.branch, lane]));
  const nodes = ordered.map((commit, column): HistoryLaneNode => {
    const lane = laneByBranch.get(branchOf.get(commit.hash)!)!;
    return {
      commit,
      hash: commit.hash,
      branch: lane.branch,
      lane: lane.index,
      column,
      color: lane.color,
      x: padding + laneLabelWidth + column * columnWidth,
      y: lane.y + (laneHeight - nodeHeight) / 2,
      root: !commit.parents.some((parent) => branchOf.has(parent)),
    };
  });
  const nodeByHash = new Map(nodes.map((node) => [node.hash, node]));
  const edges = nodes.flatMap((child) =>
    [...new Set(child.commit.parents)].flatMap((parentHash, parentIndex) => {
      const parent = nodeByHash.get(parentHash);
      if (!parent) return [];
      const crossLane = parent.lane !== child.lane || parentIndex > 0;
      return [
        {
          key: `${parentHash}->${child.hash}`,
          parentHash,
          childHash: child.hash,
          crossLane,
          color: crossLane ? child.color : parent.color,
          d: edgePath(parent, child),
        },
      ];
    })
  );
  return {
    lanes,
    nodes,
    edges,
    width: padding * 2 + laneLabelWidth + Math.max(0, nodes.length - 1) * columnWidth + nodeWidth,
    height: padding * 2 + Math.max(1, lanes.length) * laneHeight,
  };
}
