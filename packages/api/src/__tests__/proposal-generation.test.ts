import { parseAcceptancePolicy, parseProposalGenerationPreparation } from '@t3x-dev/core';
import {
  type AnyDB,
  bindTransitionPolicy,
  createMaterial,
  ensureMainBranch,
  insertConversation,
  insertProject,
  insertTurn,
  resolveTransitionProposalGraph,
  TransitionRequestConflictError,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createInferenceRuntime } from '../lib/inference';
import {
  generateTransitionProposal,
  PROPOSAL_GENERATOR_ACTOR,
  ProposalGenerationContextError,
  ProposalGenerationDraftError,
  type ProposalGenerationModel,
  resolveProposalGenerationSources,
} from '../lib/proposal-generation';
import { createProposalGenerationPostureProvider } from '../lib/proposal-generation-posture-provider';
import { verifyTransition } from '../lib/transition-control-plane';
import { commitTransition, decideTransition } from '../lib/transition-control-plane/lifecycle';
import { materializeTransitionProposal } from '../lib/transition-control-plane/materialize';
import {
  buildAuthoringPreparation,
  initializeWorkspaceAuthoring,
  publishWorkspaceAuthoringAction,
  readWorkspaceAuthoring,
} from '../lib/workspace-authoring';
import { publishWorkspaceGeneration } from '../lib/workspace-generation-publication';
import {
  decideWorkspaceTransition,
  WorkspaceTransitionReviewStaleError,
} from '../lib/workspace-transition';
import { setupTestDB, testData } from './setup';

let db: AnyDB;
let cleanup: () => Promise<void>;

function policy() {
  return parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'any' } },
      override: { actors: { mode: 'any' } },
      allowSelfApproval: true,
    },
    claims: {
      intent: {
        allowedModes: ['stated'],
        minimumEvidence: 1,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['authored'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
      },
      validation: {
        requirement: 'optional',
        issuers: { mode: 'any' },
        tools: { mode: 'any' },
        environments: { mode: 'any' },
        profiles: { mode: 'any' },
        schemas: { mode: 'any' },
        contexts: { mode: 'any' },
      },
      humanConfirmation: { issuers: { mode: 'any' } },
    },
    override: {
      allowClaimFailures: false,
      allowFailedValidation: false,
      allowMissingHumanConfirmation: false,
      allowMissingValidation: false,
    },
  });
}

async function fixture(name: string) {
  const project = await insertProject(db, testData.project({ name }));
  await ensureMainBranch(db, project.projectId);
  const workspaceId = `ws_${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_')}`;
  const sourceText = 'The launch audience is enterprise operators.';
  const material = await createMaterial(db, {
    project_id: project.projectId,
    source_type: 'document',
    title: 'launch-notes.txt',
    content_text: sourceText,
    content_hash: `test:${name}`,
  });
  const workspace = await upsertWorkspaceDraft(db, {
    project_id: project.projectId,
    workspace_id: workspaceId,
    title: name,
    target_branch: 'main',
    workspace_state: {
      id: workspaceId,
      projectId: project.projectId,
      title: name,
      targetBranch: 'main',
      schemaBindings: [{ canonicalName: 't3x/prd', version: 'v2', mode: 'pinned' }],
      sourceBundle: [
        {
          id: `material:${material.id}`,
          type: 'document',
          materialId: material.id,
          contentHash: material.content_hash,
        },
      ],
    },
  });
  await bindTransitionPolicy(db, {
    projectId: project.projectId,
    refName: 'main',
    uri: `t3x://policies/${project.projectId}/generation`,
    policy: policy(),
    actor: { kind: 'human', id: 'user:policy-admin' },
  });
  return { projectId: project.projectId, workspaceId, workspace, material, sourceText };
}

function draft(
  quote = 'launch audience is enterprise operators',
  posture: 'source_only' | 'guided' | 'recommend' = 'guided',
  value = 'enterprise operators'
) {
  const pointer = {
    sourceIndex: 0,
    locator: { scheme: 't3x.text-quote/v1', value: { quote } },
  };
  return {
    schema: 't3x.dev/proposal-generation-draft/v1',
    version: 1,
    posture,
    intent: { mode: 'stated', value: 'Target enterprise operators', evidencePointers: [pointer] },
    rationale: {
      mode: 'authored',
      value: 'Turn the source claim into structured state',
      evidencePointers: [],
    },
    changes: [
      {
        id: 'audience',
        operations: [{ set: { path: 'prd/audience', value } }],
        claimedOrigin: 'source_backed',
        evidencePointers: [pointer],
        basisPointers: [],
        assumptions: [],
        reason: 'The source states the audience explicitly',
        challenges: [],
      },
    ],
    warnings: [],
  } as const;
}

