import type { HumanSource, Source, SourcedYOp, YOp } from '@t3x-dev/core';
import { buildOpIdentity, type OpIdentity, opIdentityKey, opPathKey } from './opIdentity';

export type ReconciliationKind = 'unchanged' | 'changed' | 'inserted' | 'ambiguous';

export type ReconciledOpInfo = {
  kind: ReconciliationKind;
  path: string | null;
  nextIndex: number;
  previousIndex: number | null;
  reordered: boolean;
};

export type DeletedOpInfo = {
  path: string | null;
  previousIndex: number;
  source: Source;
};

export type ReconciliationSummary = {
  unchanged: number;
  changed: number;
  inserted: number;
  deleted: number;
  ambiguous: number;
  reordered: number;
  changedPaths: string[];
  deletedPaths: string[];
};

export type ReconciliationResult = {
  ops: SourcedYOp[];
  info: ReconciledOpInfo[];
  deleted: DeletedOpInfo[];
  summary: ReconciliationSummary;
};

type PreviousEntry = {
  op: SourcedYOp;
  identity: OpIdentity;
  identityKey: string;
  pathKey: string;
  index: number;
};

type NextEntry = {
  op: YOp;
  identity: OpIdentity;
  identityKey: string;
  pathKey: string;
  index: number;
};

