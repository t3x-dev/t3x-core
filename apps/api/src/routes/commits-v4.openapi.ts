/**
 * Commits V4 Routes with OpenAPI
 *
 * REST API endpoints for CommitV4 with OpenAPI documentation.
 * V4 commits store pure knowledge (sentences only, no constraints).
 * Constraints are stored in Leaves (application layer).
 *
 * Endpoints:
 * - POST   /v1/commits-v4               - Create a new commit
 * - GET    /v1/commits-v4/:hash         - Get commit by hash
 * - GET    /v1/projects/:projectId/commits-v4 - List commits by project
 * - PATCH  /v1/commits-v4/:hash/position - Update canvas position
 * - GET    /v1/commits-v4/:hash/history - Get commit ancestor chain
 * - DELETE /v1/commits-v4/:hash         - Delete commit
 *
 * @see docs/specification/semantic-layer-architecture.md
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { CommitV4, ConflictReport, Sentence } from '@t3x/core';
import { createRelationExtractor, detectConflicts } from '@t3x/core';
import {
  createCommitV4,
  deleteCommitV4,
  ensureMainBranch,
  findCommitsV4ByBranch,
  findCommitsV4ByProject,
  findCommitV4ByHash,
  findCommitV4History,
  findLeavesByCommit,
  getCommitsV4ByHashes,
  insertConflict,
  MainBranchLinearityError,
  ParentNotFoundErrorV4,
  searchSimilarSentences,
  updateBranchHead,
  updateCommitV4Position,
  upsertRelations,
  upsertSentenceVectorsBatch,
  validateMainBranchLinearity,
} from '@t3x/storage/pglite';
import { getDB } from '../lib/db';
import { getEmbedder } from '../lib/embedder';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getLLMProvider } from '../lib/provider-registry';
import { webhookDispatcher } from '../lib/webhook-dispatcher';
import { pinoLogger } from '../middleware/logger';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  HashParamSchema,
  PaginationQuerySchema,
  SuccessResponseSchema,
} from '../schemas/common';
import { CommitV4Response, CreateCommitV4Request } from '../schemas/v4-contracts';
import { pushNotification } from './notifications.openapi';

export const commitsV4Routes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Shared conflict schema (used by both create response and check-conflicts endpoint)
// ============================================================

const ConflictCandidateSchema = z.object({
  new_sentence_id: z.string(),
  new_sentence_text: z.string(),
  existing_sentence_id: z.string(),
  existing_sentence_text: z.string(),
  existing_commit_hash: z.string(),
  cosine: z.number(),
  jaccard: z.number(),
});

// ============================================================
// Create-commit response: commit data + optional conflict report
// ============================================================

const CreateCommitV4WithConflictsResponse = z.object({
  commit: CommitV4Response,
  conflicts: z
    .object({
      conflicts: z.array(ConflictCandidateSchema),
      checked_count: z.number(),
    })
    .nullable()
    .describe(
      'Conflict report from auto-detection. null when embedder is not configured or detection is skipped.'
    ),
});

// ============================================================
// Response helpers
// ============================================================

/**
 * Convert storage CommitV4 to API response format
 * Storage returns undefined for missing optional fields, API uses null
 */
