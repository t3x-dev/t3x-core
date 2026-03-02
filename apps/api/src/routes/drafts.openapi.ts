/**
 * Drafts V3 Routes (Workbench)
 *
 * REST API endpoints for Draft management with OpenAPI documentation.
 * Drafts are pre-commit working areas where users compose sentences,
 * add constraints, preview output, then commit.
 *
 * Endpoints:
 * - POST   /v1/drafts                - Create a new draft
 * - GET    /v1/drafts                - List drafts by project
 * - GET    /v1/drafts/:id            - Get draft by ID
 * - PATCH  /v1/drafts/:id            - Update draft (optimistic lock)
 * - DELETE /v1/drafts/:id            - Delete draft
 * - POST   /v1/drafts/:id/preview    - Generate preview output
 * - POST   /v1/drafts/:id/commit     - Commit draft to knowledge base
 * - POST   /v1/drafts/:id/fork       - Fork a committed draft
 */

import { createHash } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Draft, SemanticPoint } from '@t3x/core';
import {
  generateLeafOutput,
  generateSentenceId,
  isGenerationConfigured,
  spToSentence,
} from '@t3x/core';
import {
  ConflictError,
  commitDraftV3,
  createCommitV4,
  createLeaf,
  deleteDraftV3,
  findDraftV3ById,
  forkDraftV3,
  insertAutoDraftV3,
  insertDraftV3,
  listDraftV3ByProject,
  promoteDraftV3,
  searchSimilarSentences,
  updateDraftV3,
  updateDraftV3Preview,
  upsertSentenceVectorsBatch,
} from '@t3x/storage/pglite';
import { getDB } from '../lib/db';
import { getEmbedder } from '../lib/embedder';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import {
  CommitDraftRequest,
  CommitDraftResponse,
  CreateDraftRequest,
  DraftResponse,
  PreviewDraftRequest,
  PreviewDraftResponse,
  ReviewActionRequest,
  ReviewActionResponse,
  SuggestDraftRequest,
  SuggestDraftResponse,
  UpdateDraftRequest,
} from '../schemas/v4-contracts';
import { extractSentencesFromConversation } from './extract.openapi';

export const draftsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Response helpers
// ============================================================

function toApiDraft(draft: Draft) {
  return {
    id: draft.id,
    project_id: draft.project_id,
    title: draft.title,
    goal: draft.goal ?? null,
    parent_commit_hash: draft.parent_commit_hash ?? null,
    forked_from: draft.forked_from ?? null,
    sentences: draft.sentences ?? [],
    constraints: draft.constraints ?? [],
    instructions: draft.instructions ?? null,
    preview_type: draft.preview_type ?? null,
    preview_output: draft.preview_output ?? null,
    preview_generated_at: draft.preview_generated_at ?? null,
    status: draft.status,
    committed_as: draft.committed_as ?? null,
    committed_leaf_id: draft.committed_leaf_id ?? null,
    target_branch: draft.target_branch ?? null,
    revision: draft.revision,
    created_at: draft.created_at,
    updated_at: draft.updated_at,
    extraction_mode: draft.extraction_mode ?? null,
    semantic_points: draft.semantic_points ?? null,
    extraction_cursor: draft.extraction_cursor ?? null,
  };
}

// ============================================================
// Route Definitions
// ============================================================

