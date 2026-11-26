import {
  createDraftActionLedger,
  type DraftActionActor,
  type DraftActionLedger,
  publishDraftAction,
} from '@t3x-dev/application';
import { describe, expect, it } from 'vitest';
import {
  DelegatedDraftHumanDecisionRequired,
  enforceDelegatedDraftAuthorship,
} from '../lib/delegated-draft-authorship';

const agent = { kind: 'agent' as const, id: 'agent:api-key:ak_dlg_first' };
const human = { kind: 'human' as const, id: 'user:owner' };

function edit(
  ledger: DraftActionLedger,
  actor: DraftActionActor,
  channel: 'manual' | 'mcp' | 'import'
) {
  const result = publishDraftAction(ledger, {
    actionId: `action-${ledger.actions.length}`,
    expectedRevision: ledger.compositionRevision,
    operations: [{ set: { path: 'owner', value: `owner-${ledger.actions.length}` } }],
    actor,
    channel,
    publishedAt: '2026-11-26T00:00:00Z',
  });
  if (result.kind !== 'published') throw new Error(result.kind);
  return result.ledger;
}
const schema = {
  status: 'bound',
  schemaHash: 'sha256:' + '0'.repeat(64),
  definition: {},
  bindings: [],
};
function check(ledger: DraftActionLedger, proposer = agent, selectedSchema = schema) {
  const preparation = {
    schema: 't3x.application/workspace-authoring-preparation/v1',
    ledger,
    schemaReview: {
      schema: 't3x.application/workspace-schema-review/v1',
      base: schema,
      draft: selectedSchema,
      changes: [],
      actionCount: ledger.actions.length,
      baseContent: {},
      draftContent: {},
    },
  };
  enforceDelegatedDraftAuthorship(
    { proposal: { actor: proposer }, preparation: { canonicalJson: JSON.stringify(preparation) } },
    agent
  );
}
describe('Whole-Draft delegation decisions', () => {
  const initial = createDraftActionLedger({});
  it('accepts ordinary edits solely authored by this Agent on an adopted Schema', () => {
    expect(() => check(edit(initial, agent, 'mcp'))).not.toThrow();
  });
  it('keeps a mixed or imported Draft, changed Schema and foreign Proposal for human decision', () => {
    expect(() => check(edit(edit(initial, human, 'manual'), agent, 'mcp'))).toThrow(
      DelegatedDraftHumanDecisionRequired
    );
    expect(() => check(edit(initial, agent, 'import'))).toThrow(
      DelegatedDraftHumanDecisionRequired
    );
    expect(() => check(edit(initial, agent, 'mcp'), { ...agent, id: 'other' })).toThrow(
      DelegatedDraftHumanDecisionRequired
    );
    expect(() =>
      check(edit(initial, agent, 'mcp'), agent, {
        ...schema,
        schemaHash: 'sha256:' + '1'.repeat(64),
      })
    ).toThrow(DelegatedDraftHumanDecisionRequired);
  });
});