export function reconcileScriptSources(
  previousOps: SourcedYOp[],
  nextOps: YOp[],
  humanSource: HumanSource
): ReconciliationResult {
  const previousEntries = previousOps.map((op, index): PreviousEntry => {
    const identity = buildOpIdentity(op);
    return {
      op,
      identity,
      identityKey: opIdentityKey(identity),
      pathKey: opPathKey(identity),
      index,
    };
  });

  const nextEntries = nextOps.map((op, index): NextEntry => {
    const identity = buildOpIdentity(op);
    return {
      op,
      identity,
      identityKey: opIdentityKey(identity),
      pathKey: opPathKey(identity),
      index,
    };
  });

  const previousByIdentity = groupBy(previousEntries, (entry) => entry.identityKey);
  const nextByIdentity = groupBy(nextEntries, (entry) => entry.identityKey);
  const previousByPath = groupBy(previousEntries, (entry) => entry.pathKey);
  const nextByPath = groupBy(nextEntries, (entry) => entry.pathKey);
  const usedPreviousIndexes = new Set<number>();
  const usedNextIndexes = new Set<number>();
  const changedPaths = new Set<string>();
  const resultOps: Array<SourcedYOp | undefined> = new Array(nextEntries.length);
  const info: Array<ReconciledOpInfo | undefined> = new Array(nextEntries.length);
  const summary: ReconciliationSummary = {
    unchanged: 0,
    changed: 0,
    inserted: 0,
    deleted: 0,
    ambiguous: 0,
    reordered: 0,
    changedPaths: [],
    deletedPaths: [],
  };

  for (const [identityKey, exactPreviousMatches] of previousByIdentity) {
    const exactNextMatches = nextByIdentity.get(identityKey) ?? [];
    if (exactPreviousMatches.length !== 1 || exactNextMatches.length !== 1) continue;

    const previousEntry = exactPreviousMatches[0];
    const nextEntry = exactNextMatches[0];
    const reordered = previousEntry.index !== nextEntry.index;
    usedPreviousIndexes.add(previousEntry.index);
    usedNextIndexes.add(nextEntry.index);
    setReconciled({
      op: nextEntry.op,
      source: previousEntry.op.source,
      kind: 'unchanged',
      nextEntry,
      previousIndex: previousEntry.index,
      reordered,
      resultOps,
      info,
    });
    summary.unchanged += 1;
    if (reordered) summary.reordered += 1;
  }

  const pathKeys = new Set([...previousByPath.keys(), ...nextByPath.keys()]);
  for (const pathKey of pathKeys) {
    const pathPreviousMatches = (previousByPath.get(pathKey) ?? []).filter(
      (entry) => !usedPreviousIndexes.has(entry.index)
    );
    const pathNextMatches = (nextByPath.get(pathKey) ?? []).filter(
      (entry) => !usedNextIndexes.has(entry.index)
    );

    if (pathNextMatches.length === 0) continue;

    if (pathPreviousMatches.length === 0) {
      for (const nextEntry of pathNextMatches) {
        usedNextIndexes.add(nextEntry.index);
        setReconciled({
          op: nextEntry.op,
          source: humanSource,
          kind: 'inserted',
          nextEntry,
          previousIndex: null,
          reordered: false,
          resultOps,
          info,
        });
        summary.inserted += 1;
      }
      continue;
    }

    if (pathPreviousMatches.length === 1 && pathNextMatches.length === 1) {
      const previousEntry = pathPreviousMatches[0];
      const nextEntry = pathNextMatches[0];
      const reordered = previousEntry.index !== nextEntry.index;
      usedPreviousIndexes.add(previousEntry.index);
      usedNextIndexes.add(nextEntry.index);
      setReconciled({
        op: nextEntry.op,
        source: humanSource,
        kind: 'changed',
        nextEntry,
        previousIndex: previousEntry.index,
        reordered,
        resultOps,
        info,
      });
      summary.changed += 1;
      if (reordered) summary.reordered += 1;
      addPath(changedPaths, nextEntry.identity.primaryPath);
      continue;
    }

    pathNextMatches.forEach((nextEntry, matchIndex) => {
      const previousEntry = pathPreviousMatches[matchIndex] ?? null;
      if (previousEntry) {
        usedPreviousIndexes.add(previousEntry.index);
      }
      usedNextIndexes.add(nextEntry.index);
      setReconciled({
        op: nextEntry.op,
        source: humanSource,
        kind: 'ambiguous',
        nextEntry,
        previousIndex: previousEntry?.index ?? null,
        reordered: false,
        resultOps,
        info,
      });
      summary.ambiguous += 1;
    });
  }

  const deletedPaths = new Set<string>();
  const deleted = previousEntries
    .filter((entry) => !usedPreviousIndexes.has(entry.index))
    .map((entry): DeletedOpInfo => {
      addPath(deletedPaths, entry.identity.primaryPath);
      return {
        path: entry.identity.primaryPath,
        previousIndex: entry.index,
        source: entry.op.source,
      };
    });

  summary.deleted = deleted.length;
  summary.changedPaths = Array.from(changedPaths);
  summary.deletedPaths = Array.from(deletedPaths);

  return {
    ops: resultOps.map(requireReconciledOp),
    info: info.map(requireReconciledInfo),
    deleted,
    summary,
  };
}

function setReconciled(args: {
  op: YOp;
  source: Source;
  kind: ReconciliationKind;
  nextEntry: NextEntry;
  previousIndex: number | null;
  reordered: boolean;
  resultOps: Array<SourcedYOp | undefined>;
  info: Array<ReconciledOpInfo | undefined>;
}): void {
  args.resultOps[args.nextEntry.index] = { ...args.op, source: args.source } as SourcedYOp;
  args.info[args.nextEntry.index] = {
    kind: args.kind,
    path: args.nextEntry.identity.primaryPath,
    nextIndex: args.nextEntry.index,
    previousIndex: args.previousIndex,
    reordered: args.reordered,
  };
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

function addPath(paths: Set<string>, path: string | null): void {
  if (path !== null) {
    paths.add(path);
  }
}

function requireReconciledOp(op: SourcedYOp | undefined): SourcedYOp {
  if (!op) {
    throw new Error('source reconciliation left a next op unreconciled');
  }
  return op;
}

function requireReconciledInfo(info: ReconciledOpInfo | undefined): ReconciledOpInfo {
  if (!info) {
    throw new Error('source reconciliation left op info unreconciled');
  }
  return info;
}
