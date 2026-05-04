import type { Source, SourcedYOp } from '@t3x-dev/core';

type SurfaceCounts = {
  script: number;
  tree: number;
  inline: number;
  unknown: number;
};

type SurfaceGroup = {
  ops: SourcedYOp[];
  count: number;
};

type PendingReason = 'staged-draft' | 'dirty-script';

export interface MaterializedOpGroups {
  ai: { title: 'AI proposal'; ops: SourcedYOp[]; count: number };
  user: {
    title: 'User edits';
    ops: SourcedYOp[];
    count: number;
    surfaces: SurfaceCounts;
    bySurface: {
      script: SurfaceGroup;
      tree: SurfaceGroup;
      inline: SurfaceGroup;
      unknown: SurfaceGroup;
    };
  };
  pending: {
    title: 'Pending';
    count: number;
    draftOps: SourcedYOp[];
    scriptDirty: boolean;
    reasons: PendingReason[];
  };
}

function surfaceKeyFor(source: Source): keyof SurfaceCounts | null {
  if (source.type !== 'human') return null;
  switch ((source as { surface?: unknown }).surface) {
    case 'script':
      return 'script';
    case 'tree':
      return 'tree';
    case 'inline':
      return 'inline';
    default:
      return 'unknown';
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
  const bySurface: MaterializedOpGroups['user']['bySurface'] = {
    script: { ops: [], count: 0 },
    tree: { ops: [], count: 0 },
    inline: { ops: [], count: 0 },
    unknown: { ops: [], count: 0 },
  };

  for (const op of input.ops) {
    if (op.source.type === 'llm') {
      aiOps.push(op);
    } else if (op.source.type === 'human') {
      userOps.push(op);
      const surface = surfaceKeyFor(op.source) ?? 'unknown';
      surfaces[surface] += 1;
      bySurface[surface].ops.push(op);
      bySurface[surface].count += 1;
    }
  }

  const reasons: PendingReason[] = [];
  if (input.pendingDraftOps.length > 0) reasons.push('staged-draft');
  if (input.scriptDirty) reasons.push('dirty-script');

  return {
    ai: { title: 'AI proposal', ops: aiOps, count: aiOps.length },
    user: { title: 'User edits', ops: userOps, count: userOps.length, surfaces, bySurface },
    pending: {
      title: 'Pending',
      count: input.pendingDraftOps.length + (input.scriptDirty ? 1 : 0),
      draftOps: [...input.pendingDraftOps],
      scriptDirty: input.scriptDirty,
      reasons,
    },
  };
}
