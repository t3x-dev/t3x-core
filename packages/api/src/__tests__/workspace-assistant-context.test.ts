import {
  createDraftActionLedger,
  currentComposition,
  publishDraftAction,
} from '@t3x-dev/application';
import { createYOpsState, describeTransitionObject } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import { renderAssistantContext } from '../lib/workspace-assistant/context';
import type { PreparedAssistantContext } from '../lib/workspace-assistant/contracts';
import { assistantProviderCapabilities } from '../lib/workspace-assistant/policy';
import { authoringManifestDigest } from '../lib/workspace-authoring-generation';

function fixture(): Omit<PreparedAssistantContext, 'prompt' | 'disclosure'> {
  let ledger = createDraftActionLedger({
    allocation: 10,
    approval: false,
    channel: '#ops',
    replicas: 2,
    timeout: 30,
    regions: ['AU'],
  });
  const ops = [
    [{ set: { path: 'allocation', value: 20 } }, { set: { path: 'regions', value: ['AU', 'NZ'] } }],
    [
      { set: { path: 'allocation', value: 30 } },
      { set: { path: 'channel', value: '#pilot' } },
      { set: { path: 'replicas', value: 4 } },
      { set: { path: 'timeout', value: 45 } },
    ],
    [{ set: { path: 'allocation', value: 25 } }, { set: { path: 'approval', value: true } }],
  ];
  for (const [i, operations] of ops.entries()) {
    const result = publishDraftAction(ledger, {
      actionId: `A${i + 1}`,
      channel: i === 0 ? 'assistant' : i === 1 ? 'mcp' : 'manual',
      actor: { kind: 'human', id: 'user:test' },
      expectedRevision: i,
      operations,
      publishedAt: `2026-09-01T00:00:0${i}.000Z`,
    });
    if (result.kind !== 'published') throw Error('Fixture failed');
    ledger = result.ledger;
  }
  const basis = {
    schema: 't3x.application/workspace-authoring-basis/v1' as const,
    refName: 'main',
    refHead: null,
    baseDigest: describeTransitionObject(createYOpsState(ledger.base)).digest,
    initialization: { requestId: 'init', facts: 'server-only' },
  };
  return {
    input: {
      projectId: 'p',
      workspaceId: 'w',
      selectedActionId: 'A2',
      selectedNodeId: 'node:allocation',
    },
    workspaceRevision: 4,
    compositionRevision: 3,
    basis,
    ledger,
    current: currentComposition(ledger),
    manifestDigest: authoringManifestDigest(ledger, basis),
    sources: [],
    turns: [{ hash: 'u', role: 'user', content: 'Explain this change' }],
    olderTurnsAvailable: false,
  };
}
describe('Assistant model context', () => {
  it('binds all actions while explaining historical and current values separately', () => {
    const prepared = fixture();
    const result = renderAssistantContext(prepared);
    const envelope = JSON.parse(
      (result.prompt.messages[0].content as string).split('\n').slice(1).join('\n')
    );
    expect(envelope.fullManifest.actionCount).toBe(3);
    expect(envelope.current.allocation).toBe(25);
    expect(envelope.inspectedAction.cards).toHaveLength(4);
    expect(
      envelope.inspectedAction.cards.find((card: { path: string }) => card.path === 'allocation')
    ).toMatchObject({ before: 20, after: 30 });
    expect(envelope.fullManifest.digest).toBe(prepared.manifestDigest);
    expect(JSON.stringify(result)).not.toContain('server-only');
  });
  it('bounds long conversations and source text without mutating canonical history', () => {
    const prepared = fixture();
    prepared.input.maxContextChars = 8000;
    prepared.sources = [
      {
        materialId: 'doc',
        resource: {
          uri: 't3x://projects/p/materials/doc',
          mediaType: 'text/plain',
          digest: `sha256:${'a'.repeat(64)}`,
        },
        content: 'source '.repeat(5000),
      },
    ];
    prepared.turns = [
      ...Array.from({ length: 40 }, (_, i) => ({
        hash: `u${i}`,
        role: 'user' as const,
        content: 'older context '.repeat(100),
      })),
      { hash: 'latest', role: 'user', content: 'Only discuss; do not propose.' },
    ];
    const result = renderAssistantContext(prepared);
    expect(result.disclosure.partial).toBe(true);
    expect(result.disclosure.characters).toBeLessThanOrEqual(8000);
    expect(result.prompt.messages.at(-1)?.content).toBe('Only discuss; do not propose.');
    expect(prepared.ledger.actions).toHaveLength(3);
    expect(prepared.sources[0].content.length).toBe(35000);
  });
  it('does not invent tool support from provider catalog metadata', () => {
    expect(
      assistantProviderCapabilities({
        generate: async () => ({ text: '', usage: { inputTokens: 0, outputTokens: 0 } }),
      })
    ).toEqual({ tools: false, structured: false, chat: true });
  });
});
