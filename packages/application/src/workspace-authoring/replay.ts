import { applyYOps, canonicalJson, type YOp, type YValue } from '@t3x-dev/yops';
import {
  DRAFT_ACTION_LEDGER_SCHEMA,
  type DraftActionLedger,
  type DraftActionRecord,
  type DraftNodeLineage,
} from './types';

export function cloneYValue<T extends YValue>(value: T): T {
  return structuredClone(value);
}

export function yValuesEqual(left: YValue | undefined, right: YValue | undefined): boolean {
  if (left === undefined && right === undefined) return true;
  if (left === undefined || right === undefined) return false;
  return canonicalJson(left) === canonicalJson(right);
}

export function isMapping(value: YValue | undefined): value is { [key: string]: YValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function mappingKeys(value: YValue | undefined): readonly string[] {
  return isMapping(value) ? Object.keys(value) : [];
}

export function mappingGet(value: YValue | undefined, path: string): YValue | undefined {
  if (!isMapping(value) || !Object.hasOwn(value, path)) return undefined;
  return value[path];
}

export function operationsDigest(operations: readonly YOp[]): string {
  return canonicalJson(operations as unknown as YValue);
}

export function createDraftActionLedger(base: YValue): DraftActionLedger {
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

export function replayToRevision(ledger: DraftActionLedger, revision: number): YValue {
  if (revision < 0 || revision > ledger.compositionRevision) {
    throw new RangeError(`Revision ${revision} is outside 0..${ledger.compositionRevision}`);
  }
  let doc = cloneYValue(ledger.base);
  for (const action of ledger.actions) {
    if (action.afterRevision > revision) break;
    const applied = applyYOps(doc, [...action.operations]);
    if (!applied.ok) {
      throw new Error(
        `Replay failed at action ${action.actionId}: ${applied.error?.message ?? 'unknown error'}`
      );
    }
    doc = applied.doc;
  }
  return doc;
}

export function currentComposition(ledger: DraftActionLedger): YValue {
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
