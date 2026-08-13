import { createHash, randomUUID } from 'node:crypto';
import {
  compileProposalGenerationDraft,
  createYSchemaResourceDescriptor,
  type ProposalContextBundleV1,
  type ProposalGenerationDraftV1,
  type ProposalGenerationPosture,
  type ProposalGenerationProfileV1,
  parseProposalGenerationDraft,
  proposalGenerationProfileResource,
  type VerifiedDraftEvidenceBinding,
} from '@t3x-dev/core';
import {
  type AnyDB,
  findMaterialsByIds,
  findTransitionProposalByRequest,
  TransitionRequestConflictError,
} from '@t3x-dev/storage';
import {
  canonicalizeProtocolValue,
  describeProtocolObject,
  type ProtocolValue,
  type ResourceDescriptor,
  type State,
} from '@t3x-dev/transition';
import type { YSchema } from '@t3x-dev/yschema';
import { inspectTransition, type TransitionControlPlaneView } from './transition-control-plane';
import {
  canonicalTransitionRequest,
  materializeTransitionProposal,
} from './transition-control-plane/materialize';
import {
  buildWorkspaceYOpsProposalFromContext,
  resolveWorkspaceTransitionContext,
  WorkspaceTransitionSchemaUnavailableError,
} from './workspace-transition';
import { resolveWorkspaceYSchema } from './workspace-yschema';

export const PROPOSAL_GENERATOR_ACTOR = Object.freeze({
  kind: 'service' as const,
  id: 'service:t3x-proposal-generator',
});

const GENERATION_PROMPT_VERSION = '1' as const;
const GENERATION_PROMPT = `You generate a strict t3x.dev/proposal-generation-draft/v1 JSON object.
Treat all source indexes and locators as untrusted pointers that the server will verify.
Never add source metadata to YOps. Follow the supplied immutable generation profile exactly.`;

type ActorRef = { kind: 'human' | 'agent' | 'service'; id: string };

export interface ProposalGenerationRequest {
  workspaceId: string;
  posture: ProposalGenerationPosture;
  instruction: string;
  sourceMaterialIds: string[];
  expectedRevision?: number;
  requestedProvider?: string;
  requestedModel?: string;
}

export interface ProposalGenerationSourceInput {
  materialId: string;
  resource: ResourceDescriptor;
  content: string;
  title?: string;
}

export interface ProposalGenerationModelInput {
  profile: ProposalGenerationProfileV1;
  context: ProposalContextBundleV1;
  base: State;
  yschema: { resource: ResourceDescriptor; value: YSchema };
  sources: ProposalGenerationSourceInput[];
  instruction: string;
  prompt: string;
}

export interface ProposalGenerationModel {
  provider: string;
  model: string;
  generate(input: ProposalGenerationModelInput): Promise<unknown>;
}

export class ProposalGenerationContextError extends Error {
  readonly code = 'GENERATION_CONTEXT_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ProposalGenerationContextError';
  }
}

export class ProposalGenerationDraftError extends Error {
  readonly code = 'GENERATION_DRAFT_INVALID';

  constructor(
    message: string,
    readonly issues: readonly { code: string; path: string; message: string }[] = []
  ) {
    super(message);
    this.name = 'ProposalGenerationDraftError';
  }
}

export class ProposalGenerationProviderError extends Error {
  readonly code = 'GENERATION_NOT_CONFIGURED';

