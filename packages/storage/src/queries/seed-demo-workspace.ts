import {
  authorizeDecisionForRepository,
  buildReplayVerificationStatement,
  type CommitV2,
  compileProposalDraft,
  createAcceptancePolicyResource,
  createCommitV2,
  createYOpsReplacementEffect,
  createYOpsState,
  DEMO_WORKSPACE_FIXTURE,
  describeTransitionObject,
  emptyProposalReview,
  InMemoryTransitionObjectResolver,
  type Leaf,
  type ProtocolObject,
  parseAcceptancePolicy,
  type SourcedYOp,
  type StatementObservation,
  sha256,
} from '@t3x-dev/core';
import type { AnyDB } from '../adapters';
import type { Conversation, Project, Turn } from '../schema';
import { ensureMainBranch } from './branches';
import { insertConversation } from './conversations';
import { getGlobalSetting, setGlobalSetting } from './global-settings';
import { createLeaf, updateLeafAtomic } from './leaves';
import { findProjectByIdIncludingDeleted, insertProject } from './projects';
import {
  createTransitionCommit,
  recordRepositoryDecisionAuthorization,
} from './transition-commits';
import { insertTurn } from './turns';
import { insertYOpsLogEntry } from './yops-log';

const DEMO_REPLAY_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-demo-fixture-replay',
});
const DEMO_DECIDER = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-demo-fixture-seed',
});
const DEMO_REPLAY_TOOL = Object.freeze({ name: '@t3x-dev/core/yops-replay', version: '1' });
const DEMO_ENVIRONMENT = Object.freeze({ mode: 'unspecified' as const });
const DEMO_POLICY = createAcceptancePolicyResource({
  uri: 't3x://policies/demo-fixture-seed/v1',
  policy: parseAcceptancePolicy({
    schema: 't3x.dev/acceptance-policy/v1',
    version: 1,
    authorization: {
      decide: { actors: { mode: 'one_of', values: [DEMO_DECIDER] } },
      override: { actors: { mode: 'one_of', values: [DEMO_DECIDER] } },
      allowSelfApproval: true,
    },
    claims: {
      intent: {
        allowedModes: ['authored'],
        minimumEvidence: 0,
        humanConfirmation: 'not_required',
      },
      rationale: {
        allowedModes: ['inferred'],
        minimumEvidence: 1,
        humanConfirmation: 'not_required',
      },
    },
    checks: {
      replay: {
        issuers: { mode: 'one_of', values: [DEMO_REPLAY_ACTOR] },
        tools: { mode: 'one_of', values: [DEMO_REPLAY_TOOL] },
        environments: { mode: 'one_of', values: [DEMO_ENVIRONMENT] },
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
      allowMissingValidation: true,
    },
  }),
});

export interface DemoWorkspaceSeedMarker {
  fixture_id: string;
  fixture_version: number;
  owner_id: string | null;
  project_id: string;
  status: 'active' | 'deleted';
  seeded_at: string;
  deleted_at?: string;
}

export interface SeedDemoWorkspaceOptions {
  ownerId?: string | null;
  resetDeleted?: boolean;
}

export interface SeedDemoWorkspaceResult {
  status: 'created' | 'exists' | 'skipped_deleted';
  project: Project | null;
  conversation?: Conversation;
  turn?: Turn;
  commit?: { digest: string; object: CommitV2; recordedAt: string };
  leaf?: Leaf;
}

export function getDemoWorkspaceSeedKey(ownerId: string | null | undefined): string {
  return ownerId ? `demo_workspace_seed:user:${ownerId}` : 'demo_workspace_seed:auth_disabled';
}

export async function seedDemoWorkspace(
  db: AnyDB,
  options: SeedDemoWorkspaceOptions = {}
): Promise<SeedDemoWorkspaceResult> {
  const ownerId = options.ownerId ?? null;
  const settingKey = getDemoWorkspaceSeedKey(ownerId);
  const existingMarker = await getGlobalSetting<DemoWorkspaceSeedMarker>(db, settingKey);

  if (existingMarker) {
    const existingProject = await findProjectByIdIncludingDeleted(db, existingMarker.project_id);
    if (existingMarker.status === 'active' && existingProject && !existingProject.deletedAt) {
      return { status: 'exists', project: existingProject };
    }

    if (options.resetDeleted) {
      const created = await createDemoWorkspaceRows(db, ownerId);
      await setGlobalSetting(db, settingKey, {
        fixture_id: DEMO_WORKSPACE_FIXTURE.id,
        fixture_version: DEMO_WORKSPACE_FIXTURE.project.metadata.demo_fixture_version,
        owner_id: ownerId,
        project_id: created.project.projectId,
        status: 'active',
        seeded_at: getMetadataString(created.project.metadataJson, 'demo_seeded_at'),
      } satisfies DemoWorkspaceSeedMarker);

      return { status: 'created', ...created };
    }

    const deletedMarker: DemoWorkspaceSeedMarker = {
      ...existingMarker,
      status: 'deleted',
      deleted_at: existingMarker.deleted_at ?? new Date().toISOString(),
    };
    await setGlobalSetting(db, settingKey, deletedMarker);
    return { status: 'skipped_deleted', project: null };
  }

  const created = await createDemoWorkspaceRows(db, ownerId);
  await setGlobalSetting(db, settingKey, {
    fixture_id: DEMO_WORKSPACE_FIXTURE.id,
    fixture_version: DEMO_WORKSPACE_FIXTURE.project.metadata.demo_fixture_version,
    owner_id: ownerId,
    project_id: created.project.projectId,
    status: 'active',
    seeded_at: getMetadataString(created.project.metadataJson, 'demo_seeded_at'),
  } satisfies DemoWorkspaceSeedMarker);

  return { status: 'created', ...created };
}

async function createDemoWorkspaceRows(
  db: AnyDB,
  ownerId: string | null
): Promise<{
  project: Project;
  conversation: Conversation;
  turn: Turn;
  commit: { digest: string; object: CommitV2; recordedAt: string };
  leaf: Leaf;
}> {
  const seededAt = new Date().toISOString();
  const metadata = {
    ...DEMO_WORKSPACE_FIXTURE.project.metadata,
    demo_seeded_at: seededAt,
  };

  const project = await insertProject(db, {
    name: DEMO_WORKSPACE_FIXTURE.project.name,
    metadata,
    ownerId: ownerId ?? undefined,
  });
  await ensureMainBranch(db, project.projectId);

  const conversation = await insertConversation(db, {
    projectId: project.projectId,
    title: DEMO_WORKSPACE_FIXTURE.source.title,
    metadata: {
      is_demo: true,
      demo_fixture_id: DEMO_WORKSPACE_FIXTURE.id,
      replay_label: DEMO_WORKSPACE_FIXTURE.replay.label,
    },
  });

  const turn = await insertTurn(db, {
    projectId: project.projectId,
    conversationId: conversation.conversationId,
    role: 'user',
    content: DEMO_WORKSPACE_FIXTURE.source.text,
  });

  const yopsLogEntry = await insertYOpsLogEntry(db, {
    conversationId: conversation.conversationId,
    projectId: project.projectId,
    source: 'manual',
    turnHash: turn.turnHash,
    yops: DEMO_WORKSPACE_FIXTURE.replay.yops.map((op) => ({
      ...op,
      source: {
        type: 'human',
        author: 'T3X fixture replay',
        at: seededAt,
        surface: 'script',
      },
    })) satisfies SourcedYOp[],
    version: 1,
    pipelineState: 'completed',
    metadata: {
      fixture_id: DEMO_WORKSPACE_FIXTURE.id,
      replay_label: DEMO_WORKSPACE_FIXTURE.replay.label,
      no_llm_call: true,
    },
  });

  const commit = await commitDemoWorkspaceTransition(db, {
    projectId: project.projectId,
    conversationId: conversation.conversationId,
    turn,
    yopsLogId: yopsLogEntry.id,
    recordedAt: seededAt,
  });

  const createdLeaf = await createLeaf(db, {
    commit_hash: commit.digest,
    type: DEMO_WORKSPACE_FIXTURE.leaf.type,
    title: DEMO_WORKSPACE_FIXTURE.leaf.title,
    constraints: DEMO_WORKSPACE_FIXTURE.leaf.constraints,
    config: DEMO_WORKSPACE_FIXTURE.leaf.config,
    project_id: project.projectId,
    created_by: 'fixture-replay',
  });
  const leaf =
    (await updateLeafAtomic(db, createdLeaf.id, {
      output: DEMO_WORKSPACE_FIXTURE.leaf.output,
      assertions: DEMO_WORKSPACE_FIXTURE.leaf.assertions,
    })) ?? createdLeaf;

  return { project, conversation, turn, commit, leaf };
}

async function commitDemoWorkspaceTransition(
  db: AnyDB,
  input: {
    projectId: string;
    conversationId: string;
    turn: Turn;
    yopsLogId: string;
    recordedAt: string;
  }
): Promise<{ digest: string; object: CommitV2; recordedAt: string }> {
  const base = createYOpsState({});
  const target = createYOpsState({
    domain: 't3x.dev/semantic-content',
    version: 1,
    content: {
      trees: DEMO_WORKSPACE_FIXTURE.replay.trees,
      relations: DEMO_WORKSPACE_FIXTURE.replay.relations,
    },
  } as unknown as Parameters<typeof createYOpsState>[0]);
  const { effect, result } = createYOpsReplacementEffect({
    base,
    target,
    expectedBase: describeTransitionObject(base),
  });
  const sourceEvidence = {
    resource: {
      uri: `t3x://projects/${input.projectId}/conversations/${input.conversationId}/turns/${input.turn.turnHash}`,
      mediaType: 'text/plain;charset=utf-8',
      digest: `sha256:${sha256(input.turn.content)}` as `sha256:${string}`,
    },
    locator: {
      scheme: 't3x.text-quote/v1',
      value: { quote: input.turn.content },
    },
  };
  const compiled = compileProposalDraft({
    draft: {
      schema: 't3x/proposal-draft',
      version: 1,
      intent: {
        mode: 'authored',
        value: DEMO_WORKSPACE_FIXTURE.commit.message,
        evidence: [],
      },
      rationale: {
        mode: 'inferred',
        value: 'Replay the bundled source fixture into deterministic structured state.',
        evidence: [sourceEvidence],
      },
      review: emptyProposalReview(),
    },
    effect,
    actor: DEMO_DECIDER,
  });
  if (!compiled.ok) {
    throw new TypeError(`Demo fixture Proposal failed: ${JSON.stringify(compiled.issues)}`);
  }
  const replay = buildReplayVerificationStatement({
    effect,
    actor: DEMO_REPLAY_ACTOR,
    predicate: {
      outcome: 'verified',
      result: effect.result,
      tool: DEMO_REPLAY_TOOL,
      run: {
        id: `demo:${DEMO_WORKSPACE_FIXTURE.id}:replay`,
        recordedAt: input.recordedAt as Parameters<
          typeof authorizeDecisionForRepository
        >[0]['decidedAt'],
      },
      environment: DEMO_ENVIRONMENT,
    },
  });
  const observations: StatementObservation[] = [
    { statement: replay, issuerContext: { actor: DEMO_REPLAY_ACTOR } },
  ];
  const issued = await authorizeDecisionForRepository({
    projectId: input.projectId,
    refName: 'main',
    proposal: compiled.proposal,
    effect,
    outcome: 'accepted',
    rationale: { mode: 'unspecified' },
    decidedAt: input.recordedAt as Parameters<
      typeof authorizeDecisionForRepository
    >[0]['decidedAt'],
    authority: {
      async resolve() {
        return {
          actorContext: { actor: DEMO_DECIDER },
          observationScope: {
            completeness: 'complete' as const,
            sources: ['server:demo-fixture-seed'],
          },
          policy: DEMO_POLICY.policy,
          policyResource: DEMO_POLICY.resource,
          statements: observations,
        };
      },
    },
  });
  if (!issued.ok || issued.authorization === null) {
    throw new TypeError(
      `Demo fixture Decision failed: ${JSON.stringify(issued.ok ? [] : issued.failures)}`
    );
  }
  await recordRepositoryDecisionAuthorization(db, issued.authorization);
  const objects: ProtocolObject[] = [base, result, ...issued.authorization.objects];
  const object = await createCommitV2({
    parents: [],
    decision: issued.decision,
    resolver: new InMemoryTransitionObjectResolver(objects),
  });
  const created = await createTransitionCommit(db, {
    projectId: input.projectId,
    refName: 'main',
    expectedHead: null,
    commit: object,
    objects,
    yopsLogIds: [input.yopsLogId],
  });
  return { digest: created.digest, object, recordedAt: input.recordedAt };
}

function getMetadataString(metadataJson: string | null, key: string): string {
  if (!metadataJson) return new Date().toISOString();
  const metadata = JSON.parse(metadataJson) as Record<string, unknown>;
  const value = metadata[key];
  return typeof value === 'string' ? value : new Date().toISOString();
}
