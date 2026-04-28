export interface YOpsRowMeta {
  id: string;
  source: string;
  turnHash: string | null;
  createdAt: string;
  supersededAt: string | null;
  isCommitted: boolean;
  committedBy: string[];
  opCount: number;
}

export interface YOpsOpOrigin {
  rowId: string | null;
  opIndexInRow: number | null;
}

export function unknownOpOrigins(count: number): YOpsOpOrigin[] {
  return Array.from({ length: count }, () => ({ rowId: null, opIndexInRow: null }));
}

export function reconcileOpOrigins(
  previous: YOpsOpOrigin[],
  previousOps: readonly unknown[],
  nextOps: readonly unknown[]
): YOpsOpOrigin[] {
  if (nextOps.length === 0) return [];
  if (previous.length !== previousOps.length) return unknownOpOrigins(nextOps.length);

  let sharedPrefix = 0;
  const maxPrefix = Math.min(previousOps.length, nextOps.length);
  while (sharedPrefix < maxPrefix && Object.is(previousOps[sharedPrefix], nextOps[sharedPrefix])) {
    sharedPrefix++;
  }

  const preserved = previous.slice(0, sharedPrefix);
  return [...preserved, ...unknownOpOrigins(nextOps.length - preserved.length)];
}
