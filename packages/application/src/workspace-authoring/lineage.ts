import type { YOp, YValue } from '@t3x-dev/yops';
import { mappingGet, mappingKeys, nodeIdForPath, yValuesEqual } from './replay';
import type { DraftActionLedger, DraftNodeCard, DraftNodeLineage } from './types';

function opPath(op: YOp): string | undefined {
  if ('set' in op) return op.set.path;
  if ('unset' in op) return op.unset.path;
  if ('drop' in op) return op.drop.path;
  if ('define' in op) return op.define.path;
  if ('rename' in op) return op.rename.path;
  if ('move' in op) return op.move.from;
  return undefined;
}

function nodeIdAtPath(ledger: DraftActionLedger, path: string, preferCurrent: boolean): string {
  if (preferCurrent) {
    const current = ledger.lineage.find(
      (entry) => entry.path === path && entry.toRevision === null
    );
    if (current) return current.nodeId;
  }
  return (
    [...ledger.lineage].reverse().find((entry) => entry.path === path)?.nodeId ??
    nodeIdForPath(path)
  );
}

export function affectedNodeCards(
  before: YValue,
  after: YValue,
  ledger: DraftActionLedger
): DraftNodeCard[] {
  const order = [...mappingKeys(after)];
  for (const key of mappingKeys(before)) {
    if (!order.includes(key)) order.push(key);
  }
  const byNode = new Map<string, DraftNodeCard>();
  const seen: string[] = [];
  for (const path of order) {
    const beforeValue = mappingGet(before, path);
    const afterValue = mappingGet(after, path);
    if (yValuesEqual(beforeValue, afterValue)) continue;
    const nodeId = nodeIdAtPath(ledger, path, afterValue !== undefined);
    const existing = byNode.get(nodeId);
    if (existing) {
      byNode.set(nodeId, {
        nodeId,
        path: afterValue !== undefined ? path : existing.path,
        before: existing.before !== undefined ? existing.before : beforeValue,
        after: afterValue !== undefined ? afterValue : existing.after,
      });
      continue;
    }
    seen.push(nodeId);
    byNode.set(nodeId, {
      nodeId,
      path,
      before: beforeValue,
      after: afterValue,
    });
  }
  return seen
    .map((nodeId) => byNode.get(nodeId))
    .filter((card): card is DraftNodeCard => Boolean(card));
}

export function nextLineage(
  ledger: DraftActionLedger,
  operations: readonly YOp[],
  before: YValue,
  after: YValue,
  afterRevision: number
): DraftNodeLineage[] {
  const lineage = ledger.lineage.map((entry) => ({ ...entry }));
  const closeCurrent = (path: string) => {
    const current = lineage.find((entry) => entry.path === path && entry.toRevision === null);
    if (current) current.toRevision = afterRevision;
  };
  const open = (path: string, nodeId: string) => {
    lineage.push({
      nodeId,
      path,
      fromRevision: afterRevision,
      toRevision: null,
    });
  };

  for (const op of operations) {
    if ('rename' in op) {
      const from = op.rename.path;
      const to = op.rename.to;
      const current = lineage.find((entry) => entry.path === from && entry.toRevision === null);
      closeCurrent(from);
      open(to, current?.nodeId ?? nodeIdForPath(to));
      continue;
    }
    if ('move' in op) {
      const from = op.move.from;
      const to = op.move.to;
      const current = lineage.find((entry) => entry.path === from && entry.toRevision === null);
      closeCurrent(from);
      open(to, current?.nodeId ?? nodeIdForPath(to));
    }
  }

  for (const path of mappingKeys(after)) {
    const hasCurrent = lineage.some((entry) => entry.path === path && entry.toRevision === null);
    if (!hasCurrent) open(path, nodeIdForPath(path));
  }
  for (const path of mappingKeys(before)) {
    if (mappingGet(after, path) === undefined) closeCurrent(path);
  }

  return lineage;
}

export function operationPaths(operations: readonly YOp[]): readonly string[] {
  return operations.map(opPath).filter((path): path is string => typeof path === 'string');
}
