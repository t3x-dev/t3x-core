import { parseAcceptancePolicy, parseProposalGenerationPreparation } from '@t3x-dev/core';
import {
  type AnyDB,
  bindTransitionPolicy,
  createMaterial,
  ensureMainBranch,
  insertProject,
  resolveTransitionProposalGraph,
  TransitionRequestConflictError,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  generateTransitionProposal,
  PROPOSAL_GENERATOR_ACTOR,
  ProposalGenerationContextError,
  ProposalGenerationDraftError,
  type ProposalGenerationModel,
} from '../lib/proposal-generation';
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

function model(generate = vi.fn(async () => draft())): ProposalGenerationModel {
  return { provider: 'test', model: 'test-model', generate };
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
      return draft();
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
      now: () => new Date('2026-08-13T01:00:00.000Z'),
      runId: () => 'run:generation-identity',
    };

    const first = generateTransitionProposal(common);
    const concurrent = generateTransitionProposal(common);
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    release();
    const [left, right] = await Promise.all([first, concurrent]);

    expect(left.view.transitionId).toBe(right.view.transitionId);
    expect(generate).toHaveBeenCalledTimes(1);
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

  it('rejects forged quote pointers without persisting a Proposal', async () => {
    const data = await fixture('Forged evidence');
    const generate = vi.fn(async () => draft('a claim absent from the source'));

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
      })
    ).rejects.toBeInstanceOf(TransitionRequestConflictError);
    expect(resolveModel).not.toHaveBeenCalled();
  });
});
