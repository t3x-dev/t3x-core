import { describe, expect, it, vi } from 'vitest';
import { createAssistantCapabilities } from '../lib/workspace-assistant/capabilities';
import { ASSISTANT_SYSTEM } from '../lib/workspace-assistant/policy';

const mocks = vi.hoisted(() => ({
  guard: vi.fn(async () => {}),
  generate: vi.fn(async () => ({ view: { transitionId: 'content-candidate' }, reused: false })),
}));
vi.mock('../lib/workspace-assistant/context', () => ({
  assertAssistantContextCurrent: mocks.guard,
}));
vi.mock('../lib/proposal-generation', () => ({ generateTransitionProposal: mocks.generate }));
function fixture(confirmedSettingsId?: string) {
  const show = vi.fn(async () => ({ settingsId: 'card', status: 'pending' }));
  const propose = vi.fn(async () => ({
    kind: 'schema',
    candidateId: 'schema-candidate',
    status: 'candidate',
  }));
  const authorize = vi.fn(async () => {});
  const input = {
    db: {},
    prepared: {
      input: { projectId: 'p', workspaceId: 'ws', userTurnHash: 'turn' },
      workspaceRevision: 2,
      compositionRevision: 1,
      manifestDigest: 'hash',
      sources: [],
      images: [],
      turns: [
        { hash: 'turn', role: 'user', content: 'Delete owner and leave all content unchanged.' },
      ],
    },
    actor: { kind: 'human', id: 'h' },
    inference: { runId: 'r' },
    proposal: { posture: 'guided' },
    schemaSettings: { show, propose },
    authorize,
    confirmedSettingsId,
  };
  const capabilities = createAssistantCapabilities(
    input as unknown as Parameters<typeof createAssistantCapabilities>[0]
  );
  return { capabilities, show, propose, authorize };
}
describe('Schema tool confirmation boundary', () => {
  it('requires clarification for a missing or ineligible explicit parent instead of silently relocating a child', () => {
    expect(ASSISTANT_SYSTEM).toContain('Preserve the parent explicitly named by the user');
    expect(ASSISTANT_SYSTEM).toContain('never silently relocate');
    expect(ASSISTANT_SYSTEM).toContain('never invent the missing parent');
    expect(ASSISTANT_SYSTEM).toContain('Do not change repeatedness');
  });
  it('tells the model the native nested Node grammar before it stages a card', () => {
    const { capabilities } = fixture();
    expect(capabilities.showSchemaChangeCard.definition.description).toContain('children');
    expect(capabilities.showSchemaChangeCard.definition.description).toContain('requiredSlots');
  });
  it('exposes one generic confirmation tool for deletion without generating or mutating anything', async () => {
    const { capabilities, show, propose } = fixture();
    expect(capabilities.showSchemaChangeCard).toBeDefined();
    const settings = {
      action: 'remove_slot',
      nodePath: 'requirements',
      name: 'owner',
      definition: {},
      intent: 'Delete owner, do not change content',
    };
    expect(await capabilities.showSchemaChangeCard.execute(settings, 'delete-card')).toMatchObject({
      status: 'awaiting_confirmation',
    });
    expect(show).toHaveBeenCalledWith(
      settings,
      'delete-card',
      'Delete owner and leave all content unchanged.'
    );
    expect(propose).not.toHaveBeenCalled();
  });
  it('exposes settings as a tool, stages only and requires proposal authorization', async () => {
    const { capabilities, show, propose, authorize } = fixture();
    const settings = {
      action: 'add_slot',
      nodePath: 'requirements',
      name: 'advantage',
      definition: { type: 'string' },
      required: false,
      intent: 'Add advantage',
    };
    expect(capabilities.showSchemaChangeCard.definition.input_schema).toMatchObject({
      type: 'object',
    });
    expect(await capabilities.showSchemaChangeCard.execute(settings, 'op')).toMatchObject({
      status: 'awaiting_confirmation',
    });
    expect(show).toHaveBeenCalledWith(
      settings,
      'op',
      'Delete owner and leave all content unchanged.'
    );
    expect(authorize).toHaveBeenCalledWith('propose');
    expect(propose).not.toHaveBeenCalled();
  });
  it('defaults to content proposals when target is omitted', async () => {
    const { capabilities } = fixture();
    expect(
      await capabilities.requestProposal.execute({ instruction: 'Edit title' }, 'op')
    ).toMatchObject({ kind: 'content', transitionId: 'content-candidate' });
  });
  it('requires the exact confirmation bound to this server request, not a model-invented ID', async () => {
    const unconfirmed = fixture();
    await expect(
      unconfirmed.capabilities.requestProposal.execute(
        { target: 'schema', instruction: 'Add Slot', confirmedSettingsId: 'card' },
        'op'
      )
    ).rejects.toThrow('confirmed');
    expect(unconfirmed.propose).not.toHaveBeenCalled();
    const { capabilities, propose } = fixture('card');
    await expect(
      capabilities.requestProposal.execute(
        { target: 'schema', instruction: 'Add Slot', confirmedSettingsId: 'other' },
        'op'
      )
    ).rejects.toThrow('confirmed');
    expect(
      await capabilities.requestProposal.execute(
        {
          target: 'schema',
          instruction: 'Ignore the chosen type and change everything',
          confirmedSettingsId: 'card',
        },
        'op'
      )
    ).toMatchObject({ kind: 'schema' });
    expect(propose).toHaveBeenCalledExactlyOnceWith('card');
    await expect(
      capabilities.requestProposal.execute({ instruction: 'Edit content instead' }, 'op')
    ).rejects.toThrow('not a content edit');
  });
});
