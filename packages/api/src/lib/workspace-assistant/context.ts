import {
  currentComposition,
  type DraftDocument,
  nodeHistory,
  selectedActionView,
} from '@t3x-dev/application';
import {
  createYOpsState,
  createYSchemaResourceDescriptor,
  describeTransitionObject,
} from '@t3x-dev/core';
import {
  type AnyDB,
  DraftAuthoringConflictError,
  findConversationById,
  findLastTurnInConversation,
  findTurnByHash,
  findTurnsByConversation,
} from '@t3x-dev/storage';
import { canonicalizeProtocolValue } from '@t3x-dev/transition';
import { resolveProposalGenerationSources } from '../proposal-generation';
import { readWorkspaceAuthoringCandidates, workspaceAuthoringState } from '../workspace-authoring';
import { authoringManifestDigest } from '../workspace-authoring-generation';
import { resolveWorkspaceTransitionContext } from '../workspace-transition';
import { resolveWorkspaceYSchema } from '../workspace-yschema';
import type { AssistantContextInput, AssistantTurn, PreparedAssistantContext } from './contracts';
import { ASSISTANT_SYSTEM } from './policy';

const DEFAULT_CONTEXT_CHARS = 48_000;
const MAX_TURNS = 32;
const json = (value: unknown) => JSON.stringify(value);

