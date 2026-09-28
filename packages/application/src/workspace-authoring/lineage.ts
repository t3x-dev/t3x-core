import type { NativeYOp as YOp } from '@t3x-dev/core';
import { parseNativeYOpsPath as parsePath } from '@t3x-dev/core';
import { applyDraftYOps, isMapping } from './document';
import { documentPaths, lineageAt, mappingGet, nodeIdForPath, yValuesEqual } from './replay';
import type { DraftActionLedger, DraftDocument, DraftNodeCard, DraftNodeLineage } from './types';

function renameTarget(path: string, key: string): string {
  const segments = parsePath(path);
  const encoded = segments
    .slice(0, -1)
    .map((s) =>
      s.type === 'key'
        ? JSON.stringify(s.value)
        : s.type === 'index'
          ? `[${s.value}]`
          : `[${s.key}=${s.value}]`
    );
  return [...encoded, JSON.stringify(key)].join('/');
}
function samePath(a: string, b: string) {
  return JSON.stringify(parsePath(a)) === JSON.stringify(parsePath(b));
}
function pathExists(paths: string[], target: string) {
  return paths.find((path) => samePath(path, target));
}

export function affectedNodeCards(
  before: DraftDocument,
  after: DraftDocument,
  ledger: DraftActionLedger,
  beforeRevision = 0,
  afterRevision = ledger.compositionRevision,
  operations: readonly YOp[] = []
): DraftNodeCard[] {
  const paths = [...new Set([...documentPaths(after), ...documentPaths(before)])];
  const touched = operationPaths(operations);
  const changed = paths.filter(
    (path) =>
      !yValuesEqual(mappingGet(before, path), mappingGet(after, path)) ||
      lineageAt(ledger, path, beforeRevision)?.nodeId !==
        lineageAt(ledger, path, afterRevision)?.nodeId
  );
  const owners = changed
    .filter((path) => {
      const b = mappingGet(before, path),
        a = mappingGet(after, path);
      // Nested mappings are represented by changed children unless structurally replaced.
      return !(isMapping(a) && isMapping(b) && !touched.some((t) => samePath(t, path)));
    })
    .filter(
      (path) =>
        !changed.some(
          (parent) =>
            parent !== path &&
            path.startsWith(`${parent}/`) &&
            (mappingGet(before, parent) === undefined ||
              mappingGet(after, parent) === undefined ||
              touched.some((t) => samePath(t, parent)))
        )
    );
  const cards = new Map<string, DraftNodeCard>();
  for (const path of owners) {
    const b = mappingGet(before, path),
      a = mappingGet(after, path);
    const identity = lineageAt(ledger, path, a === undefined ? beforeRevision : afterRevision);
    const nodeId = identity?.nodeId ?? nodeIdForPath(path);
    const existing = cards.get(nodeId);
    cards.set(nodeId, {
      nodeId,
      path: a === undefined && existing ? existing.path : path,
      before: existing?.before !== undefined ? existing.before : b,
      after: a !== undefined ? a : existing?.after,
      beforePath: b !== undefined ? path : existing?.beforePath,
      afterPath: a !== undefined ? path : existing?.afterPath,
    });
  }
  return [...cards.values()];
}

export function nextLineage(
  ledger: DraftActionLedger,
  operations: readonly YOp[],
  before: DraftDocument,
  _after: DraftDocument,
  afterRevision: number
): DraftNodeLineage[] {
  const lineage = ledger.lineage.map((entry) => ({ ...entry }));
  let doc = before;
  for (const [index, op] of operations.entries()) {
    const applied = applyDraftYOps(doc, [op]);
    if (!applied.ok) throw new Error(applied.message);
    const beforePaths = documentPaths(doc),
      afterPaths = documentPaths(applied.doc);
    const relocation =
      'rename' in op
        ? { from: op.rename.path, to: renameTarget(op.rename.path, op.rename.to) }
        : 'move' in op
          ? op.move
          : null;
    const from = relocation ? pathExists(beforePaths, relocation.from) : undefined;
    const to = relocation ? pathExists(afterPaths, relocation.to) : undefined;
    if (from !== undefined && to !== undefined) {
      for (const entry of lineage.filter(
        (e) => e.toRevision === null && (e.path === from || e.path.startsWith(`${from}/`))
      )) {
        const target = to + entry.path.slice(from.length);
        for (const occupied of lineage.filter(
          (e) => e.toRevision === null && e.path === target && e !== entry
        ))
          occupied.toRevision = afterRevision;
        entry.toRevision = afterRevision;
        lineage.push({
          nodeId: entry.nodeId,
          path: target,
          fromRevision: afterRevision,
          toRevision: null,
        });
      }
    }
    for (const entry of lineage) {
      if (entry.toRevision === null && !afterPaths.includes(entry.path))
        entry.toRevision = afterRevision;
    }
    for (const path of afterPaths) {
      if (!lineage.some((e) => e.path === path && e.toRevision === null)) {
        lineage.push({
          nodeId: `${nodeIdForPath(path)}@${afterRevision}:${index}`,
          path,
          fromRevision: afterRevision,
          toRevision: null,
        });
      }
    }
    doc = applied.doc;
  }
  return lineage;
}

export function operationPaths(operations: readonly YOp[]): readonly string[] {
  return operations.flatMap((op) => {
    const fields = Object.values(op)[0] as { path?: string; from?: string; to?: string };
    if ('move' in op) return [op.move.from, op.move.to];
    return typeof fields.path === 'string' ? [fields.path] : [];
  });
}
