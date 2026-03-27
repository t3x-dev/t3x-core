/**
 * Drafts Workflow Routes
 *
 * Heavier workflow operations for Draft management.
 * - POST /v1/drafts/:id/preview  - Generate preview output
 * - POST /v1/drafts/:id/commit   - Commit draft to knowledge base
 * - POST /v1/drafts/:id/fork     - Fork a committed draft
 * - POST /v1/drafts/:id/extract  - Extract sentences from conversation
 * - POST /v1/drafts/:id/suggest  - Get sentence suggestions
 */

import { createHash } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  generateLeafOutput,
  generateSentenceId,
  isGenerationConfigured,
} from '@t3x-dev/core';
import {
  commitDraft,
  createCommit,
  createLeaf,
  findDraftById,
  forkDraft,
  searchSimilarSentences,
  updateDraft,
  updateDraftPreview,
  upsertSentenceVectorsBatch,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { getEmbedder } from '../lib/embedder';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import {
  CommitDraftRequest,
  CommitDraftResponse,
  DraftResponse,
  PreviewDraftRequest,
  PreviewDraftResponse,
  SuggestDraftRequest,
  SuggestDraftResponse,
} from '../schemas/contracts';
import { toApiDraft } from './drafts-crud.openapi';

export const draftsWorkflowRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// In-memory state (shared with CRUD for delete cleanup)
// ============================================================

export const previewDebounce = new Map<string, number>();

export const previewCache = new Map<
  string,
  { hash: string; output: string; model: string; tokens: number; time: number }
>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_MS = 1000; // 1 second

// ============================================================
// Route Definitions
// ============================================================

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
    201: {
      description: 'Draft committed and new commit created',
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

// POST /v1/drafts/:id/preview
draftsWorkflowRoutes.openapi(previewDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Get draft
    const draft = await findDraftById(db, id);
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

    // biome-ignore lint/suspicious/noExplicitAny: draft.nodes is loosely typed from storage
    const includedNodes = (draft.nodes as any[]).filter((s: any) => s.included);
    if (includedNodes.length === 0) {
      return errorResponse(c, 'INVALID_REQUEST', 'Draft has no included nodes');
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
      sentences: includedNodes.map((s) => s.text).sort(),
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
        trees: includedNodes.map((s: any) => ({
          key: s.id,
          slots: { text: s.text },
          children: [],
        })),
        relations: [],
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
      knowledge: virtualCommit.content as any,
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

    await updateDraftPreview(db, id, result.output);

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
draftsWorkflowRoutes.openapi(commitDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Get draft
    const draft = await findDraftById(db, id);
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

    // 3. Convert to Sentences (branch by extraction_mode)
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
      // LLM mode: convert staged SemanticPoints directly to sentence-like records
      const activeSPs = ((draft.semantic_points ?? []) as Array<{
        id: string;
        text: string;
        confidence?: number;
        zone: string;
        status: string;
        staged: boolean;
        evidence?: Array<{
          conversation_id?: string;
          turn_hash?: string;
          start_char?: number;
          end_char?: number;
          role?: string;
        }>;
      }>).filter(
        (sp) => sp.zone === 'ready' && sp.status !== 'undone' && sp.staged
      );

      if (activeSPs.length === 0) {
        return errorResponse(c, 'INVALID_REQUEST', 'No staged semantic points to commit');
      }

      sentences = activeSPs.map((sp) => {
        const primary = sp.evidence?.find((e) => e.conversation_id && e.turn_hash);
        return {
          id: sp.id,
          text: sp.text,
          confidence: sp.confidence,
          source_ref: primary ? {
            conversation_id: primary.conversation_id!,
            turn_hash: primary.turn_hash!,
            start_char: primary.start_char ?? 0,
            end_char: primary.end_char ?? sp.text.length,
          } : undefined,
        };
      });
    } else {
      // Deterministic mode: existing DraftNode flow
      // biome-ignore lint/suspicious/noExplicitAny: draft.nodes is loosely typed from storage
      const includedNodes = (draft.nodes as any[]).filter((s: any) => s.included);
      if (includedNodes.length === 0) {
        return errorResponse(c, 'INVALID_REQUEST', 'Draft has no included nodes');
      }

      sentences = includedNodes.map((ds: any) => {
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

    // 5. Create commit (convert sentences to legacy_sentence frames)
    const commitFrames = sentences.map((s, i) => ({
      id: s.id || `f_${String(i + 1).padStart(3, '0')}`,
      type: 'legacy_sentence' as const,
      slots: { text: s.text },
      confidence: s.confidence,
    }));
    const commit = await createCommit(db, {
      parents,
      author: { type: 'human' as const, name: 'workbench' },
      content: { trees: commitFrames.map((f: any) => ({ key: f.id, slots: f.slots, children: [] as any[], confidence: f.confidence })), relations: [] },
      project_id: draft.project_id,
      message: body?.message ?? `Draft: ${draft.title}`,
      branch: draft.target_branch ?? 'main',
      provenance: { method: 'human_curation' },
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
    await commitDraft(db, id, commit.hash, leaf?.id);

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
        pinoLogger.warn({ err: embErr }, 'failed to populate sentence vectors');
      }
    }

    // 8. Build response
    const commitResponse = {
      hash: commit.hash,
      schema: commit.schema,
      parents: commit.parents,
      author: commit.author,
      committed_at: commit.committed_at,
      content: commit.content,
      project_id: commit.project_id ?? null,
      message: commit.message ?? null,
      branch: commit.branch ?? null,
      provenance: commit.provenance ?? null,
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
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// POST /v1/drafts/:id/fork
draftsWorkflowRoutes.openapi(forkDraftRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const forked = await forkDraft(db, id);

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
draftsWorkflowRoutes.openapi(extractDraftRoute, async (c) => {
  // Sentence extraction is deprecated (replaced by frame-based extraction).
  // Use POST /v1/extract/frames + POST /v1/extract/incremental instead.
  return errorResponse(
    c,
    'DEPRECATED',
    'Sentence extraction from conversation has been replaced by frame-based extraction. Use /v1/extract/frames instead.'
  );
});

// POST /v1/drafts/:id/suggest
draftsWorkflowRoutes.openapi(suggestDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Get draft
    const draft = await findDraftById(db, id);
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
    const draftTexts = new Set((draft.nodes as any[]).map((s: any) => s.text));
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