// POST /v1/drafts
const createDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts',
  tags: ['Drafts'],
  summary: 'Create a new draft',
  request: {
    body: {
      content: { 'application/json': { schema: CreateDraftRequest } },
    },
  },
  responses: {
    201: {
      description: 'Draft created',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /v1/drafts
const listDraftsRoute = createRoute({
  method: 'get',
  path: '/v1/drafts',
  tags: ['Drafts'],
  summary: 'List drafts by project',
  request: {
    query: z.object({
      project_id: z.string().min(1),
      status: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: 'List of drafts',
      content: { 'application/json': { schema: SuccessResponseSchema(z.array(DraftResponse)) } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /v1/drafts/:id
const getDraftRoute = createRoute({
  method: 'get',
  path: '/v1/drafts/{id}',
  tags: ['Drafts'],
  summary: 'Get draft by ID',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Draft found',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// PATCH /v1/drafts/:id
const updateDraftRoute = createRoute({
  method: 'patch',
  path: '/v1/drafts/{id}',
  tags: ['Drafts'],
  summary: 'Update draft (optimistic lock)',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: UpdateDraftRequest } },
    },
  },
  responses: {
    200: {
      description: 'Draft updated',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Revision conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// DELETE /v1/drafts/:id
const deleteDraftRoute = createRoute({
  method: 'delete',
  path: '/v1/drafts/{id}',
  tags: ['Drafts'],
  summary: 'Delete draft',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Draft deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ deleted: z.literal(true), id: z.string() })),
        },
      },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/drafts/:id/preview
const previewDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/preview',
  tags: ['Drafts'],
  summary: 'Generate preview output',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: PreviewDraftRequest } },
      required: false,
    },
  },
  responses: {
    200: {
      description: 'Preview generated',
      content: { 'application/json': { schema: PreviewDraftResponse } },
    },
    400: {
      description: 'Invalid state',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    429: {
      description: 'Too many requests (debounce)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/drafts/:id/commit
const commitDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/commit',
  tags: ['Drafts'],
  summary: 'Commit draft',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: CommitDraftRequest } },
      required: false,
    },
  },
  responses: {
    200: {
      description: 'Draft committed',
      content: { 'application/json': { schema: CommitDraftResponse } },
    },
    400: {
      description: 'Invalid state',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/drafts/:id/fork
const forkDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/fork',
  tags: ['Drafts'],
  summary: 'Fork a committed draft',
  request: { params: IdParamSchema },
  responses: {
    201: {
      description: 'Draft forked',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    400: {
      description: 'Draft not committed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/drafts/:id/extract
const extractDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/extract',
  tags: ['Drafts'],
  summary: 'Extract sentences from conversation and add to draft',
  request: {
    params: IdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            conversation_id: z.string().min(1),
            options: z
              .object({
                max_sentences: z.number().int().min(1).max(100).optional(),
              })
              .optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Sentences extracted and added to draft',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              added_count: z.number(),
              draft: DraftResponse,
            })
          ),
        },
      },
    },
    400: {
      description: 'Invalid state',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    503: {
      description: 'LLM provider not configured',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/drafts/:id/suggest
const suggestDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/suggest',
  tags: ['Drafts'],
  summary: 'Get sentence suggestions based on draft goal',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: SuggestDraftRequest } },
      required: false,
    },
  },
  responses: {
    200: {
      description: 'Suggestions returned',
      content: { 'application/json': { schema: SuggestDraftResponse } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    501: {
      description: 'Embedding service not configured',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/drafts
draftsRoutes.openapi(createDraftRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const draft = await insertDraftV3(db, {
      project_id: body.project_id,
      title: body.title,
      goal: body.goal,
      parent_commit_hash: body.parent_commit_hash,
      target_branch: body.target_branch,
      preview_type: body.preview_type,
    });

    return c.json({ success: true as const, data: toApiDraft(draft) }, 201);
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      return errorResponse(c, 'REFERENCE_NOT_FOUND', 'Referenced project not found');
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// GET /v1/drafts
draftsRoutes.openapi(listDraftsRoute, async (c) => {
  const { project_id, status, limit, offset } = c.req.valid('query');

  try {
    const db = await getDB();
    const drafts = await listDraftV3ByProject(db, project_id, { status, limit, offset });

    return c.json({ success: true as const, data: drafts.map(toApiDraft) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'LIST_FAILED', message);
  }
});

// GET /v1/drafts/:id
draftsRoutes.openapi(getDraftRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const draft = await findDraftV3ById(db, id);

    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft not found: ${id}`);
    }

    return c.json({ success: true as const, data: toApiDraft(draft) }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// PATCH /v1/drafts/:id
draftsRoutes.openapi(updateDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const { if_revision, ...updateFields } = body;

  try {
    const db = await getDB();
    const draft = await updateDraftV3(db, id, updateFields, if_revision);

    return c.json({ success: true as const, data: toApiDraft(draft) }, 200);
  } catch (err) {
    if (err instanceof ConflictError) {
      return c.json(
        {
          success: false as const,
          error: { code: 'CONFLICT', message: err.message },
        },
        409
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'UPDATE_FAILED', message);
  }
});

// DELETE /v1/drafts/:id
draftsRoutes.openapi(deleteDraftRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const draft = await findDraftV3ById(db, id);
    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft not found: ${id}`);
    }

    await deleteDraftV3(db, id);

    return c.json({ success: true as const, data: { deleted: true as const, id } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'DELETE_FAILED', message);
  }
});

// ============================================================
// Preview / Commit / Fork Handlers
// ============================================================

// In-memory debounce tracking
const previewDebounce = new Map<string, number>();

// In-memory preview cache (draftId → { hash, output, model, tokens, time })
const previewCache = new Map<
  string,
  { hash: string; output: string; model: string; tokens: number; time: number }
>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_MS = 1000; // 1 second

// POST /v1/drafts/:id/preview
draftsRoutes.openapi(previewDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Get draft
    const draft = await findDraftV3ById(db, id);
    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft not found: ${id}`);
    }

    // 2. Validate state
    if (draft.status !== 'editing') {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Draft status is '${draft.status}', must be 'editing'`
      );
    }

    const includedSentences = draft.sentences.filter((s) => s.included);
    if (includedSentences.length === 0) {
      return errorResponse(c, 'INVALID_REQUEST', 'Draft has no included sentences');
    }

    // 3. Check generation configured
    if (!isGenerationConfigured()) {
      return errorResponse(c, 'GENERATION_NOT_CONFIGURED', 'ANTHROPIC_API_KEY not set');
    }

    // 4. Debounce check
    const now = Date.now();
    const lastRequest = previewDebounce.get(id) ?? 0;
    if (now - lastRequest < DEBOUNCE_MS) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Please wait before requesting another preview',
          },
        },
        429
      );
    }
    previewDebounce.set(id, now);

    // 5. Compute cache key
    const previewType = body?.preview_type ?? draft.preview_type ?? 'tweet';
    const cacheInput = JSON.stringify({
      sentences: includedSentences.map((s) => s.text).sort(),
      constraints: draft.constraints,
      instructions: draft.instructions,
      preview_type: previewType,
    });
    const cacheHash = createHash('sha256').update(cacheInput).digest('hex');

    // 6. Cache check
    const cached = previewCache.get(id);
    if (cached && cached.hash === cacheHash && now - cached.time < CACHE_TTL_MS) {
      return c.json(
        {
          success: true as const,
          data: {
            output: cached.output,
            model_used: cached.model,
            token_count: cached.tokens,
            cached: true,
          },
        },
        200
      );
    }

    // 7. Build virtual commit + leaf for generation
    const virtualCommit = {
      hash: 'virtual:preview',
      schema: 't3x/commit/v4' as const,
      parents: [],
      author: { type: 'human' as const, name: 'preview' },
      committed_at: new Date().toISOString(),
      content: {
        sentences: includedSentences.map((s) => ({
          id: s.id,
          text: s.text,
        })),
      },
    };

    const virtualLeaf = {
      id: 'virtual:leaf',
      commit_hash: 'virtual:preview',
      type: previewType as 'tweet',
      constraints: draft.constraints.map((c) => ({
        ...c,
        id: c.id,
        match_mode: c.match_mode as 'exact' | 'semantic',
      })),
      config: {},
      project_id: draft.project_id,
      created_at: new Date().toISOString(),
    };

    // 8. Resolve model
    const MODEL_MAP: Record<string, string> = {
      haiku: 'claude-haiku-4-5-20251001',
      sonnet: 'claude-sonnet-4-6',
      opus: 'claude-opus-4-6',
    };
    const requestedModel = body?.model;
    const modelId = requestedModel
      ? (MODEL_MAP[requestedModel] ?? MODEL_MAP.haiku)
      : MODEL_MAP.haiku;

    // 9. Generate
    const result = await generateLeafOutput({
      commit: virtualCommit,
      leaf: virtualLeaf,
      additionalInstructions: draft.instructions,
      model: modelId,
      temperature: 0,
    });

    // 10. Cache + store
    const tokenCount = Math.ceil(result.output.length / 4); // rough estimate
    previewCache.set(id, {
      hash: cacheHash,
      output: result.output,
      model: result.model,
      tokens: tokenCount,
      time: now,
    });

    await updateDraftV3Preview(db, id, result.output);

    return c.json(
      {
        success: true as const,
        data: {
          output: result.output,
          model_used: result.model,
          token_count: tokenCount,
          cached: false,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GENERATION_FAILED', message);
  }
});