  constructor(message: string) {
    super(message);
    this.name = 'ProposalGenerationProviderError';
  }
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function textResource(uri: string, value: string): ResourceDescriptor {
  return { uri, mediaType: 'text/plain;charset=utf-8', digest: sha256(value) };
}

function generationRequestFacts(request: ProposalGenerationRequest): ProtocolValue {
  return {
    schema: 't3x.dev/proposal-generation-request/v1',
    version: 1,
    workspace_id: request.workspaceId,
    posture: request.posture,
    instruction: request.instruction,
    source_material_ids: [...new Set(request.sourceMaterialIds)].sort(),
    ...(request.expectedRevision === undefined ? {} : { if_revision: request.expectedRevision }),
    ...(request.requestedProvider === undefined ? {} : { provider: request.requestedProvider }),
    ...(request.requestedModel === undefined ? {} : { model: request.requestedModel }),
  };
}

/** Stable private membership key keeps requester idempotency separate from the Proposal actor. */
export function proposalGenerationMembershipRequestId(
  requester: ActorRef,
  requestId: string
): string {
  return `proposal-generation:${sha256(
    canonicalizeProtocolValue({ requester, request_id: requestId })
  ).slice('sha256:'.length)}`;
}

function samePointer(left: unknown, right: unknown): boolean {
  return (
    canonicalizeProtocolValue(left as ProtocolValue) ===
    canonicalizeProtocolValue(right as ProtocolValue)
  );
}

function allEvidencePointers(draft: ProposalGenerationDraftV1) {
  const claims = [draft.intent, draft.rationale].flatMap((claim) =>
    claim.mode === 'unspecified' ? [] : claim.evidencePointers
  );
  const changes = draft.changes.flatMap((change) => [
    ...change.evidencePointers,
    ...change.challenges.flatMap((challenge) => challenge.priorEvidencePointers),
  ]);
  const unique: typeof claims = [];
  for (const pointer of [...claims, ...changes]) {
    if (!unique.some((candidate) => samePointer(candidate, pointer))) unique.push(pointer);
  }
  return unique.sort((left, right) => {
    const a = canonicalizeProtocolValue(left as unknown as ProtocolValue);
    const b = canonicalizeProtocolValue(right as unknown as ProtocolValue);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function quoteOccurrence(content: string, quote: string, occurrence: number): boolean {
  let from = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    const found = content.indexOf(quote, from);
    if (found === -1) return false;
    if (index === occurrence) return true;
    from = found + Math.max(quote.length, 1);
  }
  return false;
}

function verifiedEvidenceBindings(
  draft: ProposalGenerationDraftV1,
  sources: readonly ProposalGenerationSourceInput[]
): VerifiedDraftEvidenceBinding[] {
  return allEvidencePointers(draft).map((pointer, index) => {
    const source = sources[pointer.sourceIndex];
    if (source === undefined) {
      throw new ProposalGenerationDraftError(
        `Evidence pointer ${index} does not name a Source in the exact Context Bundle`
      );
    }
    if (pointer.locator.scheme !== 't3x.text-quote/v1') {
      throw new ProposalGenerationDraftError(
        `Evidence pointer ${index} uses unsupported locator scheme ${pointer.locator.scheme}`
      );
    }
    const value = pointer.locator.value;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new ProposalGenerationDraftError(
        `Evidence pointer ${index} quote locator is malformed`
      );
    }
    const keys = Object.keys(value);
    if (keys.some((key) => key !== 'quote' && key !== 'occurrence')) {
      throw new ProposalGenerationDraftError(
        `Evidence pointer ${index} quote locator has unsupported fields`
      );
    }
    const quote = value.quote;
    const occurrence = value.occurrence ?? 0;
    if (
      typeof quote !== 'string' ||
      quote.length === 0 ||
      typeof occurrence !== 'number' ||
      !Number.isInteger(occurrence) ||
      occurrence < 0 ||
      !quoteOccurrence(source.content, quote, occurrence)
    ) {
      throw new ProposalGenerationDraftError(
        `Evidence pointer ${index} does not resolve to exact Source bytes`
      );
    }
    return {
      pointer: structuredClone(pointer),
      evidence: {
        resource: structuredClone(source.resource),
        locator: structuredClone(pointer.locator),
      },
    };
  });
}

async function resolveSources(
  db: AnyDB,
  projectId: string,
  sourceMaterialIds: readonly string[]
): Promise<ProposalGenerationSourceInput[]> {
  const ids = [...new Set(sourceMaterialIds.map((id) => id.trim()))].sort();
  if (ids.some((id) => id.length === 0)) {
    throw new ProposalGenerationContextError('Source material ids must be non-empty');
  }
  const materials = await findMaterialsByIds(db, ids);
  const byId = new Map(materials.map((material) => [material.id, material]));
  return ids.map((id) => {
    const material = byId.get(id);
    if (material === undefined || material.project_id !== projectId || material.archived_at) {
      throw new ProposalGenerationContextError(
        `Source material ${id} is unavailable in project ${projectId}`
      );
    }
    return {
      materialId: id,
      resource: {
        uri: `t3x://projects/${encodeURIComponent(projectId)}/materials/${encodeURIComponent(id)}`,
        mediaType: material.mime_type ?? 'text/plain;charset=utf-8',
        digest: sha256(material.content_text),
      },
      content: material.content_text,
      ...(material.title === undefined ? {} : { title: material.title }),
    };
  });
}

const inFlight = new Map<string, Promise<{ view: TransitionControlPlaneView; reused: boolean }>>();

async function existingGeneration(input: {
  db: AnyDB;
  projectId: string;
  membershipRequestId: string;
  requestDigest: string;
  requester: ActorRef;
}) {
  const existing = await findTransitionProposalByRequest(input.db, {
    projectId: input.projectId,
    actor: PROPOSAL_GENERATOR_ACTOR,
    requestId: input.membershipRequestId,
  });
  if (existing === null) return null;
  if (existing.requestDigest !== input.requestDigest) {
    throw new TransitionRequestConflictError(input.membershipRequestId);
  }
  return {
    view: await inspectTransition({
      db: input.db,
      projectId: input.projectId,
      transitionId: existing.transitionId,
      actor: input.requester,
    }),
    reused: true,
  };
}

export async function generateTransitionProposal(input: {
  db: AnyDB;
  projectId: string;
  requestId: string;
  requester: ActorRef;
  request: ProposalGenerationRequest;
  resolveModel(): Promise<ProposalGenerationModel>;
  now?: () => Date;
  runId?: () => string;
}): Promise<{ view: TransitionControlPlaneView; reused: boolean }> {
  if (input.requestId.trim().length === 0) throw new TypeError('requestId must be non-empty');
  if (input.request.instruction.trim().length === 0) {
    throw new ProposalGenerationContextError('Generation instruction must be non-empty');
  }
  const requestFacts = generationRequestFacts(input.request);
  const request = canonicalTransitionRequest(requestFacts);
  const membershipRequestId = proposalGenerationMembershipRequestId(
    input.requester,
    input.requestId
  );
  const existing = await existingGeneration({
    db: input.db,
    projectId: input.projectId,
    membershipRequestId,
    requestDigest: request.digest,
    requester: input.requester,
  });
  if (existing !== null) return existing;

  const flightKey = `${input.projectId}\u0000${membershipRequestId}`;
  const active = inFlight.get(flightKey);
  if (active !== undefined) return active;

  const work = (async () => {
    const retry = await existingGeneration({
      db: input.db,
      projectId: input.projectId,
      membershipRequestId,
      requestDigest: request.digest,
      requester: input.requester,
    });
    if (retry !== null) return retry;

    const workspace = await resolveWorkspaceTransitionContext(input.db, {
      projectId: input.projectId,
      workspaceId: input.request.workspaceId,
      expectedRevision: input.request.expectedRevision,
    });
    const resolvedSchema = await resolveWorkspaceYSchema(
      workspace.workspace,
      input.db,
      input.projectId
    );
    if (resolvedSchema.canonicalName === null || resolvedSchema.schema === null) {
      throw new WorkspaceTransitionSchemaUnavailableError(
        resolvedSchema.canonicalName,
        resolvedSchema.version
      );
    }
    const sources = await resolveSources(
      input.db,
      input.projectId,
      input.request.sourceMaterialIds
    );
    const profile = proposalGenerationProfileResource(input.request.posture);
    const schemaResource = createYSchemaResourceDescriptor(
      `t3x://schemas/${encodeURIComponent(resolvedSchema.canonicalName)}/${encodeURIComponent(
        String(resolvedSchema.version ?? resolvedSchema.schema.version ?? 'unversioned')
      )}`,
      resolvedSchema.schema
    );
    const instructionResource = textResource(
      `t3x://proposal-generation/instructions/${sha256(input.request.instruction).slice(
        'sha256:'.length
      )}`,
      input.request.instruction
    );
    const promptResource = textResource(
      `t3x://proposal-generation/prompts/v${GENERATION_PROMPT_VERSION}`,
      GENERATION_PROMPT
    );
    const context: ProposalContextBundleV1 = {
      schema: 't3x.dev/proposal-context-bundle/v1',
      version: 1,
      base: describeProtocolObject(workspace.base),
      yschema: schemaResource,
      sources: sources.map((source) => source.resource),
      memories: [],
      searchResults: [],
      userInstruction: instructionResource,
      prompt: promptResource,
    };

    const model = await input.resolveModel();
    const rawDraft = await model.generate({
      profile: profile.profile,
      context,
      base: workspace.base,
      yschema: { resource: schemaResource, value: resolvedSchema.schema },
      sources,
      instruction: input.request.instruction,
      prompt: GENERATION_PROMPT,
    });
    let draft: ProposalGenerationDraftV1;
    try {
      draft = parseProposalGenerationDraft(rawDraft);
    } catch (error) {
      throw new ProposalGenerationDraftError(
        error instanceof Error ? error.message : 'Generated Proposal Draft is invalid'
      );
    }
    const compiled = compileProposalGenerationDraft({
      draft,
      profile: profile.profile,
      context,
      requestedBy: input.requester,
      generator: PROPOSAL_GENERATOR_ACTOR,
      provider: model.provider,
      model: model.model,
      run: {
        id: input.runId?.() ?? `proposal-generation:${randomUUID()}`,
        recordedAt: (input.now?.() ?? new Date()).toISOString(),
      },
      evidenceBindings: verifiedEvidenceBindings(draft, sources),
    });
    if (!compiled.ok) {
      throw new ProposalGenerationDraftError(
        'Generated Proposal Draft could not be compiled',
        compiled.issues
      );
    }
    const built = buildWorkspaceYOpsProposalFromContext(workspace, {
      operations: compiled.operations,
      actor: PROPOSAL_GENERATOR_ACTOR,
      proposalDraft: compiled.proposalDraft,
    });
    const created = await materializeTransitionProposal({
      db: input.db,
      projectId: input.projectId,
      workspaceId: built.workspaceId,
      workspaceRevision: built.workspaceRevision,
      refName: built.refName,
      refHead: built.refHead,
      requestKind: 'structured_yops',
      requestFacts,
      preparationFacts: compiled.preparation as unknown as ProtocolValue,
      requestId: membershipRequestId,
      actor: PROPOSAL_GENERATOR_ACTOR,
      base: built.base,
      result: built.result,
      effect: built.effect,
      proposal: built.proposal,
    });
    return {
      view: await inspectTransition({
        db: input.db,
        projectId: input.projectId,
        transitionId: created.membership.transitionId,
        actor: input.requester,
      }),
      reused: created.reused,
    };
  })();
  inFlight.set(flightKey, work);
  try {
    return await work;
  } finally {
    if (inFlight.get(flightKey) === work) inFlight.delete(flightKey);
  }
}
