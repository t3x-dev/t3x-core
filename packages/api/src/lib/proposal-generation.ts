import { createHash } from 'node:crypto';
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
  findConversationById,
  findMaterialsByIds,
  findTransitionProposalByRequest,
  findTurnByHash,
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
import {
  executeMeteredInference,
  type InferenceFinishStatus,
  type InferenceProviderCost,
  type InferenceRuntime,
  type InferenceScope,
  type InferenceUsage,
} from './inference';
import { inspectTransition, type TransitionControlPlaneView } from './transition-control-plane';
import {
  canonicalTransitionRequest,
  materializeTransitionProposal,
} from './transition-control-plane/materialize';
import { authoringModelContext, buildWorkspaceGeneration } from './workspace-authoring-generation';
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
Never add source metadata to YOps. Follow the supplied immutable generation profile exactly.
Return JSON only with this exact top-level shape:
{
  "schema": "t3x.dev/proposal-generation-draft/v1",
  "version": 1,
  "posture": "source_only | guided | recommend",
  "intent": { "mode": "unspecified" } or { "mode": "stated | inferred | authored", "value": "...", "evidencePointers": [] },
  "rationale": { "mode": "unspecified" } or { "mode": "stated | inferred | authored", "value": "...", "evidencePointers": [] },
  "changes": [{
    "id": "stable-group-id",
    "operations": [{ "set": { "path": "node/slot", "value": "..." } }] or [{ "append": { "path": "items", "value": "..." } }],
    "claimedOrigin": "source_backed | inferred | recommended",
    "evidencePointers": [{ "sourceIndex": 0, "locator": { "scheme": "t3x.text-quote/v1", "value": { "quote": "exact source bytes", "occurrence": 0 } } }],
    "basisPointers": [{ "kind": "source", "index": 0 }],
    "assumptions": [],
    "reason": "...",
    "challenges": []
  }],
  "warnings": []
}
When intent.mode or rationale.mode is "stated", its evidencePointers array MUST contain at least one
valid pointer to the exact supporting source bytes. If no such pointer exists, use "inferred",
"authored", or "unspecified" instead.
For the "guided" posture, use "inferred", "authored", or "unspecified" for intent and rationale,
and return an empty challenges array for every change. Guided inference may explain assumptions and
risks, but it must not challenge or replace an explicit source claim. Reserve challenges for the
"recommend" posture.
Preserve the user's explicit numbered or bulleted requirement granularity: create one change group
per independently stated requirement and do not merge distinct items merely because they are related.
Use multiple operations in one group only when one requirement needs an atomic multi-field change.
Judge granularity from the materialized result, not only from changes[]. A standalone requirement item
must become its own schema-valid collection member or tree node in the resulting state. Distinct
requirement items must not converge into one summary field, one existing requirement, one acceptance
array, or another shared aggregate merely because each operation is placed in a separate change group.
Only edit a summary or an existing requirement when the user explicitly asks to edit that field or
record. When the source lists new requirements, create one sibling requirement record per source item
and keep the complete fields for that record in the same atomic change group.
Every change group MUST change authoring.current. When an instruction says to change an existing value
from X to Y, update only a field whose current value actually contains X. Never substitute a different
field, repeat its current value, or emit a no-op merely to satisfy the requested group count.
Every operation path must address the exact field in the supplied current state and YSchema. For tree
state, a root node's slots are on that root node; never place a root field on its first child. Do not
invent fields on a node when the supplied YSchema does not define them.
When authoring.current is a t3x.dev/semantic-content document, operate on that complete envelope:
- paths into the semantic tree MUST start with "content/trees/"; never create a shadow top-level
  "trees" or "relations" field beside "content";
- address sequence items with bracket segments such as "[0]" and stable matches such as
  "[key=requirements]"; a bare numeric segment such as "/0/" is a mapping key, not an array index;
- edit an existing requirement with a stable key-match path;
- add each new requirement with one append operation targeting the requirements node's "children"
  array, and append a complete node containing a unique key, slots, and children: [];
- the exact new-node operation shape is
  { "append": { "path": "content/trees/[key=prd]/children/[key=requirements]/children",
    "value": { "key": "unique_key", "slots": { "title": "..." }, "children": [] } } };
  "append" is the operation name beside "set", never a wrapper inside set.value;