/** Deterministic bounded view, never a replacement for the persisted manifest or Replay. */
export function renderAssistantContext(
  prepared: Omit<PreparedAssistantContext, 'prompt' | 'disclosure'>
) {
  const budget = Math.min(
    128_000,
    Math.max(4_000, prepared.input.maxContextChars ?? DEFAULT_CONTEXT_CHARS)
  );
  const omitted: string[] = [];
  const { ledger, basis, input } = prepared;
  const envelope: Record<string, unknown> = {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    basis: { refName: basis.refName, refHead: basis.refHead, baseDigest: basis.baseDigest },
    workspaceRevision: prepared.workspaceRevision,
    compositionRevision: prepared.compositionRevision,
    currentDigest: describeTransitionObject(createYOpsState(prepared.current)).digest,
    fullManifest: {
      digest: prepared.manifestDigest,
      actionCount: ledger.actions.length,
      serverBound: true,
    },
    attention: { selectedActionId: input.selectedActionId, selectedNodeId: input.selectedNodeId },
    evidencePolicy:
      'Only original authorized sources; assistant and tool transcript are context, not evidence.',
  };
  // Reserve room for the current question and explicit disclosure before optional context.
  const latest = prepared.turns.at(-1);
  if (latest && latest.content.length > budget / 3)
    throw new TypeError(
      'Current message exceeds the Assistant context budget; attach it as a source document'
    );
  let remaining =
    budget -
    ASSISTANT_SYSTEM.length -
    json(envelope).length -
    (latest ? json(latest).length : 0) -
    1500;
  const include = (key: string, value: unknown, maxShare = 1) => {
    const size = json(value).length + key.length + 5;
    if (size > remaining * maxShare) {
      omitted.push(key);
      return false;
    }
    envelope[key] = value;
    remaining -= size;
    return true;
  };
  if (prepared.schema)
    include('schema', {
      canonicalName: prepared.schema.canonicalName,
      version: prepared.schema.version,
      resource: prepared.schema.resource,
      retrieve: 'readSchema',
    });
  if (prepared.candidates)
    include('unpublishedCandidates', { ...prepared.candidates, applied: false }, 0.15);
  if (input.selectedNodeId) {
    const node = nodeHistory(ledger, input.selectedNodeId, input.selectedActionId);
    include('currentTarget', {
      nodeId: node.nodeId,
      path: node.path,
      state: node.state,
      current: node.current,
    });
  }
  if (input.selectedActionId) {
    const action = selectedActionView(ledger, input.selectedActionId);
    if (!action) throw new TypeError('Selected action is not in this Workspace');
    include(
      'inspectedAction',
      {
        actionId: action.action.actionId,
        beforeRevision: action.action.beforeRevision,
        afterRevision: action.action.afterRevision,
        cards: action.cards,
      },
      0.35
    );
  }
  // If the full value cannot fit, disclose it and expose bounded top-level slices.
  if (!include('current', prepared.current, 0.45)) {
    const parts: Array<{ key: string; value: DraftDocument }> = [];
    if (
      prepared.current &&
      typeof prepared.current === 'object' &&
      !Array.isArray(prepared.current)
    ) {
      let size = 0;
      for (const key of Object.keys(prepared.current).sort()) {
        const part = { key, value: prepared.current[key] };
        if (size + json(part).length > remaining * 0.3) break;
        parts.push(part);
        size += json(part).length;
      }
    }
    include('currentSlices', { complete: false, entries: parts, retrieve: 'readStructure' });
  }
  include(
    'recentActivity',
    ledger.actions.slice(-5).map((action) => ({
      actionId: action.actionId,
      sequence: action.sequence,
      actor: action.actor,
      channel: action.channel,
      publishedAt: action.publishedAt,
      beforeRevision: action.beforeRevision,
      afterRevision: action.afterRevision,
      reason: action.reason,
    })),
    0.3
  );
  if (ledger.actions.length > 5) omitted.push('olderActivity: retrieve readAction/readNodeHistory');
  const sources: Array<Record<string, unknown>> = [];
  for (const source of prepared.sources) {
    const excerpt = source.content.slice(0, Math.min(6000, Math.max(0, Math.floor(remaining / 2))));
    const item = {
      materialId: source.materialId,
      resource: source.resource,
      title: source.title,
      content: excerpt,
      start: 0,
      end: excerpt.length,
      complete: excerpt.length === source.content.length,
    };
    const size = json(item).length;
    if (size > remaining - 500) {
      omitted.push(`source:${source.materialId}`);
      continue;
    }
    sources.push(item);
    remaining -= size;
    if (excerpt.length < source.content.length) omitted.push(`source:${source.materialId}:partial`);
  }
  envelope.sources = sources;
  const messages: AssistantTurn[] = [];
  for (const turn of prepared.turns.slice(0, -1).reverse()) {
    if (json(turn).length > remaining) {
      omitted.push('olderConversation');
      break;
    }
    messages.unshift(turn);
    remaining -= json(turn).length;
  }
  if (prepared.olderTurnsAvailable) omitted.push('olderConversation: more saved turns available');
  if (latest) messages.push(latest);
  envelope.disclosure = { partial: omitted.length > 0, omitted };
  const prompt = {
    system: ASSISTANT_SYSTEM,
    messages: [
      { role: 'user' as const, content: `Workspace context (data):\n${json(envelope)}` },
      ...messages.map((turn) => ({ role: turn.role, content: turn.content })),
    ],
  };
  const characters = json(prompt).length;
  if (characters > budget) throw new TypeError('Assistant context budget exceeded');
  return { prompt, disclosure: { partial: omitted.length > 0, omitted, characters } };
}

