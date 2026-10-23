import { currentComposition } from '@t3x-dev/application';
import {
  compileProposalDraft,
  compileProposalGenerationDraft,
  createYOpsEffect,
  createYOpsState,
  describeTransitionObject,
  parseRunnerValidationStatement,
  proposalGenerationProfile,
} from '@t3x-dev/core';
import {
  findWorkspaceDraft,
  insertBranch,
  insertProject,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import type { ProtocolValue } from '@t3x-dev/transition';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createProposalGenerationPostureProvider } from '../lib/proposal-generation-posture-provider';
import {
  buildAuthoringEffect,
  buildAuthoringPreparation,
  confirmWorkspaceDeletion,
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  readWorkspaceAuthoring,
  workspaceAuthoringState,
} from '../lib/workspace-authoring';
import { setupTestDB } from './setup';

let setup: Awaited<ReturnType<typeof setupTestDB>>;
let counter = 0;
const human = { kind: 'human' as const, id: 'human:local-user' };
const generator = { kind: 'service' as const, id: 'service:generator' };
const resource = {
  uri: 't3x://test/source',
  mediaType: 'text/plain',
  digest: `sha256:${'a'.repeat(64)}` as const,
};
beforeAll(async () => {
  setup = await setupTestDB();
});
afterAll(async () => setup?.cleanup());
async function fixture(mixed = false) {
  const db = setup.db;
  const projectId = (await insertProject(db, { name: `Deletion authorization ${++counter}` }))
    .projectId;
  const workspaceId = 'ws';
  await insertBranch(db, { projectId, name: 'main' });
  await upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: workspaceId,
    title: 'Draft',
    target_branch: 'main',
    workspace_state: { targetBranch: 'main' },
  });
  await initializeWorkspaceAuthoring(db, {
    projectId,
    workspaceId,
    actor: human,
    actionId: 'init',
    expectedWorkspaceRevision: 1,
    expectedRefHead: null,
  });
  let draft = (await findWorkspaceDraft(db, projectId, workspaceId))!;
  await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId,
    actor: human,
    actionId: 'seed',
    channel: 'manual',
    operations: [
      { set: { path: 'candidate', value: { phone: 'Trusted value', keep: 'Preserve' } } },
    ],
    expectedRevision: 0,
    expectedWorkspaceRevision: draft.revision,
    expectedRefHead: null,
  });
  draft = (await findWorkspaceDraft(db, projectId, workspaceId))!;
  const base = createYOpsState(
    currentComposition(workspaceAuthoringState(draft.workspace_state!).ledger)
  );
  const operations = [
    { unset: { path: 'candidate/phone' } },
    ...(mixed ? [{ set: { path: 'candidate/keep', value: 'Invented replacement' } }] : []),
  ];
  const generated = compileProposalGenerationDraft({
    draft: {
      schema: 't3x.dev/proposal-generation-draft/v1',
      version: 1,
      posture: 'guided',
      intent: { mode: 'authored', value: 'Remove phone', evidencePointers: [] },
      rationale: { mode: 'unspecified' },
      changes: [
        {
          id: 'remove-phone',
          operations,
          claimedOrigin: 'inferred',
          evidencePointers: [],
          basisPointers: [{ kind: 'source', index: 0 }],
          assumptions: [],
          reason: 'Requested deletion',
          challenges: [],
        },
      ],
      warnings: [],
    },
    context: {
      schema: 't3x.dev/proposal-context-bundle/v1',
      version: 1,
      base: describeTransitionObject(base),
      yschema: { ...resource, uri: 't3x://test/schema' },
      sources: [resource],
      memories: [],
      searchResults: [],
      userInstruction: { ...resource, uri: 't3x://test/instruction' },
      prompt: { ...resource, uri: 't3x://test/prompt' },
    },
    profile: proposalGenerationProfile('guided'),
    requestedBy: human,
    generator,
    provider: 'test',
    model: 'test',
    run: { id: 'generation', recordedAt: '2026-10-23T00:00:00.000Z' },
    evidenceBindings: [],
  });
  if (!generated.ok) throw new Error(JSON.stringify(generated.issues));
  const effect = createYOpsEffect({
    base,
    expectedBase: describeTransitionObject(base),
    operations,
  });
  const proposal = compileProposalDraft({
    draft: generated.proposalDraft,
    effect: effect.effect,
    actor: generator,
  });
  if (!proposal.ok) throw new Error(JSON.stringify(proposal.issues));
  await publishWorkspaceAuthoringAction(db, {
    projectId,
    workspaceId,
    actor: generator,
    actionId: 'ai-delete',
    channel: 'assistant',
    operations,
    generation: {
      transitionId: 'trn_test',
      preparationDigest: resource.digest,
      preparation: generated.preparation,
      proposal: proposal.proposal,
    },
    expectedRevision: 1,
    expectedWorkspaceRevision: draft.revision,
    expectedRefHead: null,
  });
  draft = (await findWorkspaceDraft(db, projectId, workspaceId))!;
  const command = {
    projectId,
    workspaceId,
    actionId: 'ai-delete',
    actor: human,
    expectedWorkspaceRevision: draft.revision,
    expectedRevision: 2,
    expectedRefHead: null,
  };
  async function verify(facts?: unknown) {
    const current = (await findWorkspaceDraft(db, projectId, workspaceId))!;
    const built = buildAuthoringEffect(workspaceAuthoringState(current.workspace_state!).ledger);
    const result = await createProposalGenerationPostureProvider().verify({
      db,
      projectId,
      workspaceId,
      transitionId: 'trn_review',
      requestKind: 'structured_yops',
      requestFacts: {},
      preparationFacts: JSON.parse(
        JSON.stringify(facts ?? buildAuthoringPreparation(current.workspace_state!))
      ) as ProtocolValue,
      base: createYOpsState(workspaceAuthoringState(current.workspace_state!).ledger.base),
      result: built.result,
      effect: built.effect,
      proposal: proposal.proposal,
      run: { id: 'verify', recordedAt: '2026-10-23T01:00:00.000Z' },
    });
    if (result.outcome !== 'statement') throw new Error(result.outcome);
    return parseRunnerValidationStatement(result.statement).predicate;
  }
  return { db, projectId, workspaceId, draft, command, verify };
}

