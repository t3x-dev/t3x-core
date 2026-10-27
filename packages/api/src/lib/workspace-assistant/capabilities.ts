import { AssistantSchemaSettingsProposalInputSchema } from '@t3x-dev/api-client';
import {
  type DraftActionActor,
  type DraftYOp,
  nodeHistory,
  selectedActionView,
} from '@t3x-dev/application';
import { type LLMProvider, resolveNativeYOpsPath } from '@t3x-dev/core';
import { type AnyDB, findTurnsByConversation } from '@t3x-dev/storage';
import { z } from 'zod';
import { generateTransitionProposal, type ProposalGenerationModel } from '../proposal-generation';
import { defaultProposalGenerationModel } from '../proposal-generation-model';
import { publishWorkspaceAuthoringAction } from '../workspace-authoring';
import { assertAssistantContextCurrent } from './context';
import type { AssistantInference, PreparedAssistantContext } from './contracts';
import type { createAssistantSchemaSettingsService } from './schema-settings';

export interface AssistantCapability {
  definition: Parameters<NonNullable<LLMProvider['generateWithTools']>>[1][number];
  execute(input: unknown, operationId: string): Promise<unknown>;
}
export type AssistantCapabilities = Record<string, AssistantCapability>;
function capability<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  execute: (input: z.infer<T>, operationId: string) => Promise<unknown>
): AssistantCapability {
  return {
    definition: { name, description, input_schema: z.toJSONSchema(schema) },
    execute: async (input, operationId) => execute(schema.parse(input), operationId),
  };
}
function bounded(value: unknown) {
  if (JSON.stringify(value).length > 16_000)
    return {
      partial: true,
      reason: 'Result exceeds context budget. Request a smaller node or history page.',
    };
  return value;
}
/** Capabilities contain business calls; provider tool definitions are only their adapter. */
export function createAssistantCapabilities(input: {
  db: AnyDB;
  prepared: PreparedAssistantContext;
  actor: DraftActionActor;
  inference: AssistantInference;
  authorize: (capability: 'read' | 'propose') => Promise<void>;
  exactEdit?: { operations: DraftYOp[]; reason?: string };
  schemaSettings?: ReturnType<typeof createAssistantSchemaSettingsService>;
  confirmedSettingsId?: string;
  proposal?: {
    posture: 'source_only' | 'guided' | 'recommend';
    requestedProvider?: string;
    requestedModel?: string;
    resolveModel?: () => Promise<ProposalGenerationModel>;
  };
}): AssistantCapabilities {
  const { prepared } = input;
  const guard = () =>
    assertAssistantContextCurrent(input.db, prepared, () => input.authorize('read'));
  const version = {
    workspaceRevision: prepared.workspaceRevision,
    compositionRevision: prepared.compositionRevision,
    manifestDigest: prepared.manifestDigest,
  };
  const capabilities: AssistantCapabilities = {
    readConversationHistory: capability(
      'readConversationHistory',
      'Read earlier original turns from this pinned source thread. Assistant text is context only, never evidence.',
      z.object({ cursor: z.string().max(2000).default('') }).strict(),
      async ({ cursor }) => {
        await guard();
        if (!prepared.input.conversationId) return { turns: [], nextCursor: null };
        const page = await findTurnsByConversation(input.db, {
          conversationId: prepared.input.conversationId,
          cursor,
          order: 'desc',
          limit: 5,
        });
        return bounded({
          ...version,
          turns: page.items.map((turn) => ({
            hash: turn.turnHash,
            role: turn.role,
            content: turn.content,
            evidenceEligible: turn.role === 'user',
          })),
          nextCursor: page.next_cursor,
        });
      }
    ),
    readSchema: capability(
      'readSchema',
      'Read the resolved Workspace schema; constraints are not source evidence.',
      z.object({}).strict(),
      async () => {
        await guard();
        return bounded({ ...version, schema: prepared.schema ?? null });
      }
    ),
    readBaseStructure: capability(
      'readBaseStructure',
      'Read a path in the original pinned Base, separately from current Draft.',
      z.object({ path: z.string().max(1000).default('') }).strict(),
      async ({ path }) => {
        await guard();
        return bounded({
          ...version,
          baseDigest: prepared.basis.baseDigest,
          path,
          value:
            path === '' ? prepared.ledger.base : resolveNativeYOpsPath(prepared.ledger.base, path),
        });
      }
    ),
    readStructure: capability(
      'readStructure',
      'Read an exact path in the pinned current Draft. Empty path returns its root. These values are state, not source evidence.',
      z.object({ path: z.string().max(1000).default('') }).strict(),
      async ({ path }) => {
        await guard();
        const value =
          path === '' ? prepared.current : resolveNativeYOpsPath(prepared.current, path);
        return bounded({
          ...version,
          path,
          value,
          rootKeys:
            prepared.current && typeof prepared.current === 'object'
              ? Object.keys(prepared.current).slice(0, 100)
              : [],
        });
      }
    ),
    readAction: capability(
      'readAction',
      'Read immutable before/after cards for one published action; selection never changes current Draft.',
      z.object({ actionId: z.string().min(1).max(200) }).strict(),
      async ({ actionId }) => {
        await guard();
        const action = selectedActionView(prepared.ledger, actionId);
        if (!action) throw new TypeError('Unknown action');
        return bounded({
          ...version,
          action: {
            actionId: action.action.actionId,
            actor: action.action.actor,
            channel: action.action.channel,
            publishedAt: action.action.publishedAt,
            beforeRevision: action.action.beforeRevision,
            afterRevision: action.action.afterRevision,
            reason: action.action.reason,
          },
          cards: action.cards,
        });
      }
    ),
    readNodeHistory: capability(
      'readNodeHistory',
      'Read a page of immutable node history and the separately labelled current value. Deleted nodes are not writable.',
      z
        .object({
          nodeId: z.string().min(1).max(1000),
          beforeSequence: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(10).default(5),
        })
        .strict(),
      async ({ nodeId, beforeSequence, limit }) => {
        await guard();
        const history = nodeHistory(prepared.ledger, nodeId, prepared.input.selectedActionId);
        const entries = history.entries
          .filter((entry) => beforeSequence === undefined || entry.sequence < beforeSequence)
          .slice(0, limit);
        return bounded({
          ...version,
          ...history,
          entries,
          nextBeforeSequence: entries.length === limit ? entries.at(-1)!.sequence : null,
        });
      }
    ),
    searchSources: capability(
      'searchSources',
      'Search only authorized selected original documents. Returns exact excerpts and source versions, never model-generated evidence.',
      z.object({ query: z.string().min(1).max(200) }).strict(),
      async ({ query }) => {
        await guard();
        return {
          ...version,
          scope: 'selected_documents',
          matches: prepared.sources
            .flatMap((source) => {
              const index = source.content.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
              if (index < 0) return [];
              const start = Math.max(0, index - 160),
                end = Math.min(source.content.length, index + query.length + 500);
              return [
                {
                  materialId: source.materialId,
                  resource: source.resource,
                  start,
                  end,
                  quote: source.content.slice(start, end),
                },
              ];
            })
            .slice(0, 8),
        };
      }
    ),
  };
  if (input.proposal) {
    const proposal = input.proposal;
    if (input.schemaSettings) {
      capabilities.showSchemaChangeCard = capability(
        'showSchemaChangeCard',
        'Show Schema confirmation cards in the Workspace timeline for an addition, edit, removal, rename or move. Call alone, after a separate readSchema step. Supply an entire requested Node subtree in one call; the server splits additions into independently confirmed Node and Slot cards. nodePath is the semantic parent path; name identifies the target. For a Node, definition uses {required, repeated, slots: {field: {type}}, requiredSlots: [field], children: {child: {slots: {field: {type}}}}}. Nested Nodes use children, never nodes; requiredSlots belongs to the Node, not a Slot. For a Slot use definition: {type, description, ...constraints} and top-level required. For edit supply only changed attributes in definition; omitted attributes remain unchanged. Set unsetAttributes to explicitly remove optional constraints. Rename uses newName; moving a Node/Slot uses targetNodePath and optionally newName. Removals use an empty definition. Also supports adding/editing/removing relation types and rules. Only stage cards and stop; no generation, Schema binding, content edit or Commit before human confirmation.',
        AssistantSchemaSettingsProposalInputSchema,
        async (settings, operationId) => {
          await input.authorize('propose');
          await guard();
          if (input.confirmedSettingsId)
            throw new TypeError('Use the confirmed settings instead of opening another card.');
          return {
            status: 'awaiting_confirmation',
            settings: await input.schemaSettings!.show(
              settings,
              operationId,
              prepared.turns?.find(
                (turn) => turn.hash === prepared.input.userTurnHash && turn.role === 'user'
              )?.content ??
                prepared.turns
                  ?.slice()
                  .reverse()
                  .find((turn) => turn.role === 'user')?.content
            ),
          };
        }
      );
    }
    capabilities.requestProposal = capability(
      'requestProposal',
      'Generate a governed candidate only when explicitly requested. target=content edits content (default); target=schema requires the confirmedSettingsId from the current confirmed settings card and uses those exact attributes. This does not publish, apply, decide or commit. Sources and posture are server-bound.',
      z
        .object({
          instruction: z.string().trim().min(1).max(5000),
          target: z.enum(['content', 'schema']).default('content'),
          confirmedSettingsId: z.string().max(200).optional(),
        })
        .strict(),
      async ({ instruction, target, confirmedSettingsId }, operationId) => {
        await input.authorize('propose');
        await guard();
        if (target === 'schema') {
          if (
            !input.schemaSettings ||
            !confirmedSettingsId ||
            confirmedSettingsId !== input.confirmedSettingsId
          )
            throw new TypeError('Schema edits require the settings confirmed for this request.');
          return input.schemaSettings.propose(confirmedSettingsId);
        }
        if (input.confirmedSettingsId)
          throw new TypeError(
            'This confirmation authorizes a Schema candidate, not a content edit.'
          );
        const request = {
          workspaceId: prepared.input.workspaceId,
          expectedRevision: prepared.workspaceRevision,
          posture: proposal.posture,
          instruction,
          requestedProvider: proposal.requestedProvider,
          requestedModel: proposal.requestedModel,
          // "Generate a proposal from this message" authorizes the current user turn.
          // Earlier chat remains readable context, but must not silently become mutation evidence.
          sourceTurnHashes: prepared.input.userTurnHash ? [prepared.input.userTurnHash] : [],
          sourceMaterialIds: prepared.sources.flatMap((source) =>
            source.materialId ? [source.materialId] : []
          ),
          imageMaterialIds: prepared.images.map((image) => image.materialId),
        };
        const generated = await generateTransitionProposal({
          db: input.db,
          projectId: prepared.input.projectId,
          requestId: operationId,
          requester: input.actor,
          request,
          resolveModel:
            proposal.resolveModel ??
            (() =>
              defaultProposalGenerationModel({
                db: input.db,
                projectId: prepared.input.projectId,
                request,
              })),
          inference: {
            ...input.inference,
            runId: `${input.inference.runId}:proposal:${operationId}`,
          },
        });
        return {
          kind: 'content',
          status: 'candidate',
          operationId,
          transitionId: generated.view.transitionId,
          reused: generated.reused,
          ...version,
        };
      }
    );
  }
  if (input.exactEdit) {
    const exact = structuredClone(input.exactEdit);
    capabilities.applyUserEdit = capability(
      'applyUserEdit',
      'Apply only the exact current-state edit already supplied and authorized by the user. You cannot change its operations or assert evidence.',
      z.object({}).strict(),
      async (_args, operationId) => {
        await input.authorize('propose');
        await guard();
        const saved = await publishWorkspaceAuthoringAction(input.db, {
          projectId: prepared.input.projectId,
          workspaceId: prepared.input.workspaceId,
          actionId: operationId,
          actor: input.actor,
          channel: 'manual',
          operations: exact.operations,
          reason: exact.reason,
          expectedRevision: prepared.compositionRevision,
          expectedWorkspaceRevision: prepared.workspaceRevision,
          expectedRefHead: prepared.basis.refHead,
        });
        return {
          status: saved.value.kind === 'no_change' ? 'no_change' : 'published',
          operationId,
          actionId: operationId,
          workspaceRevision: saved.draft.revision,
          compositionRevision: saved.value.ledger.compositionRevision,
          affectedNodeIds:
            selectedActionView(saved.value.ledger, operationId)?.cards.map((card) => card.nodeId) ??
            [],
        };
      }
    );
  }
  return capabilities;
}