function model(
  generate = vi.fn(async () => ({ draft: draft(), usage: { inputTokens: 11, outputTokens: 7 } }))
): ProposalGenerationModel {
  return { provider: 'test', model: 'test-model', generate };
}

let generationSequence = 0;
const inferenceRuntime = createInferenceRuntime({
  createGenerationId: () => `gen_proposal_${++generationSequence}`,
});

function inference(projectId: string) {
  return {
    runtime: inferenceRuntime,
    runId: `test:proposal-generation:${projectId}`,
    scope: {
      actor: { kind: 'user' as const, id: 'user:test' },
      projectId,
      projectVisibility: 'unknown' as const,
    },
  };
}

function databaseFacade(target: AnyDB): AnyDB {
  return new Proxy(target as unknown as object, {
    get(object, property, receiver) {
      const value = Reflect.get(object, property, receiver);
      return typeof value === 'function' ? value.bind(object) : value;
    },
  }) as AnyDB;
}

beforeAll(async () => {
  const setup = await setupTestDB();
  db = setup.db;
  cleanup = setup.cleanup;
});

afterAll(async () => cleanup());

describe('governed Proposal generation', () => {
  it('single-flights generation, atomically binds the Manifest, and reuses durable retries', async () => {
    const data = await fixture('Generation identity');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const generate = vi.fn(async () => {
      await gate;
      return { draft: draft(), usage: { inputTokens: 11, outputTokens: 7 } };
    });
    const selected = model(generate);
    const requester = { kind: 'human' as const, id: 'user:requester' };
    const common = {
      db,
      projectId: data.projectId,
      requestId: 'generation:identity',
      requester,
      request: {
        workspaceId: data.workspaceId,
        posture: 'guided' as const,
        instruction: 'Structure the launch audience.',
        sourceMaterialIds: [data.material.id],
        expectedRevision: data.workspace.revision,
      },
      resolveModel: async () => selected,
      inference: inference(data.projectId),
      now: () => new Date('2026-08-13T01:00:00.000Z'),
    };

    const first = generateTransitionProposal(common);
    const concurrent = generateTransitionProposal(common);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    release();
    const [left, right] = await Promise.all([first, concurrent]);

    expect(left.view.transitionId).toBe(right.view.transitionId);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0].prompt).toContain(
      'create one change group\nper independently stated requirement'
    );
    expect(generate.mock.calls[0]?.[0].prompt).toContain(
      'must become its own schema-valid collection member or tree node'
    );
    expect(generate.mock.calls[0]?.[0].prompt).toContain(
      "a root node's slots are on that root node"
    );
    expect(generate.mock.calls[0]?.[0].prompt).toContain(
      'paths into the semantic tree MUST start with "content/trees/"'
    );
    expect(generate.mock.calls[0]?.[0].prompt).toContain(
      'add each new requirement with one append operation'
    );
    expect(generate.mock.calls[0]?.[0].prompt).toContain(
      '"append" is the operation name beside "set"'
    );
    expect(left.view.precondition.policyDigest).not.toBeNull();
    const graph = await resolveTransitionProposalGraph(db, data.projectId, left.view.transitionId);
    expect(graph.membership.actor).toEqual(PROPOSAL_GENERATOR_ACTOR);
    expect(graph.proposal.actor).toEqual(PROPOSAL_GENERATOR_ACTOR);
    const preparation = parseProposalGenerationPreparation(
      JSON.parse(graph.preparation!.canonicalJson)
    );
    expect(preparation.requestedBy).toEqual(requester);
    expect(preparation.generator).toEqual(PROPOSAL_GENERATOR_ACTOR);
    expect(preparation.bindings[0]?.evidence[0]?.locator.value).toEqual({
      quote: 'launch audience is enterprise operators',
    });
    expect(preparation.bindings[0]?.evidence[0]?.resource.uri).toContain(
      `/materials/${data.material.id}`
    );

    const reused = await generateTransitionProposal({
      ...common,
      resolveModel: async () => {
        throw new Error('durable retry must not resolve or invoke a model');
      },
    });
    expect(reused.reused).toBe(true);
    expect(reused.view.transitionId).toBe(left.view.transitionId);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('passes the Compose conversation transcript into the generation model', async () => {
    const data = await fixture('Conversation memory');
    const generate = vi.fn(async () => ({
      draft: draft(),
      usage: { inputTokens: 11, outputTokens: 7 },
    }));

    await generateTransitionProposal({
      db,
      projectId: data.projectId,
      requestId: 'generation:conversation',
      requester: { kind: 'human', id: 'user:conversation' },
      request: {
        workspaceId: data.workspaceId,
        posture: 'guided',
        instruction: 'Summarize the conversation into schema-aligned changes.',
        sourceMaterialIds: [data.material.id],
        conversationTranscript: 'You: Raise allocation to 25%.\n\nAssistant: That is on page 3.',
      },
      resolveModel: async () => model(generate),
      inference: inference(data.projectId),
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationTranscript: 'You: Raise allocation to 25%.\n\nAssistant: That is on page 3.',
        context: expect.objectContaining({
          memories: [expect.objectContaining({ mediaType: 'text/plain;charset=utf-8' })],
        }),
      })
    );
  });

  it('aligns drifted provider drafts so guided conversation summaries can compile', async () => {
    const data = await fixture('Aligned conversation draft');
    const generate = vi.fn(async () => ({
      draft: {
        schema: 't3x.dev/proposal-generation-draft/v1',
        version: 1,
        posture: 'source_only',
        intent: { mode: 'authored', value: 'Summarize the conversation', evidencePointers: [] },
        rationale: { mode: 'unspecified' },
        changes: [
          {
            id: 'audience',
            operations: [{ add: { path: 'prd/audience', value: 'enterprise operators' } }],
            claimedOrigin: 'inferred',
            evidencePointers: [],
            basisPointers: [{ kind: 'search_result', index: 0 }],
            assumptions: [],
            reason: 'The conversation asks for a structured audience slot',
            challenges: [],
          },
        ],
        alternatives: [],
        warnings: [],
      },
      usage: { inputTokens: 11, outputTokens: 7 },
    }));

    const generated = await generateTransitionProposal({
      db,
      projectId: data.projectId,
      requestId: 'generation:aligned-conversation',
      requester: { kind: 'human', id: 'user:aligned' },
      request: {
        workspaceId: data.workspaceId,
        posture: 'guided',
        instruction: 'Summarize the conversation into schema-aligned changes.',
        sourceMaterialIds: [data.material.id],
        conversationTranscript: 'You: Raise allocation to 25%.',
      },
      resolveModel: async () => model(generate),
      inference: inference(data.projectId),
    });

    expect(generated.reused).toBe(false);
    expect(generated.view.generation?.groups[0]?.origin).toBe('inferred');
  });

  it('rejects forged quote pointers without persisting a Proposal', async () => {
    const data = await fixture('Forged evidence');
    const generate = vi.fn(async () => ({
      draft: draft('a claim absent from the source'),
      usage: { inputTokens: 11, outputTokens: 7 },
    }));

    await expect(
      generateTransitionProposal({
        db,
        projectId: data.projectId,
        requestId: 'generation:forged',
        requester: { kind: 'human', id: 'user:forged' },
        request: {
          workspaceId: data.workspaceId,
          posture: 'guided',
          instruction: 'Structure the launch audience.',
          sourceMaterialIds: [data.material.id],
        },
        resolveModel: async () => model(generate),
        inference: inference(data.projectId),
      })
    ).rejects.toBeInstanceOf(ProposalGenerationDraftError);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-project Source ids before resolving a model', async () => {
    const owner = await fixture('Source owner');
    const consumer = await fixture('Source consumer');
    const resolveModel = vi.fn(async () => model());

    await expect(
      generateTransitionProposal({
        db,
        projectId: consumer.projectId,
        requestId: 'generation:cross-project',
        requester: { kind: 'human', id: 'user:consumer' },
        request: {
          workspaceId: consumer.workspaceId,
          posture: 'guided',
          instruction: 'Use another project source.',
          sourceMaterialIds: [owner.material.id],
        },
        resolveModel,
        inference: inference(consumer.projectId),
      })
    ).rejects.toBeInstanceOf(ProposalGenerationContextError);
    expect(resolveModel).not.toHaveBeenCalled();
  });

  it('detects an idempotency-key payload conflict before resolving a model', async () => {
    const data = await fixture('Generation conflict');
    const requester = { kind: 'agent' as const, id: 'agent:planner' };
    const selected = model();
    await generateTransitionProposal({
      db,
      projectId: data.projectId,
      requestId: 'generation:conflict',
      requester,
      request: {
        workspaceId: data.workspaceId,
        posture: 'guided',
        instruction: 'First instruction.',
        sourceMaterialIds: [data.material.id],
      },
      resolveModel: async () => selected,
      inference: inference(data.projectId),
    });
    const resolveModel = vi.fn(async () => selected);

    await expect(
      generateTransitionProposal({
        db,
        projectId: data.projectId,
        requestId: 'generation:conflict',
        requester,
        request: {
          workspaceId: data.workspaceId,
          posture: 'guided',
          instruction: 'Changed instruction.',
          sourceMaterialIds: [data.material.id],
        },
        resolveModel,
        inference: inference(data.projectId),
      })
    ).rejects.toBeInstanceOf(TransitionRequestConflictError);
    expect(resolveModel).not.toHaveBeenCalled();
  });

  it('returns the durable winner when independent workers race to materialize one request', async () => {
    const data = await fixture('Generation worker race');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const generate = vi.fn(async () => {
      await gate;
      return { draft: draft(), usage: { inputTokens: 11, outputTokens: 7 } };
    });
    const common = {
      projectId: data.projectId,
      requestId: 'generation:worker-race',
      requester: { kind: 'human' as const, id: 'user:worker-race' },
      request: {
        workspaceId: data.workspaceId,
        posture: 'guided' as const,
        instruction: 'Structure the launch audience.',
        sourceMaterialIds: [data.material.id],
        expectedRevision: data.workspace.revision,
      },
      resolveModel: async () => model(generate),
      inference: inference(data.projectId),
      now: () => new Date('2026-08-13T01:00:00.000Z'),
    };
    const first = generateTransitionProposal({
      ...common,
      db: databaseFacade(db),
    });
    const second = generateTransitionProposal({
      ...common,
      db: databaseFacade(db),
    });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    release();

    const [left, right] = await Promise.all([first, second]);
    expect(left.view.transitionId).toBe(right.view.transitionId);
    expect([left.reused, right.reused]).toContain(true);
  });

  it('cannot be decided through the legacy Workspace compatibility policy', async () => {
    const data = await fixture('Generation compatibility boundary');
    const generated = await generateTransitionProposal({
      db,
      projectId: data.projectId,
      requestId: 'generation:compatibility-boundary',
      requester: { kind: 'human', id: 'user:compatibility-boundary' },
      request: {
        workspaceId: data.workspaceId,
        posture: 'guided',
        instruction: 'Structure the launch audience.',
        sourceMaterialIds: [data.material.id],
        expectedRevision: data.workspace.revision,
      },
      resolveModel: async () => model(),
      inference: inference(data.projectId),
    });
    const policyDigest = generated.view.precondition.policyDigest;
    if (policyDigest === null) throw new Error('Generated Proposal has no applicable policy');

    await expect(
      decideWorkspaceTransition(db, {
        projectId: data.projectId,
        workspaceId: data.workspaceId,
        transitionId: generated.view.transitionId,
        content: { trees: [], relations: [] },
        outcome: 'accepted',
        precondition: {
          workspaceRevision: generated.view.precondition.workspaceRevision,
          refHead: generated.view.precondition.refHead,
          effectDigest: generated.view.precondition.effectDigest,
          proposalDigest: generated.view.precondition.proposalDigest,
          statementDigests: generated.view.precondition.statementDigests,
          policyDigest,
        },
        actor: { kind: 'human', id: 'human:compatibility-boundary' },
      })
    ).rejects.toBeInstanceOf(WorkspaceTransitionReviewStaleError);
  });
});

