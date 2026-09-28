import type { YOp } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import type {
  DraftActionLedger,
  DraftDocument,
  PublishDraftActionInput,
} from '../workspace-authoring';
import {
  createDraftActionLedger,
  currentComposition,
  importLegacyDocument,
  legacyWorkspaceDraftSavePaths,
  listDraftActions,
  netDiffCards,
  nodeHistory,
  nodeIdForPath,
  previewCompensate,
  publishDraftAction,
  replayToRevision,
  restoreNodeToAction,
  selectedActionView,
  WORKSPACE_DRAFT_SAVE_PATHS,
} from '../workspace-authoring';

const BASE: DraftDocument = {
  allocation: 10,
  approval: false,
  channel: '#ops',
  replicas: 2,
  timeout: 30,
  regions: 'AU',
};

const HUMAN = { kind: 'human' as const, id: 'user:etht3x' };
const MCP = { kind: 'service' as const, id: 'service:t3x-mcp' };
const ASSISTANT = { kind: 'agent' as const, id: 'agent:workspace-assistant' };

function publish(
  ledger: DraftActionLedger,
  input: Omit<PublishDraftActionInput, 'expectedRevision' | 'publishedAt'> & {
    expectedRevision?: number;
    at?: string;
  }
) {
  return publishDraftAction(ledger, {
    expectedRevision: input.expectedRevision ?? ledger.compositionRevision,
    publishedAt: input.at ?? `2026-09-20T00:00:0${ledger.compositionRevision}Z`,
    ...input,
  });
}

function mustPublish(
  ledger: DraftActionLedger,
  input: Parameters<typeof publish>[1]
): DraftActionLedger {
  const result = publish(ledger, input);
  if (result.kind !== 'published') {
    throw new Error(`expected published, got ${result.kind}`);
  }
  return result.ledger;
}

function fixtureThroughA3(): DraftActionLedger {
  let ledger = createDraftActionLedger(BASE);
  ledger = mustPublish(ledger, {
    actionId: 'A1',
    channel: 'assistant',
    actor: ASSISTANT,
    operations: [
      { set: { path: 'allocation', value: 20 } },
      { set: { path: 'regions', value: 'AU,NZ' } },
    ],
  });
  ledger = mustPublish(ledger, {
    actionId: 'A2',
    channel: 'mcp',
    actor: MCP,
    operations: [
      { set: { path: 'allocation', value: 30 } },
      { set: { path: 'channel', value: '#pilot' } },
      { set: { path: 'replicas', value: 4 } },
      { set: { path: 'timeout', value: 45 } },
    ],
  });
  return mustPublish(ledger, {
    actionId: 'A3',
    channel: 'manual',
    actor: HUMAN,
    operations: [
      { set: { path: 'allocation', value: 25 } },
      { set: { path: 'approval', value: true } },
    ],
  });
}

describe('workspace draft save inventory', () => {
  it('lists current blob-merge paths as legacy and names the ledger command', () => {
    expect(legacyWorkspaceDraftSavePaths().map((path) => path.id)).toEqual(
      expect.arrayContaining([
        'patch-workspace',
        'upsert-workspace-draft',
        'workspace-source-transition',
      ])
    );
    expect(WORKSPACE_DRAFT_SAVE_PATHS.some((path) => path.id === 'publish-draft-action')).toBe(
      true
    );
  });
});

