import {
  compileNativeYOpsToPrimitives as compileYOpsOperationsToPrimitiveProfile,
  type NativeYOp as YOp,
} from '@t3x-dev/core';
import { applyDraftYOps, canonicalJson } from './document';
import { currentComposition } from './replay';
import type { DraftActionLedger } from './types';

/** Lower at each operation's actual input, retaining an exact source-to-Effect map. */
export function compileDraftComposition(ledger: DraftActionLedger) {
  let current = ledger.base;
  const operations: YOp[] = [];
  const bindings: Array<{
    actionId: string;
    sourceOperationIndex: number;
    effectOperationIndexes: number[];
  }> = [];
  for (const action of ledger.actions) {
    for (const [sourceOperationIndex, operation] of action.operations.entries()) {
      const source = applyDraftYOps(current, [operation]);
      if (!source.ok) throw new TypeError(source.message);
      const lowered = compileYOpsOperationsToPrimitiveProfile({
        base: current,
        operations: [operation],
      });
      const replay = applyDraftYOps(current, lowered.operations);
      if (!replay.ok || canonicalJson(source.doc) !== canonicalJson(replay.doc))
        throw new TypeError('Primitive lowering changed the authoring result');
      const offset = operations.length;
      operations.push(...lowered.operations);
      bindings.push({
        actionId: action.actionId,
        sourceOperationIndex,
        effectOperationIndexes: lowered.operations.map((_, i) => offset + i),
      });
      current = source.doc;
    }
  }
  if (canonicalJson(current) !== canonicalJson(currentComposition(ledger)))
    throw new TypeError('Compiled Draft differs from replay');
  return { operations, bindings, result: current };
}