it('generates incrementally over saved manual edits, then publishes one verified action', async () => {
  const data = await fixture('Incremental authoring');
  const actor = { kind: 'human' as const, id: 'user:compose' };
  const initialized = await initializeWorkspaceAuthoring(db, {
    projectId: data.projectId,
    workspaceId: data.workspaceId,
    expectedWorkspaceRevision: data.workspace.revision,
    expectedRefHead: null,
    actionId: 'init',
    actor,
  });
  const manual = await publishWorkspaceAuthoringAction(db, {
    projectId: data.projectId,
    workspaceId: data.workspaceId,
    actionId: 'manual',
    actor,
    channel: 'manual',
    expectedWorkspaceRevision: initialized.draft.revision,
    expectedRevision: 0,
    expectedRefHead: null,
    operations: [{ set: { path: 'manual', value: 'keep' } }],
  });
  const proposed = await generateTransitionProposal({
    db,
    projectId: data.projectId,
    requestId: 'incremental',
    requester: actor,
    request: {
      workspaceId: data.workspaceId,
      expectedRevision: manual.draft.revision,
      posture: 'guided',
      instruction: 'Add the audience without removing manual edits',
      sourceMaterialIds: [data.material.id],
    },
    resolveModel: async () => ({
      provider: 'test',
      model: 'test-model',
      generate: async (input) => {
        expect(input.authoring?.current).toEqual({ manual: 'keep' });
        const value = structuredClone(draft());
        return {
          draft: { ...value, intent: { ...value.intent, value: 'enterprise operators' } },
          usage: { inputTokens: 11, outputTokens: 7 },
        };
      },
    }),
    inference: inference(data.projectId),
  });
  const candidate = await resolveTransitionProposalGraph(
    db,
    data.projectId,
    proposed.view.transitionId
  );
  const pendingView = await readWorkspaceAuthoring(db, {
    projectId: data.projectId,
    workspaceId: data.workspaceId,
  });
  expect(pendingView.pendingCandidates).toEqual([
    expect.objectContaining({ transitionId: proposed.view.transitionId, status: 'candidate' }),
  ]);
  expect(pendingView.basis).not.toHaveProperty('initialization');
  expect(candidate.base.value).toEqual({});
  expect(candidate.result.value).toEqual({
    manual: 'keep',
    prd: { audience: 'enterprise operators' },
  });
  expect(
    (await readWorkspaceAuthoring(db, { projectId: data.projectId, workspaceId: data.workspaceId }))
      .compositionRevision
  ).toBe(1);
  const input = {
    db,
    projectId: data.projectId,
    workspaceId: data.workspaceId,
    transitionId: proposed.view.transitionId,
    requestId: 'publish',
    actor,
  };
  const saved = await publishWorkspaceGeneration(input);
  expect(saved.value.kind).toBe('published');
  expect(saved.value.ledger.actions).toHaveLength(2);
  expect(saved.value.ledger.actions[1].generation?.transitionId).toBe(proposed.view.transitionId);
  expect((await publishWorkspaceGeneration(input)).value.kind).toBe('reused');
  const view = await readWorkspaceAuthoring(db, {
    projectId: data.projectId,
    workspaceId: data.workspaceId,
  });
  expect(view.pendingCandidates).toEqual([]);
  expect(view.selected?.cards).toHaveLength(1);
  expect(view.netDiff).toHaveLength(2);
  const finalGraph = await materializeTransitionProposal({
    db,
    projectId: data.projectId,
    workspaceId: data.workspaceId,
    workspaceRevision: saved.draft.revision,
    refName: 'main',
    refHead: null,
    requestKind: 'structured_yops',
    requestId: 'final-review',
    requestFacts: { adapter: 'workspace_transition_review' },
    preparationFacts: JSON.parse(
      JSON.stringify(buildAuthoringPreparation(saved.draft.workspace_state!))
    ),
    actor: PROPOSAL_GENERATOR_ACTOR,
    base: candidate.base,
    result: candidate.result,
    effect: candidate.effect,
    proposal: candidate.proposal,
  });
  const checked = await verifyTransition({
    db,
    projectId: data.projectId,
    transitionId: finalGraph.membership.transitionId,
    requestId: 'verify-final',
    actor,
    options: { nativeProviders: [createProposalGenerationPostureProvider()] },
  });
  const decision = await decideTransition({
    db,
    projectId: data.projectId,
    transitionId: finalGraph.membership.transitionId,
    requestId: 'decide-final',
    actor,
    outcome: 'accepted',
    precondition: checked.view.precondition,
  });
  const committed = await commitTransition({
    db,
    projectId: data.projectId,
    transitionId: finalGraph.membership.transitionId,
    requestId: 'commit-final',
    actor,
    decisionDigest: decision.decisionDigest,
    expectedHead: null,
  });
  expect(committed.commitDigest).toMatch(/^sha256:/);
  expect((await publishWorkspaceGeneration(input)).value.kind).toBe('reused');
});

it('accepts original project user turns as evidence and rejects assistant self-claims or foreign turns', async () => {
  const data = await fixture('Original conversation evidence');
  const conversation = await insertConversation(db, {
    projectId: data.projectId,
    title: 'Sources',
  });
  const original = await insertTurn(db, {
    projectId: data.projectId,
    conversationId: conversation.conversationId,
    role: 'user',
    content: 'Budget is 25.',
  });
  const assistant = await insertTurn(db, {
    projectId: data.projectId,
    conversationId: conversation.conversationId,
    role: 'assistant',
    content: 'Budget is 50.',
  });
  const sources = await resolveProposalGenerationSources(
    db,
    data.projectId,
    [],
    [original.turnHash]
  );
  expect(sources[0].content).toBe('Budget is 25.');
  await expect(
    resolveProposalGenerationSources(db, data.projectId, [], [assistant.turnHash])
  ).rejects.toThrow();
  const other = await fixture('Foreign conversation evidence');
  await expect(
    resolveProposalGenerationSources(db, other.projectId, [], [original.turnHash])
  ).rejects.toThrow();
});