// POST /v1/drafts/:id/commit
draftsRoutes.openapi(commitDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Get draft
    const draft = await findDraftV3ById(db, id);
    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft not found: ${id}`);
    }

    // 2. Validate state
    if (draft.status !== 'editing') {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Draft status is '${draft.status}', must be 'editing'`
      );
    }

    // 3. Convert to CommitV4 Sentences (branch by extraction_mode)
    let sentences: Array<{
      id: string;
      text: string;
      confidence?: number;
      source_ref?: {
        conversation_id: string;
        turn_hash: string;
        start_char: number;
        end_char: number;
      };
      supporting_refs?: Array<{
        conversation_id: string;
        turn_hash: string;
        start_char: number;
        end_char: number;
      }>;
      anchor_type?: 'verbatim' | 'paraphrase' | 'inference';
    }>;

    if (draft.extraction_mode === 'llm') {
      // LLM mode: convert staged SemanticPoints to SentenceV5
      const activeSPs = ((draft.semantic_points ?? []) as SemanticPoint[]).filter(
        (sp) => sp.zone === 'ready' && sp.status !== 'undone' && sp.staged
      );

      if (activeSPs.length === 0) {
        return errorResponse(c, 'INVALID_REQUEST', 'No staged semantic points to commit');
      }

      sentences = activeSPs.map((sp) => spToSentence(sp));
    } else {
      // Deterministic mode: existing DraftSentence flow
      const includedSentences = draft.sentences.filter((s) => s.included);
      if (includedSentences.length === 0) {
        return errorResponse(c, 'INVALID_REQUEST', 'Draft has no included sentences');
      }

      sentences = includedSentences.map((ds) => {
        const confidence = ds.origin.type === 'extracted' ? ds.origin.confidence : 1.0;

        const sourceRef =
          ds.source && (ds.origin.type === 'extracted' || ds.origin.type === 'selected')
            ? {
                conversation_id: ds.source.conversation_id,
                turn_hash: ds.source.turn_hash,
                start_char: ds.source.start_char,
                end_char: ds.source.end_char,
              }
            : undefined;

        return {
          id: generateSentenceId(),
          text: ds.text,
          confidence,
          source_ref: sourceRef,
        };
      });
    }

    // 4. Set parents
    const parents = draft.parent_commit_hash ? [draft.parent_commit_hash] : [];

    // 5. Create CommitV4
    const commit = await createCommitV4(db, {
      parents,
      author: { type: 'human', name: 'workbench' },
      sentences,
      project_id: draft.project_id,
      message: body?.message ?? `Draft: ${draft.title}`,
      branch: draft.target_branch ?? 'main',
    });

    // 6. Optionally create Leaf (if constraints or preview_type exist)
    let leaf = null;
    if (draft.constraints.length > 0 || draft.preview_type) {
      const leafConstraints = draft.constraints.map((dc) => ({
        id: dc.id.replace(/^dc_/, 'cst_'),
        type: dc.type as 'require' | 'exclude',
        match_mode: dc.match_mode as 'exact' | 'semantic',
        value: dc.value,
        reason: dc.reason,
      }));

      leaf = await createLeaf(db, {
        commit_hash: commit.hash,
        type: (draft.preview_type ?? 'tweet') as 'tweet',
        title: draft.title,
        constraints: leafConstraints,
        config: {},
        project_id: draft.project_id,
      });
    }

    // 7. Update draft status
    await commitDraftV3(db, id, commit.hash, leaf?.id);

    // 7b. Populate sentence vectors (best-effort — errors are swallowed)
    const embedder = getEmbedder();
    if (embedder) {
      try {
        const texts = sentences.map((s) => s.text);
        const embeddings = await embedder.encode(texts);
        if (embeddings.length !== texts.length) {
          throw new Error(
            `Embedding count mismatch: expected ${texts.length}, got ${embeddings.length}`
          );
        }
        await upsertSentenceVectorsBatch(
          db,
          sentences.map((s, i) => ({
            id: s.id,
            projectId: draft.project_id,
            commitHash: commit.hash,
            text: s.text,
            embedding: embeddings[i],
            modelId: embedder.id,
          }))
        );
      } catch (embErr) {
        // Non-fatal: log and continue
        pinoLogger.warn({ err: embErr }, "failed to populate sentence vectors");
      }
    }

    // 8. Build response
    const commitResponse = {
      hash: commit.hash,
      schema: commit.schema as 't3x/commit/v4',
      parents: commit.parents,
      author: commit.author,
      committed_at: commit.committed_at,
      content: commit.content,
      project_id: commit.project_id ?? null,
      message: commit.message ?? null,
      branch: commit.branch ?? null,
      source_refs: commit.source_refs ?? null,
      position_x: commit.position_x ?? null,
      position_y: commit.position_y ?? null,
      created_at: commit.created_at ?? new Date().toISOString(),
    };

    const leafResponse = leaf
      ? {
          id: leaf.id,
          commit_hash: leaf.commit_hash,
          type: leaf.type,
          title: leaf.title ?? null,
          constraints: leaf.constraints ?? [],
          config: leaf.config ?? {},
          output: leaf.output ?? null,
          generated_at: leaf.generated_at ?? null,
          assertions: leaf.assertions ?? null,
          project_id: leaf.project_id,
          created_at: leaf.created_at,
          created_by: leaf.created_by ?? null,
        }
      : null;

    return c.json(
      {
        success: true as const,
        data: {
          commit: commitResponse,
          leaf: leafResponse,
          draft_status: 'committed' as const,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// POST /v1/drafts/:id/fork
draftsRoutes.openapi(forkDraftRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const forked = await forkDraftV3(db, id);

    return c.json({ success: true as const, data: toApiDraft(forked) }, 201);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return errorResponse(c, 'NOT_FOUND', err.message);
      }
      if (err.message.includes('Cannot fork')) {
        return errorResponse(c, 'INVALID_REQUEST', err.message);
      }
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// POST /v1/drafts/:id/extract
draftsRoutes.openapi(extractDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Get draft
    const draft = await findDraftV3ById(db, id);
    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft not found: ${id}`);
    }

    // 2. Validate state
    if (draft.status !== 'editing') {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Draft status is '${draft.status}', must be 'editing'`
      );
    }

    // 3. Extract sentences (position offset = current sentence count)
    const positionOffset = draft.sentences.length;
    const result = await extractSentencesFromConversation(
      body.conversation_id,
      body.options,
      positionOffset
    );

    if (result.sentences.length === 0) {
      return c.json(
        { success: true as const, data: { added_count: 0, draft: toApiDraft(draft) } },
        200
      );
    }

    // 4. Append extracted sentences to draft
    const updatedSentences = [...draft.sentences, ...result.sentences];

    const updatedDraft = await updateDraftV3(
      db,
      id,
      { sentences: updatedSentences },
      draft.revision
    );

    return c.json(
      {
        success: true as const,
        data: {
          added_count: result.sentences.length,
          draft: toApiDraft(updatedDraft),
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AllProvidersFailedError') {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'LLM_NOT_CONFIGURED',
            message:
              'No LLM provider is configured. Set ANTHROPIC_API_KEY or another provider key.',
          },
        },
        503
      );
    }
    if (err instanceof ConflictError) {
      return c.json(
        {
          success: false as const,
          error: { code: 'CONFLICT', message: err.message },
        },
        409
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GENERATION_FAILED', message);
  }
});

