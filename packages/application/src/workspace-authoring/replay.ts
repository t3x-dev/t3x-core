import type { YOp } from '@t3x-dev/core';
import {
  applyDraftYOps,
  canonicalJson,
  cloneDocument,
  isMapping as isDocumentMapping,
} from './document';
import {
  DRAFT_ACTION_LEDGER_SCHEMA,
  type DraftActionLedger,
  type DraftActionRecord,
  type DraftDocument,
  type DraftNodeLineage,
} from './types';

export function cloneYValue<T extends DraftDocument>(value: T): T {
  return cloneDocument(value);
}

export function yValuesEqual(
  left: DraftDocument | undefined,
  right: DraftDocument | undefined
): boolean {
  if (left === undefined && right === undefined) return true;
  if (left === undefined || right === undefined) return false;
  return canonicalJson(left) === canonicalJson(right);
}

export function isMapping(
  value: DraftDocument | undefined
): value is { [key: string]: DraftDocument } {
  return isDocumentMapping(value);
}

export function mappingKeys(value: DraftDocument | undefined): readonly string[] {
  return isMapping(value) ? Object.keys(value) : [];
}

export function mappingGet(
  value: DraftDocument | undefined,
  path: string
): DraftDocument | undefined {
  if (!isMapping(value) || !Object.hasOwn(value, path)) return undefined;
  return value[path];
}

export function operationsDigest(operations: readonly YOp[]): string {
  return canonicalJson(operations);
}

export function createDraftActionLedger(base: DraftDocument): DraftActionLedger {
  const cloned = cloneYValue(base);
  return {
    schema: DRAFT_ACTION_LEDGER_SCHEMA,
    version: 1,
    base: cloned,
    compositionRevision: 0,
    actions: [],
    lineage: mappingKeys(cloned).map((path) => ({
      nodeId: nodeIdForPath(path),
      path,
      fromRevision: 0,
      toRevision: null,
    })),
  };
}

export function nodeIdForPath(path: string): string {
  return `node:${path}`;
}

export function replayToRevision(ledger: DraftActionLedger, revision: number): DraftDocument {
  if (revision < 0 || revision > ledger.compositionRevision) {
    throw new RangeError(`Revision ${revision} is outside 0..${ledger.compositionRevision}`);
  }
  let doc = cloneYValue(ledger.base);
  for (const action of ledger.actions) {
    if (action.afterRevision > revision) break;
    const applied = applyDraftYOps(doc, action.operations);
    if (!applied.ok) {
      throw new Error(`Replay failed at action ${action.actionId}: ${applied.message}`);
    }
    doc = applied.doc;
  }
  return doc;
}

export function currentComposition(ledger: DraftActionLedger): DraftDocument {
  return replayToRevision(ledger, ledger.compositionRevision);
}

export function actionById(
  ledger: DraftActionLedger,
  actionId: string
): DraftActionRecord | undefined {
  return ledger.actions.find((action) => action.actionId === actionId);
}

export function currentLineage(ledger: DraftActionLedger): readonly DraftNodeLineage[] {
  return ledger.lineage.filter((entry) => entry.toRevision === null);
}

export function lineageForPath(
  ledger: DraftActionLedger,
  path: string
): DraftNodeLineage | undefined {
  return currentLineage(ledger).find((entry) => entry.path === path);
}

export function lineageForNode(
  ledger: DraftActionLedger,
  nodeId: string
): DraftNodeLineage | undefined {
  return [...ledger.lineage].reverse().find((entry) => entry.nodeId === nodeId);
}