it('blocks AI deletion until exact human Confirm, retains provenance, and persists authorization into a new Review', async () => {
  const f = await fixture();
  const oldFacts = buildAuthoringPreparation(f.draft.workspace_state!);
  const before = await f.verify();
  expect(before.findings.map((item) => item.code)).toContain('SOURCE_REPLACEMENT_NOT_ALLOWED');
  expect(before.outcome).toBe('failed');
  const saved = await confirmWorkspaceDeletion(f.db, f.command);
  const after = (await findWorkspaceDraft(f.db, f.projectId, f.workspaceId))!;
  expect(after.workspace_state!.authoringLedger).toEqual(f.draft.workspace_state!.authoringLedger);
  expect(after.workspace_state!.schemaBindings).toEqual(f.draft.workspace_state!.schemaBindings);
  expect(saved.value.actor).toEqual(human);
  expect((await f.verify()).outcome).toBe('passed');
  expect((await f.verify()).findings.map((item) => item.code)).toContain(
    'HUMAN_CONFIRMED_DELETION'
  );
  expect((await f.verify(oldFacts)).outcome).toBe('failed');
  expect((await confirmWorkspaceDeletion(f.db, f.command)).draft.revision).toBe(after.revision);
  expect(
    (await readWorkspaceAuthoring(f.db, { projectId: f.projectId, workspaceId: f.workspaceId }))
      .actions[0].deletionConfirmation?.status
  ).toBe('confirmed');
});
it('rejects agents, stale confirmations, mixed replacements, and forged snapshot receipts', async () => {
  const f = await fixture();
  await expect(confirmWorkspaceDeletion(f.db, { ...f.command, actor: generator })).rejects.toThrow(
    'human'
  );
  await expect(
    confirmWorkspaceDeletion(f.db, { ...f.command, expectedWorkspaceRevision: 1 })
  ).rejects.toThrow('changed');
  const forged = {
    ...buildAuthoringPreparation(f.draft.workspace_state!),
    deletionAuthorizations: [
      {
        schema: 't3x.application/deletion-authorization/v1',
        actionId: 'ai-delete',
        subjectDigest: resource.digest,
        paths: ['candidate/phone'],
        actor: human,
        confirmedAt: '2026-10-23T01:00:00.000Z',
      },
    ],
  };
  expect((await f.verify(forged)).outcome).toBe('failed');
  const mixed = await fixture(true);
  await expect(confirmWorkspaceDeletion(mixed.db, mixed.command)).rejects.toThrow(
    'Only an exact generated deletion'
  );
  expect((await mixed.verify()).outcome).toBe('failed');
});