// POST /v1/drafts/:id/suggest
draftsRoutes.openapi(suggestDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Get draft
    const draft = await findDraftV3ById(db, id);
    if (!draft) {
      return errorResponse(c, 'NOT_FOUND', `Draft not found: ${id}`);
    }

    // 2. Check embedding service
    const embedder = getEmbedder();
    if (!embedder) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'EMBEDDING_NOT_CONFIGURED',
            message: 'Embedding service not configured (GOOGLE_AI_STUDIO_KEY not set)',
          },
        },
        501
      );
    }

    // 3. Need a goal to suggest
    if (!draft.goal) {
      return c.json(
        {
          success: true as const,
          data: { suggestions: [] },
        },
        200
      );
    }

    // 4. Embed goal text
    const [goalEmbedding] = await embedder.encode([draft.goal]);

    // 5. Search for similar sentences
    const limit = body?.limit ?? 10;
    const draftTexts = new Set(draft.sentences.map((s) => s.text));
    const rawResults = await searchSimilarSentences(
      db,
      draft.project_id,
      goalEmbedding,
      limit + draftTexts.size // fetch extra to account for filtering
    );

    // 6. Mark already_in_draft and filter
    const suggestions = rawResults
      .map((r) => ({
        sentence_id: r.id,
        text: r.text,
        commit_hash: r.commit_hash,
        similarity: Math.round(r.similarity * 1000) / 1000,
        already_in_draft: draftTexts.has(r.text),
      }))
      .slice(0, limit);

    return c.json(
      {
        success: true as const,
        data: { suggestions },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'SUGGEST_FAILED', message);
  }
});

