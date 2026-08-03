/**
 * Repository-owned Source/Evidence reads.
 *
 * This route projects durable source facts for repository pages. It does not
 * expose generation, mutation, Decision authority, or a replacement Chat
 * workbench.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getConversationSourceEvidence } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const sourceEvidenceRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

const SourceAvailabilityModeSchema = z.enum(['available', 'partial', 'unavailable']);
const SourceAvailabilityReasonSchema = z.enum(['SOURCE_RECORD_MISSING', 'TURN_PAGE_INCOMPLETE']);

const SourceConversationSchema = z.object({
  type: z.literal('conversation'),
  id: z.string(),
  project_id: z.string(),
  title: z.string().nullable(),
  alias: z.string().nullable(),
  parent_commit_hash: z.string().nullable(),
  committed_as: z.string().nullable(),
  committed_at: z.string().nullable(),
  created_at: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
});

const SourceTurnSchema = z.object({
  turn_hash: z.string(),
  parent_turn_hash: z.string().nullable(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  language: z.string().nullable(),
  rings: z.unknown().nullable(),
  content_blocks: z.array(z.unknown()).nullable(),
  created_at: z.string(),
});

const SourceRevisionSchema = z.object({
  revision_id: z.string(),
  turn_hash: z.string(),
  turn_role: z.enum(['user', 'assistant', 'system', 'tool']),
  action: z.enum(['add', 'edit', 'delete']),
  selected_text: z.string(),
  replacement_text: z.string(),
  content: z.string(),
  spans: z.array(
    z.object({
      id: z.string(),
      action: z.enum(['add', 'edit', 'delete']),
      start: z.number().int(),
      end: z.number().int(),
      text: z.string(),
      original_text: z.string(),
    })
  ),
  base_content_hash: z.string(),
  status: z.enum(['saved', 'patched', 'no_patch', 'patch_failed', 'synced', 'discarded']),
  created_at: z.string(),
  updated_at: z.string(),
});

const SourceCommitReferenceSchema = z.object({
  commit_digest: z.string(),
  recorded_at: z.string(),
  intent: z.string().nullable(),
  evidence_refs: z.array(
    z.object({
      resource: z.object({
        uri: z.string(),
        mediaType: z.string(),
        digest: z.string(),
      }),
      locator: z.object({
        scheme: z.string(),
        value: z.unknown(),
      }),
    })
  ),
});

const SourceEvidenceResponseSchema = z.object({
  availability: z.object({
    mode: SourceAvailabilityModeSchema,
    reasons: z.array(SourceAvailabilityReasonSchema),
  }),
  source: SourceConversationSchema.nullable(),
  turns: z.object({
    items: z.array(SourceTurnSchema),
    total: z.number().int().min(0),
    limit: z.number().int().min(1),
    offset: z.number().int().min(0),
    completeness: z.enum(['complete', 'partial']),
  }),
  revisions: z.array(SourceRevisionSchema),
  evidence_selection: z.object({
    mode: z.literal('immutable_refs'),
    turn_hashes: z.array(z.string()),
  }),
  referring_commits: z.array(SourceCommitReferenceSchema),
});

const getConversationSourceEvidenceRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/sources/conversations/{conversationId}',
  tags: ['Sources'],
  summary: 'Read one repository conversation source and its evidence',
  description:
    'Returns a project-scoped, read-only projection over conversation, immutable turns, controlled source revisions, and CommitV2 Proposal/Statement evidence references.',
  request: {
    params: z.object({
      projectId: z.string().min(1),
      conversationId: z.string().min(1),
    }),
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(100).optional(),
      offset: z.coerce.number().int().min(0).default(0).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Repository source evidence projection',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(SourceEvidenceResponseSchema),
        },
      },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project or source not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Internal server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

function parseJson(value: string | null): unknown | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  const parsed = parseJson(value);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

sourceEvidenceRoutes.openapi(getConversationSourceEvidenceRoute, async (c) => {
  const { projectId, conversationId } = c.req.valid('param');
  const { limit = 100, offset = 0 } = c.req.valid('query');
  const db = await getDB();

  try {
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

    const record = await getConversationSourceEvidence(db, {
      projectId,
      conversationId,
      limit,
      offset,
    });
    if (record === null) {
      return errorResponse(c, 'NOT_FOUND', 'Source conversation ' + conversationId + ' not found');
    }

    const turnPageIncomplete = record.turnCount !== record.turns.length;
    const reasons: Array<'SOURCE_RECORD_MISSING' | 'TURN_PAGE_INCOMPLETE'> = [];
    if (record.conversation === null) reasons.push('SOURCE_RECORD_MISSING');
    if (turnPageIncomplete) reasons.push('TURN_PAGE_INCOMPLETE');

    const mode =
      record.conversation === null ? 'unavailable' : turnPageIncomplete ? 'partial' : 'available';

    const turnHashes = [
      ...new Set(
        record.commitReferences.flatMap((reference) =>
          reference.evidence.flatMap((evidence) => {
            const marker = '/turns/';
            const markerIndex = evidence.resource.uri.indexOf(marker);
            if (markerIndex < 0) return [];
            const encoded = evidence.resource.uri.slice(markerIndex + marker.length).split('/')[0];
            return encoded ? [decodeURIComponent(encoded)] : [];
          })
        )
      ),
    ].sort();

    return c.json(
      {
        success: true as const,
        data: {
          availability: { mode, reasons },
          source:
            record.conversation === null
              ? null
              : {
                  type: 'conversation' as const,
                  id: record.conversation.conversationId,
                  project_id: record.conversation.projectId,
                  title: record.conversation.title,
                  alias: record.conversation.alias,
                  parent_commit_hash: record.conversation.parentCommitHash,
                  committed_as: record.conversation.committedAs,
                  committed_at: record.conversation.committedAt?.toISOString() ?? null,
                  created_at: record.conversation.createdAt.toISOString(),
                  metadata: parseMetadata(record.conversation.metadataJson),
                  provider: record.conversation.provider,
                  model: record.conversation.model,
                },
          turns: {
            items: record.turns.map((turn) => ({
              turn_hash: turn.turnHash,
              parent_turn_hash: turn.parentTurnHash,
              role: turn.role as 'user' | 'assistant' | 'system' | 'tool',
              content: turn.content,
              language: turn.language,
              rings: parseJson(turn.ringsJson),
              content_blocks: turn.contentBlocks ?? null,
              created_at: turn.createdAt.toISOString(),
            })),
            total: record.turnCount,
            limit: record.limit,
            offset: record.offset,
            completeness: turnPageIncomplete ? ('partial' as const) : ('complete' as const),
          },
          revisions: record.revisions.map((revision) => ({
            revision_id: revision.revisionId,
            turn_hash: revision.turnHash,
            turn_role: revision.turnRole as 'user' | 'assistant' | 'system' | 'tool',
            action: revision.action as 'add' | 'edit' | 'delete',
            selected_text: revision.selectedText,
            replacement_text: revision.replacementText,
            content: revision.content,
            spans: revision.spans.map((span) => ({
              id: span.id,
              action: span.action,
              start: span.start,
              end: span.end,
              text: span.text,
              original_text: span.originalText,
            })),
            base_content_hash: revision.baseContentHash,
            status: revision.status as
              | 'saved'
              | 'patched'
              | 'no_patch'
              | 'patch_failed'
              | 'synced'
              | 'discarded',
            created_at: revision.createdAt.toISOString(),
            updated_at: revision.updatedAt.toISOString(),
          })),
          evidence_selection: {
            mode: 'immutable_refs' as const,
            turn_hashes: turnHashes,
          },
          referring_commits: record.commitReferences.map((reference) => ({
            commit_digest: reference.commitDigest,
            recorded_at: reference.recordedAt.toISOString(),
            intent: reference.intent,
            evidence_refs: reference.evidence,
          })),
        },
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read source evidence';
    return errorResponse(c, 'READ_FAILED', message);
  }
});