- never set a slot through a nonexistent numeric child path.
Use only canonical YOps operation objects in changes[].operations. Do not return yops, slotProvenance, gaps, or any legacy extraction shape.`;

type ActorRef = { kind: 'human' | 'agent' | 'service'; id: string };

export interface ProposalGenerationRequest {
  workspaceId: string;
  posture: ProposalGenerationPosture;
  instruction: string;
  sourceMaterialIds: string[];
  sourceTurnHashes?: string[];
  expectedRevision?: number;
  requestedProvider?: string;
  requestedModel?: string;
}

export interface ProposalGenerationSourceInput {
  materialId?: string;
  turnHash?: string;
  resource: ResourceDescriptor;
  content: string;
  title?: string;
}

export interface ProposalGenerationModelInput {
  authoring?: ReturnType<typeof authoringModelContext>;
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
  generate(input: ProposalGenerationModelInput): Promise<ProposalGenerationModelResult>;
}

export interface ProposalGenerationModelResult {
  draft: unknown;
  usage: InferenceUsage;
  finishStatus?: InferenceFinishStatus;
  providerRequestId?: string;
  providerReportedCost?: InferenceProviderCost;
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
    ...(request.sourceTurnHashes?.length
      ? { source_turn_hashes: [...new Set(request.sourceTurnHashes)].sort() }
      : {}),
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

export async function resolveProposalGenerationSources(
  db: AnyDB,
  projectId: string,
  sourceMaterialIds: readonly string[],
  sourceTurnHashes: readonly string[] = []
): Promise<ProposalGenerationSourceInput[]> {
  const ids = [...new Set(sourceMaterialIds.map((id) => id.trim()))].sort();
  if (ids.some((id) => id.length === 0)) {
    throw new ProposalGenerationContextError('Source material ids must be non-empty');
  }
  const materials = await findMaterialsByIds(db, ids);
  const byId = new Map(materials.map((material) => [material.id, material]));
  const documents: ProposalGenerationSourceInput[] = ids.map((id) => {
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
  const hashes = [...new Set(sourceTurnHashes)].sort();
  const turns = await Promise.all(hashes.map((hash) => findTurnByHash(db, hash)));
  for (const hash of hashes) {
    const turn = turns.find((turn) => turn?.turnHash === hash);
    const conversation = turn ? await findConversationById(db, turn.conversationId) : null;
    if (
      !turn ||
      turn.projectId !== projectId ||
      turn.role !== 'user' ||
      conversation?.projectId !== projectId
    )
      throw new ProposalGenerationContextError(
        'Only original user turns in authorized project conversations can be Sources'
      );
    documents.push({
      turnHash: hash,
      resource: {
        uri: `t3x://projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(turn.conversationId)}/turns/${encodeURIComponent(hash)}`,
        mediaType: 'text/plain;charset=utf-8',
        digest: sha256(turn.content),
      },
      content: turn.content,
      title: 'Original source user turn',
    });
  }
  return documents;
}

const inFlightByDatabase = new WeakMap<
  object,
  Map<
    string,
    { digest: string; promise: Promise<{ view: TransitionControlPlaneView; reused: boolean }> }
  >
>();

function generationFlights(
  db: AnyDB
): Map<
  string,
  { digest: string; promise: Promise<{ view: TransitionControlPlaneView; reused: boolean }> }