// ============================================================
// Auto-Draft Endpoints (Upgrade #7)
// ============================================================

// POST /v1/drafts/auto
const createAutoDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/auto',
  tags: ['Drafts'],
  summary: 'Create auto-draft from conversation (Upgrade #7)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            project_id: z.string().min(1),
            conversation_id: z.string().min(1),
            parent_commit_hash: z.string().optional(),
            target_branch: z.string().optional(),
            options: z
              .object({
                max_sentences: z.number().int().min(1).max(100).optional(),
              })
              .optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Auto-draft created',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    503: {
      description: 'LLM provider not configured',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

draftsRoutes.openapi(createAutoDraftRoute, async (c) => {
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Extract sentences from conversation
    const result = await extractSentencesFromConversation(body.conversation_id, body.options);

    if (result.sentences.length === 0) {
      return errorResponse(c, 'INVALID_REQUEST', 'No sentences extracted from conversation');
    }

    // 2. Create auto-draft
    const draft = await insertAutoDraftV3(db, {
      project_id: body.project_id,
      conversation_id: body.conversation_id,
      title: `Auto-draft from ${body.conversation_id.slice(0, 16)}`,
      sentences: result.sentences,
      parent_commit_hash: body.parent_commit_hash,
      target_branch: body.target_branch,
    });

    return c.json({ success: true as const, data: toApiDraft(draft) }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === 'AllProvidersFailedError') {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'LLM_NOT_CONFIGURED',
            message:
              'No LLM provider is configured. Set ANTHROPIC_API_KEY or another provider key.',
          },
        },
        503
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// POST /v1/drafts/:id/promote
const promoteDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/promote',
  tags: ['Drafts'],
  summary: 'Promote auto-draft to editing status (Upgrade #7)',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Draft promoted to editing',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    400: {
      description: 'Draft not in auto status',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

draftsRoutes.openapi(promoteDraftRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const promoted = await promoteDraftV3(db, id);

    return c.json({ success: true as const, data: toApiDraft(promoted) }, 200);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return errorResponse(c, 'NOT_FOUND', err.message);
      }
      if (err.message.includes('Cannot promote')) {
        return errorResponse(c, 'INVALID_REQUEST', err.message);
      }
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'PROMOTE_FAILED', message);
  }
});

