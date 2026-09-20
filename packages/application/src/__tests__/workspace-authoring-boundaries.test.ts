import { describe, expect, it } from 'vitest';
import type { DraftActionLedger, PublishDraftActionInput } from '../workspace-authoring';
import {
  createDraftActionLedger,
  currentComposition,
  nodeHistory,
  publishDraftAction,
  restoreNodeToAction,
  selectedActionView,
} from '../workspace-authoring';

const actor = { kind: 'human' as const, id: 'maya' };
function input(
  ledger: DraftActionLedger,
  operations: PublishDraftActionInput['operations'],
  actionId = `a${ledger.compositionRevision + 1}`
): PublishDraftActionInput {
  return {
    actor,
    channel: 'manual',
    actionId,
    operations,
    expectedRevision: ledger.compositionRevision,
    publishedAt: '2026-09-20T00:00:00Z',
  };
}
function save(ledger: DraftActionLedger, operations: PublishDraftActionInput['operations']) {
  const result = publishDraftAction(ledger, input(ledger, operations));
  expect(result.kind).toBe('published');
  return result.ledger;
}
describe('Draft authoring identity and retry boundaries', () => {
  it('does not alias a same-path replacement to deleted history', () => {
    let ledger = createDraftActionLedger({ x: 1 });
    ledger = save(ledger, [{ set: { path: 'x', value: 2 } }]);
    const original = selectedActionView(ledger)!;
    ledger = save(ledger, [{ unset: { path: 'x' } }]);
    ledger = save(ledger, [{ set: { path: 'x', value: 3 } }]);
    expect(selectedActionView(ledger, 'a1')).toEqual(original);
    expect(selectedActionView(ledger)!.cards[0].nodeId).not.toBe(original.cards[0].nodeId);
    expect(nodeHistory(ledger, original.cards[0].nodeId).current).toBeUndefined();
    expect(nodeHistory(ledger, original.cards[0].nodeId).entries.map((e) => e.actionId)).toEqual([
      'a2',
      'a1',
    ]);
  });
  it('binds idempotency to actor and revision, not just operations', () => {
    const base = createDraftActionLedger({ x: 1 });
    const request = input(base, [{ set: { path: 'x', value: 2 } }]);
    const first = publishDraftAction(base, request);
    expect(publishDraftAction(first.ledger, request).kind).toBe('reused');
    for (const patch of [
      { actor: { kind: 'human' as const, id: 'other' } },
      { expectedRevision: 1 },
      { reason: 'different' },
    ])
      expect(publishDraftAction(first.ledger, { ...request, ...patch })).toMatchObject({
        kind: 'conflict',
        reason: 'idempotency_mismatch',
      });
  });
  it('retains a no-change receipt so a retry cannot later mutate the draft', () => {
    const base = createDraftActionLedger({ x: 1 });
    const request = input(base, [{ set: { path: 'x', value: 1 } }], 'noop');
    const noop = publishDraftAction(base, request);
    expect(noop.kind).toBe('no_change');
    const changed = save(noop.ledger, [{ set: { path: 'x', value: 2 } }]);
    expect(publishDraftAction(changed, request).kind).toBe('no_change');
    expect(currentComposition(changed)).toEqual({ x: 2 });
  });
  it('detaches stored operations and actor from caller-owned mutable objects', () => {
    const base = createDraftActionLedger({ x: { n: 1 } });
    const value = { n: 2 };
    const mutableActor = { ...actor };
    const request = { ...input(base, [{ set: { path: 'x', value } }]), actor: mutableActor };
    const first = publishDraftAction(base, request);
    value.n = 99;
    mutableActor.id = 'forged';
    expect(currentComposition(first.ledger)).toEqual({ x: { n: 2 } });
    expect(first.ledger.actions[0].actor.id).toBe('maya');
  });
  it('projects nested leaf changes and restores to the current renamed path', () => {
    let ledger = createDraftActionLedger({ config: { x: 1, y: 2 } });
    ledger = save(ledger, [{ set: { path: 'config/x', value: 3 } }]);
    const card = selectedActionView(ledger)!.cards[0];
    expect(card.path).toBe('config/x');
    ledger = save(ledger, [{ rename: { path: 'config/x', to: 'z' } }]);
    expect(selectedActionView(ledger, 'a1')!.cards[0]).toEqual(card);
    expect(restoreNodeToAction(ledger, card.nodeId, 'a1').path).toBe('config/z');
  });
  it('does not treat a real document key as an internal wrapper', () => {
    const ledger = save(createDraftActionLedger({ document: { x: 1 } }), [
      { set: { path: 'document/x', value: 2 } },
    ]);
    expect(currentComposition(ledger)).toEqual({ document: { x: 2 } });
  });
});

// These cases cross the persistence/reconstruction boundary rather than inspecting private helpers.
import {
  compileDraftComposition,
  parseDraftActionLedger,
  previewCompensate,
} from '../workspace-authoring';

it('reconstructs JSON object ordering and rejects a tampered immutable action', () => {
  const ledger = save(createDraftActionLedger({ z: 1, a: { z: 2, a: 3 } }), [
    { set: { path: 'z', value: 4 } },
  ]);
  expect(parseDraftActionLedger(JSON.parse(JSON.stringify(ledger)))).toEqual(ledger);
  const tampered = structuredClone(ledger);
  (tampered.actions[0] as { reason: string }).reason = 'tampered';
  expect(() => parseDraftActionLedger(tampered)).toThrow('Invalid Draft action');
});
it('retains identity replacement even when the final bytes match', () => {
  const ledger = save(createDraftActionLedger({ x: 1 }), [
    { unset: { path: 'x' } },
    { set: { path: 'x', value: 1 } },
  ]);
  expect(ledger.actions).toHaveLength(1);
  expect(selectedActionView(ledger)?.cards[0].nodeId).not.toBe('node:x');
});
it('does not compensate onto a recreated node with coincidentally equal bytes', () => {
  let ledger = save(createDraftActionLedger({ x: 1 }), [{ set: { path: 'x', value: 2 } }]);
  ledger = save(ledger, [{ unset: { path: 'x' } }]);
  ledger = save(ledger, [{ set: { path: 'x', value: 2 } }]);
  expect(previewCompensate(ledger, 'a1').conflicts).toHaveLength(1);
});
it('lowers recipes at sequential inputs with exact source operation ownership', () => {
  const ledger = save(createDraftActionLedger({ items: [1, 2] }), [
    { append: { path: 'items', value: 3 } },
    { set: { path: 'x', value: 4 } },
  ]);
  const compiled = compileDraftComposition(ledger);
  expect(compiled.result).toEqual(currentComposition(ledger));
  expect(compiled.bindings.flatMap((b) => b.effectOperationIndexes)).toEqual(
    compiled.operations.map((_, i) => i)
  );
  expect(compiled.bindings.map((b) => b.sourceOperationIndex)).toEqual([0, 1]);
});