> {
  const key = db as unknown as object;
  const existing = inFlightByDatabase.get(key);
  if (existing !== undefined) return existing;
  const created = new Map<
    string,
    { digest: string; promise: Promise<{ view: TransitionControlPlaneView; reused: boolean }> }
  >();
  inFlightByDatabase.set(key, created);
  return created;
}

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
  inference: {
    runtime: InferenceRuntime;
    runId: string;
    scope: InferenceScope;
  };
  now?: () => Date;
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

  const inFlight = generationFlights(input.db);
  const flightKey = `${input.projectId}\u0000${membershipRequestId}`;
  const active = inFlight.get(flightKey);
  if (active !== undefined) {
    if (active.digest !== request.digest)
      throw new TransitionRequestConflictError(membershipRequestId);
    return active.promise;
  }

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
    const yschema = resolvedSchema.schema;
    const sources = await resolveProposalGenerationSources(
      input.db,
      input.projectId,
      input.request.sourceMaterialIds,
      input.request.sourceTurnHashes
    );
    const profile = proposalGenerationProfileResource(input.request.posture);
    const schemaResource = createYSchemaResourceDescriptor(
      `t3x://schemas/${encodeURIComponent(resolvedSchema.canonicalName)}/${encodeURIComponent(
        String(resolvedSchema.version ?? yschema.version ?? 'unversioned')
      )}`,
      yschema
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
    const authoring = workspace.workspace.authoringLedger
      ? authoringModelContext(workspace.workspace)
      : undefined;
    const context: ProposalContextBundleV1 = {
      schema: 't3x.dev/proposal-context-bundle/v1',
      version: 1,
      base: describeProtocolObject(workspace.base),
      yschema: schemaResource,
      sources: sources.map((source) => source.resource),
      memories: authoring ? [authoring.manifest] : [],
      searchResults: [],
      userInstruction: instructionResource,
      prompt: promptResource,
    };

    // Fixed generation cannot retrieve missing state during a tool loop. Fail visibly rather than silently truncate.
    if (
      JSON.stringify({
        base: workspace.base,
        authoring,
        yschema,
        sources,
        instruction: input.request.instruction,
      }).length > 256_000
    )
      throw new ProposalGenerationContextError(
        'Proposal context exceeds the generation budget; select smaller source excerpts or a smaller Workspace'
      );
    const model = await input.resolveModel();
    const execution = await executeMeteredInference({
      runtime: input.inference.runtime,
      input: {
        runId: input.inference.runId,
        feature: 'transition.proposal-generation',
        requestedModel: input.request.requestedModel ?? model.model,
        scope: input.inference.scope,
      },
      resolvedProvider: model.provider,
      resolvedModel: model.model,
      now: input.now,
      invoke: async () => {
        const result = await model.generate({
          profile: profile.profile,
          context,
          base: workspace.base,
          ...(authoring ? { authoring } : {}),
          yschema: { resource: schemaResource, value: yschema },
          sources,
          instruction: input.request.instruction,
          prompt: GENERATION_PROMPT,
        });
        return {
          value: result.draft,
          usage: result.usage,
          ...(result.finishStatus ? { finishStatus: result.finishStatus } : {}),
          ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {}),
          ...(result.providerReportedCost
            ? { providerReportedCost: result.providerReportedCost }
            : {}),
        };
      },
    });
    const rawDraft = execution.value;
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
        id: execution.attempt.generationId,
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
    const composed = authoring
      ? buildWorkspaceGeneration({
          workspace: workspace.workspace,
          workspaceRevision: workspace.workspaceRevision,
          actionId: membershipRequestId,
          operations: compiled.operations,
          generation: compiled.preparation,
          proposalDraft: compiled.proposalDraft,
        })
      : null;
    const built = composed
      ? {
          ...workspace,
          refName: workspace.targetBranch,
          refHead: workspace.head.head,
          actor: PROPOSAL_GENERATOR_ACTOR,
          ...composed,
        }
      : buildWorkspaceYOpsProposalFromContext(workspace, {
          operations: compiled.operations,
          actor: PROPOSAL_GENERATOR_ACTOR,
          proposalDraft: compiled.proposalDraft,
        });
    let created: Awaited<ReturnType<typeof materializeTransitionProposal>>;
    try {
      created = await materializeTransitionProposal({
        db: input.db,
        projectId: input.projectId,
        workspaceId: built.workspaceId,
        workspaceRevision: built.workspaceRevision,
        refName: built.refName,
        refHead: built.refHead,
        requestKind: 'structured_yops',
        requestFacts,
        preparationFacts: (composed?.preparation ??
          compiled.preparation) as unknown as ProtocolValue,
        requestId: membershipRequestId,
        actor: PROPOSAL_GENERATOR_ACTOR,
        base: built.base,
        result: built.result,
        effect: built.effect,
        proposal: built.proposal,
      });
    } catch (error) {
      if (error instanceof TransitionRequestConflictError) {
        const winner = await existingGeneration({
          db: input.db,
          projectId: input.projectId,
          membershipRequestId,
          requestDigest: request.digest,
          requester: input.requester,
        });
        if (winner !== null) return winner;
      }
      throw error;
    }
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
  const flight = { digest: request.digest, promise: work };
  inFlight.set(flightKey, flight);
  try {
    return await work;
  } finally {
    if (inFlight.get(flightKey) === flight) inFlight.delete(flightKey);
  }
}