function toApiCommit(commit: CommitV4) {
  return {
    hash: commit.hash,
    schema: commit.schema,
    parents: commit.parents,
    author: commit.author,
    committed_at: commit.committed_at,
    content: commit.content,
    project_id: commit.project_id ?? null,
    message: commit.message ?? null,
    branch: commit.branch ?? null,
    source_refs: commit.source_refs ?? null,
    semantic: commit.semantic ?? null,
    position_x: commit.position_x ?? null,
    position_y: commit.position_y ?? null,
    created_at: commit.created_at ?? commit.committed_at,
    merge_summary: commit.merge_summary ?? null,
  };
}

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/commits-v4 - Create commit
const createCommitV4Route = createRoute({
  method: 'post',
  path: '/v1/commits-v4',
  tags: ['Commits V4'],
  summary: 'Create a new commit v4',
  description: `Creates a semantic commit with sentences only (no constraints).

**V4 Schema Requirements:**
- \`sentences\`: Required, non-empty array of sentence objects
- \`author\`: Required, must have \`type\` ('human' or 'agent')
- \`project_id\`: Required

**V4 Restrictions:**
- \`constraints\`: NOT allowed at commit level (use POST /v1/leaves instead)
- \`turn_window\`, \`facet_snapshot\`: V3 fields, not allowed
- If \`schema\` is provided, must be 't3x/commit/v4'

**Auto Conflict Detection:**
- If an embedding provider is configured, conflict detection runs automatically after commit creation
- Conflicts are returned in the \`conflicts\` field alongside the commit data
- If no embedder is configured, \`conflicts\` is null

**Error Codes:**
- \`COMMIT_VERSION_UNSUPPORTED\`: V3 payload or non-V4 schema detected
- \`INVALID_REQUEST\`: Missing required fields or constraints at commit level
- \`PARENT_NOT_FOUND\`: Referenced parent commit does not exist
- \`PROJECT_NOT_FOUND\`: Referenced project does not exist`,
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCommitV4Request,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Commit created successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CreateCommitV4WithConflictsResponse),
        },
      },
    },
    400: {
      description:
        'Invalid request. Possible error codes: COMMIT_VERSION_UNSUPPORTED (V3 payload), INVALID_REQUEST (missing fields or constraints at commit level), PARENT_NOT_FOUND',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    409: {
      description: 'Conflict: main branch linearity violation (MAIN_ROOT_EXISTS, MAIN_NOT_HEAD)',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: 'Project not found (PROJECT_NOT_FOUND)',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// GET /v1/commits-v4/:hash - Get commit by hash
const getCommitV4Route = createRoute({
  method: 'get',
  path: '/v1/commits-v4/{hash}',
  tags: ['Commits V4'],
  summary: 'Get commit by hash',
  description: 'Retrieves a commit v4 by its SHA-256 hash.',
  request: {
    params: HashParamSchema,
  },
  responses: {
    200: {
      description: 'Commit found',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CommitV4Response),
        },
      },
    },
    404: {
      description: 'Commit not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// GET /v1/projects/:projectId/commits-v4 - List commits by project
const listCommitsV4ByProjectRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/commits-v4',
  tags: ['Commits V4'],
  summary: 'List commits by project',
  description:
    'Lists all commits v4 in a project, ordered by committed_at descending. ' +
    'Supports cursor-based pagination: pass `cursor` query parameter (empty string for first page) ' +
    'to receive `{ items, next_cursor, has_more }` response. Omit `cursor` for legacy offset/limit mode.',
  request: {
    params: z.object({
      projectId: z.string().min(1),
    }),
    query: PaginationQuerySchema.extend({
      branch: z.string().optional(),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'List of commits',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.union([CursorPageResponseSchema(CommitV4Response), z.array(CommitV4Response)])
          ),
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// PATCH /v1/commits-v4/:hash/position - Update canvas position
const updateCommitV4PositionRoute = createRoute({
  method: 'patch',
  path: '/v1/commits-v4/{hash}/position',
  tags: ['Commits V4'],
  summary: 'Update commit canvas position',
  description: 'Updates the canvas position (x, y coordinates) of a commit v4.',
  request: {
    params: HashParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            position_x: z.number(),
            position_y: z.number(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Position updated successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CommitV4Response),
        },
      },
    },
    404: {
      description: 'Commit not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// GET /v1/commits-v4/:hash/history - Get commit ancestor chain
const getCommitV4HistoryRoute = createRoute({
  method: 'get',
  path: '/v1/commits-v4/{hash}/history',
  tags: ['Commits V4'],
  summary: 'Get commit history (ancestor chain)',
  description:
    'Walks the parent chain from the given commit via BFS traversal. ' +
    'Returns an ordered list of ancestor commits (including the starting commit).',
  request: {
    params: HashParamSchema,
    query: z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  },
  responses: {
    200: {
      description: 'Commit history',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              commits: z.array(CommitV4Response),
              truncated: z.boolean(),
            })
          ),
        },
      },
    },
    404: {
      description: 'Starting commit not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// DELETE /v1/commits-v4/:hash - Delete commit
const deleteCommitV4Route = createRoute({
  method: 'delete',
  path: '/v1/commits-v4/{hash}',
  tags: ['Commits V4'],
  summary: 'Delete commit',
  description: 'Deletes a commit v4 by its hash.',
  request: {
    params: HashParamSchema,
  },
  responses: {
    200: {
      description: 'Commit deleted successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              deleted: z.literal(true),
              hash: z.string(),
            })
          ),
        },
      },
    },
    404: {
      description: 'Commit not found',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/commits-v4 - Create commit
commitsV4Routes.openapi(createCommitV4Route, async (c) => {
  const body = c.req.valid('json');

  // ============================================================
  // V4-only validation: check for unexpected fields in raw body
  // ============================================================
  const rawBody = body as Record<string, unknown>;

  // Rule 1: If schema field provided, must be t3x/commit/v4
  if (rawBody.schema && rawBody.schema !== 't3x/commit/v4') {
    return errorResponse(
      c,
      'COMMIT_VERSION_UNSUPPORTED',
      `Only V4 commits supported on this endpoint. Received schema: ${rawBody.schema}. ` +
        'Use /v1/commits-v3 for legacy commits.'
    );
  }

  // Rule 2: Reject V3-specific fields (turn_window, facet_snapshot)
  if (rawBody.turn_window || rawBody.facet_snapshot) {
    return errorResponse(
      c,
      'COMMIT_VERSION_UNSUPPORTED',
      'V4 commits do not support turn_window or facet_snapshot. ' +
        'These are V3 fields. Use sentences array instead.'
    );
  }

  // Rule 3: Reject constraints at commit level (V4 stores constraints in Leaves)
  const rawContent = rawBody.content as Record<string, unknown> | undefined;
  if (rawBody.constraints || rawContent?.constraints) {
    return errorResponse(
      c,
      'INVALID_REQUEST',
      'V4 commits do not support constraints at the commit level. ' +
        'Constraints should be stored in Leaves (POST /v1/leaves). ' +
        'See docs/specification/semantic-layer-architecture.md for V4 design.'
    );
  }

  try {
    const db = await getDB();

    // Validate main branch linearity before creating commit
    if (body.branch) {
      await validateMainBranchLinearity(db, body.project_id, body.branch, body.parents ?? []);
    }

    // ============================================================
    // Parent sentence inheritance
    // ============================================================
    // When inherit_parent_sentences is true (default), merge parent sentences
    // with new sentences. New sentences with the same text take precedence.

    // [C2] Strip inherited_from from user-supplied sentences to prevent forgery
    const sanitizedSentences: Sentence[] = body.sentences.map(
      ({ inherited_from: _, ...rest }) => rest
    );

    let finalSentences: Sentence[] = sanitizedSentences;

    const shouldInherit = body.inherit_parent_sentences !== false;
    const parents = body.parents ?? [];

    if (shouldInherit && parents.length > 0) {
      // Fetch all parent commits
      const parentCommits = await getCommitsV4ByHashes(db, parents);

      // [M1] Validate all parents were found to prevent silent sentence loss
      if (parentCommits.length !== parents.length) {
        const foundHashes = new Set(parentCommits.map((c) => c.hash));
        const missing = parents.filter((h) => !foundHashes.has(h));
        return errorResponse(
          c,
          'PARENT_NOT_FOUND',
          `Parent commits not found for inheritance: ${missing.join(', ')}`
        );
      }

      // Collect inherited sentences from all parents
      const inheritedSentences: Sentence[] = [];
      for (const parent of parentCommits) {
        for (const sentence of parent.content.sentences) {
          // [C1] Use ?? (nullish coalescing) to preserve empty-string inherited_from
          const inheritedFrom = sentence.inherited_from ?? parent.hash;
          inheritedSentences.push({
            ...sentence,
            inherited_from: inheritedFrom,
          });
        }
      }

      // Build set of new sentence texts for deduplication
      const newTexts = new Set(sanitizedSentences.map((s) => s.text));

      // Merge: new sentences override inherited ones (by text)
      // Also deduplicate inherited sentences by text (first parent wins)
      const seenInheritedTexts = new Set<string>();
      const deduplicatedInherited: Sentence[] = [];
      for (const inherited of inheritedSentences) {
        if (!newTexts.has(inherited.text) && !seenInheritedTexts.has(inherited.text)) {
          seenInheritedTexts.add(inherited.text);
          deduplicatedInherited.push(inherited);
        }
      }

      // [M3] Deduplicate by ID — if an inherited sentence has the same ID as a new one,
      // keep the new one (it's already in sanitizedSentences)
      const newIds = new Set(sanitizedSentences.map((s) => s.id));
      const idSafeInherited = deduplicatedInherited.filter((s) => !newIds.has(s.id));

      // Final sentences = new sentences + inherited (deduplicated by text and ID)
      finalSentences = [...sanitizedSentences, ...idSafeInherited];
    }

    const commit = await createCommitV4(db, {
      parents: body.parents,
      author: body.author,
      sentences: finalSentences,
      project_id: body.project_id,
      message: body.message,
      branch: body.branch,
      source_refs: body.source_refs,
      position_x: body.position_x,
      position_y: body.position_y,
      semantic: body.semantic ?? undefined,
    });

    // Update branch HEAD to point to the new commit
    if (body.branch && body.project_id) {
      // Ensure main branch exists (idempotent)
      if (body.branch === 'main') {
        await ensureMainBranch(db, body.project_id);
      }

      const updated = await updateBranchHead(db, body.project_id, body.branch, commit.hash);

      // Warn if non-main branch doesn't exist
      if (!updated && body.branch !== 'main') {
        pinoLogger.warn(
          { branch: body.branch, project_id: body.project_id },
          'branch not found, HEAD not updated'
        );
      }
    }

    // Fire webhook event (fire-and-forget)
    webhookDispatcher.dispatch(
      'commit.created',
      {
        commit_hash: commit.hash,
        project_id: body.project_id,
        branch: body.branch,
        message: body.message,
        sentence_count: finalSentences.length,
      },
      body.project_id
    );

    // Push notification (fire-and-forget)
    pushNotification({
      type: 'commit.created',
      title: 'New Commit',
      message: `Committed ${finalSentences.length} sentence${finalSentences.length === 1 ? '' : 's'} on ${body.branch}${body.message ? `: ${body.message}` : ''}`,
      project_id: body.project_id,
      ref_id: commit.hash,
    });

    // Leaf stale detection: notify if leaves reference any parent commit
    // Batched: parallel queries + deduplicate by leaf ID to avoid notification flooding
    if (body.parents && body.parents.length > 0) {
      Promise.all(body.parents.map((parentHash) => findLeavesByCommit(db, parentHash)))
        .then((results) => {
          const seen = new Set<string>();
          for (const staleLeaves of results) {
            for (const leaf of staleLeaves) {
              if (seen.has(leaf.id)) continue;
              seen.add(leaf.id);
              pushNotification({
                type: 'leaf.stale',
                title: 'Leaf May Be Outdated',
                message: `Leaf "${leaf.title || leaf.id}" references a commit that now has a newer version`,
                project_id: body.project_id,
                ref_id: leaf.id,
              });
            }
          }
        })
        .catch((err) => {
          pinoLogger.warn({ err }, 'failed to detect stale leaves for notification');
        });
    }

    // ============================================================
    // Auto relation extraction (best-effort, fire-and-forget)
    // ============================================================
    if (finalSentences.length >= 2) {
      getLLMProvider()
        .then(async (llmProvider) => {
          if (!llmProvider) return;
          const relExtractor = createRelationExtractor(llmProvider);
          const relResult = await relExtractor.extract(
            finalSentences.map((s) => ({ id: s.id, text: s.text }))
          );
          if (relResult.relations.length > 0) {
            await upsertRelations(
              db,
              relResult.relations.map((r) => ({
                id: r.id,
                project_id: body.project_id,
                commit_hash: commit.hash,
                source_id: r.source_id,
                target_id: r.target_id,
                type: r.type,
                confidence: r.confidence,
                reasoning: r.reasoning,
              }))
            );
            pinoLogger.info(
              { commit_hash: commit.hash, relations: relResult.relations.length },
              'auto relation extraction complete'
            );
          }
        })
        .catch((err) => {
          pinoLogger.warn({ err, commit_hash: commit.hash }, 'auto relation extraction failed');
        });
    }

    // ============================================================
    // Auto conflict detection (best-effort, inline)
    // ============================================================
    // Populate sentence vectors and run conflict detection if embedder is available.
    // Errors are swallowed — conflict detection is non-critical.
    let conflictReport: ConflictReport | null = null;

    const embedder = getEmbedder();
    if (embedder && finalSentences.length > 0) {
      try {
        // 1. Embed new sentences
        const sentenceTexts = finalSentences.map((s) => s.text);
        const sentenceEmbeddings = await embedder.encode(sentenceTexts);

        // 2. Persist sentence vectors for future conflict detection
        await upsertSentenceVectorsBatch(
          db,
          finalSentences.map((s, i) => ({
            id: s.id,
            projectId: body.project_id,
            commitHash: commit.hash,
            text: s.text,
            embedding: sentenceEmbeddings[i],
            modelId: embedder.id,
          }))
        );

        // 3. Search for similar existing sentences (excluding this commit)
        const existingTextsToEmbed: Array<{
          id: string;
          text: string;
          commit_hash: string;
        }> = [];
        const seen = new Set<string>();

        for (let i = 0; i < finalSentences.length; i++) {
          const results = await searchSimilarSentences(
            db,
            body.project_id,
            sentenceEmbeddings[i],
            10,
            commit.hash
          );
          for (const r of results) {
            if (!seen.has(r.id)) {
              seen.add(r.id);
              existingTextsToEmbed.push({
                id: r.id,
                text: r.text,
                commit_hash: r.commit_hash,
              });
            }
          }
        }

        // 4. Re-encode existing sentences and run conflict detection
        if (existingTextsToEmbed.length > 0) {
          const existingEmbeddings = await embedder.encode(existingTextsToEmbed.map((r) => r.text));
          const existingSentences = existingTextsToEmbed.map((r, i) => ({
            ...r,
            embedding: existingEmbeddings[i],
          }));

          conflictReport = await detectConflicts(finalSentences, existingSentences, embedder);

          // 5. Persist detected conflicts to knowledge_conflicts table (fire-and-forget)
          if (conflictReport.conflicts.length > 0) {
            Promise.all(
              conflictReport.conflicts.map((conflict) =>
                insertConflict(db, {
                  project_id: body.project_id,
                  new_sentence_id: conflict.new_sentence_id,
                  new_commit_hash: commit.hash,
                  existing_sentence_id: conflict.existing_sentence_id,
                  existing_commit_hash: conflict.existing_commit_hash,
                  cosine: conflict.cosine,
                  jaccard: conflict.jaccard,
                })
              )
            ).catch((conflictErr) => {
              pinoLogger.warn({ err: conflictErr }, 'failed to persist detected conflicts');
            });

            // Notify about detected conflicts
            pushNotification({
              type: 'conflict.detected',
              title: 'Knowledge Conflicts Detected',
              message: `${conflictReport.conflicts.length} potential conflict${conflictReport.conflicts.length === 1 ? '' : 's'} found in commit`,
              project_id: body.project_id,
              ref_id: commit.hash,
            });
          }
        } else {
          conflictReport = { conflicts: [], checked_count: finalSentences.length };
        }
      } catch (conflictErr) {
        // Non-fatal: log and continue with null conflict report
        pinoLogger.warn({ err: conflictErr }, 'auto conflict detection failed');
      }
    }

    return c.json(
      {
        success: true as const,
        data: {
          commit: toApiCommit(commit),
          conflicts: conflictReport,
        },
      },
      201
    );
  } catch (err) {
    // Handle main branch linearity violation
    if (err instanceof MainBranchLinearityError) {
      return errorResponse(c, err.code, err.message);
    }

    // Handle parent not found error
    if (err instanceof ParentNotFoundErrorV4) {
      return errorResponse(
        c,
        'PARENT_NOT_FOUND',
        `Parent commits not found: ${err.missingParents.join(', ')}`
      );
    }

    // Handle PostgreSQL foreign key violation (project not found)
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      return errorResponse(c, 'PROJECT_NOT_FOUND', 'Referenced project not found');
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// GET /v1/commits-v4/:hash - Get commit by hash
commitsV4Routes.openapi(getCommitV4Route, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);

  try {
    const db = await getDB();
    const commit = await findCommitV4ByHash(db, decodedHash);

    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

    return c.json({ success: true as const, data: toApiCommit(commit) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// GET /v1/projects/:projectId/commits-v4 - List commits by project
commitsV4Routes.openapi(listCommitsV4ByProjectRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { branch, limit, offset, cursor } = c.req.valid('query');

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      if (branch) {
        const result = await findCommitsV4ByBranch(db, projectId, branch, { cursor, limit });
        return c.json(
          {
            success: true as const,
            data: {
              items: result.items.map(toApiCommit),
              next_cursor: result.next_cursor,
              has_more: result.has_more,
            },
          },
          200
        );
      }
      const result = await findCommitsV4ByProject(db, projectId, { cursor, limit });
      return c.json(
        {
          success: true as const,
          data: {
            items: result.items.map(toApiCommit),
            next_cursor: result.next_cursor,
            has_more: result.has_more,
          },
        },
        200
      );
    }

    // Legacy offset/limit mode
    let commits: CommitV4[];
    if (branch) {
      commits = await findCommitsV4ByBranch(db, projectId, branch, { limit, offset });
    } else {
      commits = await findCommitsV4ByProject(db, projectId, { limit, offset });
    }

    return c.json({ success: true as const, data: commits.map(toApiCommit) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// PATCH /v1/commits-v4/:hash/position - Update canvas position
commitsV4Routes.openapi(updateCommitV4PositionRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const commit = await updateCommitV4Position(db, decodedHash, body.position_x, body.position_y);

    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

    return c.json({ success: true as const, data: toApiCommit(commit) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

// GET /v1/commits-v4/:hash/history - Get commit ancestor chain
commitsV4Routes.openapi(getCommitV4HistoryRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);
  const { limit } = c.req.valid('query');

  try {
    const db = await getDB();
    const result = await findCommitV4History(db, decodedHash, limit);

    if (result.commits.length === 0) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

    return c.json(
      {
        success: true as const,
        data: {
          commits: result.commits.map(toApiCommit),
          truncated: result.truncated,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'HISTORY_FAILED', message);
  }
});

// DELETE /v1/commits-v4/:hash - Delete commit
commitsV4Routes.openapi(deleteCommitV4Route, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);

  try {
    const db = await getDB();
    const deleted = await deleteCommitV4(db, decodedHash);

    if (!deleted) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

    return c.json(
      { success: true as const, data: { deleted: true as const, hash: decodedHash } },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});

// ============================================================
// POST /v1/commits-v4/:hash/check-conflicts — Detect cross-conversation conflicts
// ============================================================

const checkConflictsRoute = createRoute({
  method: 'post',
  path: '/v1/commits-v4/{hash}/check-conflicts',
  tags: ['Commits V4'],
  summary: 'Detect cross-conversation conflicts for a commit',
  request: { params: HashParamSchema },
  responses: {
    200: {
      description: 'Conflict report',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              conflicts: z.array(ConflictCandidateSchema),
              checked_count: z.number(),
            })
          ),
        },
      },
    },
    404: {
      description: 'Commit not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    400: {
      description: 'Embedder not configured or invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

commitsV4Routes.openapi(checkConflictsRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);

  try {
    const embedder = getEmbedder();
    if (!embedder) {
      return errorResponse(c, 'SEMANTIC_NOT_SUPPORTED', 'No embedding provider configured');
    }

    const db = await getDB();
    const commit = await findCommitV4ByHash(db, decodedHash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }

    const sentences = commit.content.sentences;
    if (sentences.length === 0) {
      return c.json({ success: true as const, data: { conflicts: [], checked_count: 0 } }, 200);
    }

    // Batch-encode all new sentence texts in a single embedder call
    const sentenceTexts = sentences.map((s) => s.text);
    const sentenceEmbeddings = await embedder.encode(sentenceTexts);

    // Fetch existing project sentences with embeddings via similarity search
    // For each new sentence, search for similar existing sentences (excluding this commit)
    const existingSentences: Array<{
      id: string;
      text: string;
      commit_hash: string;
      embedding: number[];
    }> = [];
    const seen = new Set<string>();

    // Collect all unique existing sentence records that need embeddings
    const existingTextsToEmbed: Array<{ id: string; text: string; commit_hash: string }> = [];

    for (let i = 0; i < sentences.length; i++) {
      const results = await searchSimilarSentences(
        db,
        commit.project_id ?? '',
        sentenceEmbeddings[i],
        10,
        decodedHash
      );
      for (const r of results) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          existingTextsToEmbed.push({ id: r.id, text: r.text, commit_hash: r.commit_hash });
        }
      }
    }

    // Batch-encode all unique existing sentence texts in a single embedder call
    if (existingTextsToEmbed.length > 0) {
      const existingEmbeddings = await embedder.encode(existingTextsToEmbed.map((r) => r.text));
      for (let i = 0; i < existingTextsToEmbed.length; i++) {
        existingSentences.push({
          ...existingTextsToEmbed[i],
          embedding: existingEmbeddings[i],
        });
      }
    }

    const report = await detectConflicts(sentences, existingSentences, embedder);

    return c.json({ success: true as const, data: report }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'INTERNAL_ERROR', message);
  }
});

export default commitsV4Routes;
