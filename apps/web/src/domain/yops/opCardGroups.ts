import type { Source, SourcedYOp } from '@t3x-dev/core';

type SurfaceCounts = {
  script: number;
  tree: number;
  inline: number;
  unknown: number;
};

type PendingReason = 'staged-draft' | 'dirty-script';

export interface MaterializedOpGroups {
  ai: { title: 'AI proposal'; ops: SourcedYOp[]; count: number };
  user: {
    title: 'User edits';
    ops: SourcedYOp[];
    count: number;
    surfaces: SurfaceCounts;
  };
  pending: {
    title: 'Pending';
    count: number;
    draftOps: SourcedYOp[];
    scriptDirty: boolean;
    reasons: PendingReason[];
  };
}

function countHumanSurface(source: Source, surfaces: SurfaceCounts): void {
  if (source.type !== 'human') return;

  switch ((source as { surface?: unknown }).surface) {
    case 'script':
      surfaces.script += 1;
      break;
    case 'tree':
      surfaces.tree += 1;
      break;
    case 'inline':
      surfaces.inline += 1;
      break;
    default:
      surfaces.unknown += 1;
      break;
  }
}

export function buildMaterializedOpGroups(input: {
  ops: readonly SourcedYOp[];
  pendingDraftOps: readonly SourcedYOp[];
  scriptDirty: boolean;
}): MaterializedOpGroups {
  const aiOps: SourcedYOp[] = [];
  const userOps: SourcedYOp[] = [];
  const surfaces: SurfaceCounts = { script: 0, tree: 0, inline: 0, unknown: 0 };

  for (const op of input.ops) {
    if (op.source.type === 'llm') {
      aiOps.push(op);
    } else if (op.source.type === 'human') {
      userOps.push(op);
      countHumanSurface(op.source, surfaces);
    }
  }

  const reasons: PendingReason[] = [];
  if (input.pendingDraftOps.length > 0) reasons.push('staged-draft');
  if (input.scriptDirty) reasons.push('dirty-script');

  return {
    ai: { title: 'AI proposal', ops: aiOps, count: aiOps.length },
    user: { title: 'User edits', ops: userOps, count: userOps.length, surfaces },
    pending: {
      title: 'Pending',
      count: input.pendingDraftOps.length + (input.scriptDirty ? 1 : 0),
      draftOps: [...input.pendingDraftOps],
      scriptDirty: input.scriptDirty,
      reasons,
    },
  };
}