describe('Draft action ledger A1–A5 fixture', () => {
  it('keeps selected-action cards frozen while current and net-diff move', () => {
    const throughA3 = fixtureThroughA3();
    const latest = selectedActionView(throughA3);
    expect(latest?.action.actionId).toBe('A3');
    expect(latest?.cards.map((card) => card.path)).toEqual(['allocation', 'approval']);
    expect(latest?.cards[0]).toMatchObject({ before: 30, after: 25 });

    const a2 = selectedActionView(throughA3, 'A2');
    expect(a2?.cards).toHaveLength(4);
    expect(a2?.cards.find((card) => card.path === 'allocation')).toMatchObject({
      before: 20,
      after: 30,
    });
    expect(nodeHistory(throughA3, nodeIdForPath('allocation'), 'A2').current).toBe(25);

    const net = netDiffCards(throughA3);
    expect(net.map((card) => card.path).sort()).toEqual(
      ['allocation', 'approval', 'channel', 'regions', 'replicas', 'timeout'].sort()
    );
    expect(net.find((card) => card.path === 'allocation')).toMatchObject({
      before: 10,
      after: 25,
    });

    const throughA4 = mustPublish(throughA3, {
      actionId: 'A4',
      channel: 'manual',
      actor: HUMAN,
      operations: [{ set: { path: 'allocation', value: 10 } }],
    });
    expect(selectedActionView(throughA4)?.action.actionId).toBe('A4');
    expect(netDiffCards(throughA4).find((card) => card.path === 'allocation')).toBeUndefined();
    expect(
      selectedActionView(throughA4, 'A1')?.cards.find((card) => card.path === 'allocation')
    ).toMatchObject({ before: 10, after: 20 });
    expect(
      nodeHistory(throughA4, nodeIdForPath('allocation')).entries.map((entry) => entry.after)
    ).toEqual([10, 25, 30, 20]);

    const inspectingA2 = selectedActionView(throughA4, 'A2');
    const throughA5 = mustPublish(throughA4, {
      actionId: 'A5',
      channel: 'mcp',
      actor: MCP,
      operations: [{ set: { path: 'timeout', value: 60 } }],
    });
    expect(selectedActionView(throughA5, 'A2')?.cards).toEqual(inspectingA2?.cards);
    expect(currentComposition(throughA5)).toMatchObject({ timeout: 60, allocation: 10 });
  });
});