// ============================================================
// POST /v1/drafts/:id/review-action — Review zone actions
// ============================================================

const reviewActionRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/review-action',
  tags: ['Drafts'],
  summary: 'Perform a review action on a semantic point',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: ReviewActionRequest } },
    },
  },
  responses: {
    200: {
      description: 'Action applied',
      content: { 'application/json': { schema: ReviewActionResponse } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Draft or semantic point not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Conflict',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

draftsRoutes.openapi(reviewActionRoute, async (c) => {
  const { id: draftId } = c.req.valid('param');
  const { sp_id, action, edited_text } = c.req.valid('json');

  try {
    const db = await getDB();
    const draft = await findDraftV3ById(db, draftId);
    if (!draft) return errorResponse(c, 'NOT_FOUND', 'Draft not found');

    const sps = [...((draft.semantic_points ?? []) as SemanticPoint[])];
    const idx = sps.findIndex((sp) => sp.id === sp_id);
    if (idx === -1) return errorResponse(c, 'NOT_FOUND', 'Semantic point not found');

    const sp = sps[idx];

    switch (action) {
      case 'accept':
        // Move from review to ready, mark as reviewed
        sps[idx] = { ...sp, zone: 'ready', status: 'reviewed', staged: true };
        break;

      case 'accept_change':
        sps[idx] = { ...sp, zone: 'ready', status: 'modified', staged: true };
        break;

      case 'dismiss':
        // Remove from list
        sps.splice(idx, 1);
        break;

      case 'undo':
        // Mark as undone (in ready zone)
        sps[idx] = { ...sp, status: 'undone', staged: false };
        break;

      case 'edit':
        if (!edited_text) {
          return errorResponse(c, 'INVALID_REQUEST', 'edited_text required for edit action');
        }
        sps[idx] = { ...sp, text: edited_text, zone: 'ready', status: 'reviewed', staged: true };
        break;
    }

    await updateDraftV3(db, draftId, { semantic_points: sps }, draft.revision);

    return c.json(
      {
        success: true as const,
        data: { semantic_points: sps },
      },
      200
    );
  } catch (err) {
    if (err instanceof ConflictError) {
      return c.json(
        {
          success: false as const,
          error: { code: 'CONFLICT', message: err.message },
        },
        409
      );
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'REVIEW_ACTION_FAILED', message);
  }
});

export default draftsRoutes;