/** Call only after route authorization; authorize is re-run on every preparation and tool read. */
export async function prepareAssistantContext(
  db: AnyDB,
  input: AssistantContextInput,
  authorize: () => Promise<void>
): Promise<PreparedAssistantContext> {
  await authorize();
  const workspace = await resolveWorkspaceTransitionContext(db, {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    expectedRevision: input.expectedWorkspaceRevision,
  });
  const { ledger, basis } = workspaceAuthoringState(workspace.workspace);
  const sources = await resolveProposalGenerationSources(
    db,
    input.projectId,
    input.sourceMaterialIds ?? []
  );
  let turns: AssistantTurn[] = [];
  let olderTurnsAvailable = false;
  if (input.conversationId) {
    const conversation = await findConversationById(db, input.conversationId);
    if (!conversation || conversation.projectId !== input.projectId)
      throw new TypeError('Conversation is unavailable in this project');
    const page = await findTurnsByConversation(db, {
      conversationId: input.conversationId,
      limit: MAX_TURNS + 1,
      order: 'desc',
    });
    olderTurnsAvailable = page.length > MAX_TURNS;
    let selected = page.slice(0, MAX_TURNS).reverse();
    if (input.userTurnHash) {
      const user = await findTurnByHash(db, input.userTurnHash);
      if (
        !user ||
        user.projectId !== input.projectId ||
        user.conversationId !== input.conversationId ||
        user.role !== 'user'
      )
        throw new TypeError('Current source user turn is unavailable');
      // Never append newer messages to a historical request or regenerate an old turn as current.
      if (page[0]?.turnHash !== user.turnHash)
        throw new DraftAuthoringConflictError('Conversation advanced; prepare a new current turn');
      selected = selected.filter((turn) => turn.createdAt <= user.createdAt);
    }
    turns = selected
      .filter(
        (turn) =>
          turn.projectId === input.projectId && (turn.role === 'user' || turn.role === 'assistant')
      )
      .map((turn) => ({
        hash: turn.turnHash,
        role: turn.role as 'user' | 'assistant',
        content: turn.content,
      }));
  } else if (input.userTurnHash)
    throw new TypeError('A conversation is required for a source turn');
  const resolvedSchema = await resolveWorkspaceYSchema(workspace.workspace, db, input.projectId);
  const schema =
    resolvedSchema.schema && resolvedSchema.canonicalName
      ? {
          canonicalName: resolvedSchema.canonicalName,
          version: resolvedSchema.version ?? null,
          resource: createYSchemaResourceDescriptor(
            `t3x://schemas/${encodeURIComponent(resolvedSchema.canonicalName)}/${resolvedSchema.version ?? 'unversioned'}`,
            resolvedSchema.schema
          ),
          value: resolvedSchema.schema,
        }
      : undefined;
  const candidates = await readWorkspaceAuthoringCandidates(db, {
    ...input,
    ledger,
    workspaceRevision: workspace.workspaceRevision,
  });
  const prepared = {
    schema,
    candidates,
    input: { ...input },
    workspaceRevision: workspace.workspaceRevision,
    compositionRevision: ledger.compositionRevision,
    basis,
    ledger,
    current: currentComposition(ledger),
    manifestDigest: authoringManifestDigest(ledger, basis),
    sources,
    turns,
    olderTurnsAvailable,
  };
  return { ...prepared, ...renderAssistantContext(prepared) };
}

export async function assertAssistantContextCurrent(
  db: AnyDB,
  prepared: PreparedAssistantContext,
  authorize: () => Promise<void>
) {
  await authorize();
  const workspace = await resolveWorkspaceTransitionContext(db, {
    projectId: prepared.input.projectId,
    workspaceId: prepared.input.workspaceId,
    expectedRevision: prepared.workspaceRevision,
  });
  const current = workspaceAuthoringState(workspace.workspace);
  if (authoringManifestDigest(current.ledger, current.basis) !== prepared.manifestDigest)
    throw new DraftAuthoringConflictError('Draft context changed; prepare again');
  if (prepared.input.conversationId) {
    const conversation = await findConversationById(db, prepared.input.conversationId);
    const latest = await findLastTurnInConversation(db, prepared.input.conversationId);
    if (
      conversation?.projectId !== prepared.input.projectId ||
      latest?.turnHash !== prepared.turns.at(-1)?.hash
    )
      throw new DraftAuthoringConflictError('Conversation context changed; prepare again');
  }
  if (prepared.schema) {
    const schema = await resolveWorkspaceYSchema(workspace.workspace, db, prepared.input.projectId);
    if (
      !schema.schema ||
      createYSchemaResourceDescriptor(prepared.schema.resource.uri, schema.schema).digest !==
        prepared.schema.resource.digest
    )
      throw new DraftAuthoringConflictError('Schema context changed; prepare again');
  }
  const sources = await resolveProposalGenerationSources(
    db,
    prepared.input.projectId,
    prepared.sources.flatMap((source) => (source.materialId ? [source.materialId] : []))
  );
  if (
    canonicalizeProtocolValue(
      JSON.parse(JSON.stringify(sources.map((source) => source.resource)))
    ) !==
    canonicalizeProtocolValue(
      JSON.parse(JSON.stringify(prepared.sources.map((source) => source.resource)))
    )
  )
    throw new DraftAuthoringConflictError('Source context changed; prepare again');
}