describe('publishDraftAction guards', () => {
  it('reuses the same action identity and rejects different facts', () => {
    const ops: YOp[] = [{ set: { path: 'allocation', value: 20 } }];
    const first = publish(createDraftActionLedger(BASE), {
      actionId: 'retry-1',
      channel: 'manual',
      actor: HUMAN,
      operations: ops,
    });
    expect(first.kind).toBe('published');
    if (first.kind !== 'published') return;
    const reused = publish(first.ledger, {
      expectedRevision: 0,
      actionId: 'retry-1',
      channel: 'manual',
      actor: HUMAN,
      operations: ops,
    });
    expect(reused.kind).toBe('reused');
    const conflict = publish(first.ledger, {
      actionId: 'retry-1',
      channel: 'manual',
      actor: HUMAN,
      operations: [{ set: { path: 'allocation', value: 99 } }],
    });
    expect(conflict).toMatchObject({ kind: 'conflict', reason: 'idempotency_mismatch' });
  });

  it('rejects stale CAS and historical writes without appending', () => {
    const first = mustPublish(createDraftActionLedger(BASE), {
      actionId: 'r1',
      channel: 'manual',
      actor: HUMAN,
      operations: [{ set: { path: 'allocation', value: 20 } }],
    });
    const stale = publish(first, {
      actionId: 'r2',
      channel: 'manual',
      actor: HUMAN,
      operations: [{ set: { path: 'allocation', value: 21 } }],
      expectedRevision: 0,
    });
    expect(stale).toMatchObject({ kind: 'conflict', reason: 'stale_revision' });
    const historical = publish(first, {
      actionId: 'r3',
      channel: 'manual',
      actor: HUMAN,
      operations: [{ set: { path: 'allocation', value: 11 } }],
      targetRevision: 0,
    });
    expect(historical).toMatchObject({ kind: 'rejected', reason: 'historical_write' });
    expect(first.actions).toHaveLength(1);
  });

  it('returns a recoverable no-change receipt instead of an empty action', () => {
    const result = publish(createDraftActionLedger(BASE), {
      actionId: 'noop',
      channel: 'manual',
      actor: HUMAN,
      operations: [{ set: { path: 'allocation', value: 10 } }],
    });
    expect(result.kind).toBe('no_change');
    if (result.kind !== 'no_change') return;
    expect(result.ledger.actions).toHaveLength(0);
    expect(result.receipt.outcome).toBe('no_change');
  });

  it('keeps twenty saved edits as twenty immutable actions and one net card per node', () => {
    let ledger = createDraftActionLedger(BASE);
    for (let index = 1; index <= 20; index += 1) {
      ledger = mustPublish(ledger, {
        actionId: `edit-${index}`,
        channel: 'manual',
        actor: HUMAN,
        operations: [{ set: { path: 'allocation', value: 10 + index } }],
      });
    }
    expect(ledger.actions).toHaveLength(20);
    expect(listDraftActions(ledger).map((action) => action.actionId)[0]).toBe('edit-20');
    expect(selectedActionView(ledger)?.cards).toHaveLength(1);
    expect(netDiffCards(ledger)).toHaveLength(1);
    expect(nodeHistory(ledger, nodeIdForPath('allocation')).entries).toHaveLength(20);
    expect(replayToRevision(ledger, 7)).toMatchObject({ allocation: 17 });
    expect(currentComposition(ledger)).toMatchObject({ allocation: 30 });
  });

  it('preserves node identity across rename and discloses delete/recreate as a new node', () => {
    let ledger = createDraftActionLedger(BASE);
    ledger = mustPublish(ledger, {
      actionId: 'rename',
      channel: 'manual',
      actor: HUMAN,
      operations: [{ rename: { path: 'allocation', to: 'budget' } }],
    });
    const renamed = selectedActionView(ledger);
    expect(renamed?.cards).toHaveLength(1);
    expect(renamed?.cards[0]?.nodeId).toBe(nodeIdForPath('allocation'));
    expect(renamed?.cards[0]?.path).toBe('budget');

    ledger = mustPublish(ledger, {
      actionId: 'drop',
      channel: 'manual',
      actor: HUMAN,
      operations: [{ drop: { path: 'budget' } }],
    });
    ledger = mustPublish(ledger, {
      actionId: 'recreate',
      channel: 'manual',
      actor: HUMAN,
      operations: [{ set: { path: 'budget', value: 10 } }],
    });
    const recreated = selectedActionView(ledger)?.cards[0];
    expect(recreated?.nodeId).toBe(`${nodeIdForPath('budget')}@3:0`);
    expect(recreated?.nodeId).not.toBe(nodeIdForPath('allocation'));
  });

  it('imports a legacy blob as one truthful action, not guessed history', () => {
    const result = importLegacyDocument({
      base: BASE,
      current: { ...BASE, allocation: 99, extra: 'kept' },
      actionId: 'import-1',
      publishedAt: '2026-09-20T00:00:00Z',
      actor: { kind: 'service', id: 'service:t3x-workspace-import' },
      reason: 'legacy workspace_state capture',
    });
    expect(result.kind).toBe('published');
    if (result.kind !== 'published') return;
    expect(result.ledger.actions).toHaveLength(1);
    expect(result.action.channel).toBe('import');
    expect(currentComposition(result.ledger)).toMatchObject({ allocation: 99, extra: 'kept' });
  });

  it('restores a historical value by appending a current-state change', () => {
    const throughA3 = fixtureThroughA3();
    const restore = restoreNodeToAction(throughA3, nodeIdForPath('allocation'), 'A1');
    expect(restore).toMatchObject({ path: 'allocation', value: 20 });
    const next = mustPublish(throughA3, {
      actionId: 'restore-A1-allocation',
      channel: 'manual',
      actor: HUMAN,
      operations: restore.operations,
    });
    expect(currentComposition(next)).toMatchObject({ allocation: 20 });
    expect(selectedActionView(next, 'A3')?.cards[0]).toMatchObject({ before: 30, after: 25 });
  });

  it('previews compensation conflicts when later actions touched the same node', () => {
    const throughA3 = fixtureThroughA3();
    const preview = previewCompensate(throughA3, 'A1');
    expect(preview.conflicts.some((conflict) => conflict.path === 'allocation')).toBe(true);
    expect(preview.operations.find((op) => 'set' in op && op.set.path === 'regions')).toMatchObject(
      {
        set: { path: 'regions', value: 'AU' },
      }
    );
  });
});
