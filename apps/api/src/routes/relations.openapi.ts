/**
 * Sentence Relations Routes (Ring 4)
 *
 * - GET  /v1/commits-v4/:hash/relations           — Get relations for a commit
 * - POST /v1/commits-v4/:hash/relations/extract    — Trigger (re-)extraction
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { createRelationExtractor } from '@t3x/core';
import {
  deleteRelationsByCommit,
  findCommitV4ByHash,
  findRelationsByCommit,
  upsertRelations,
} from '@t3x/storage/pglite';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getLLMProvider } from '../lib/provider-registry';
import { pinoLogger } from '../middleware/logger';

export const relationsRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ── Schemas ──────────────────────────────────────────────────

const RelationSchema = z.object({
  id: z.string(),
  source_id: z.string(),
  target_id: z.string(),
  type: z.enum([
    'supports',
    'contrasts',
    'causes',
    'elaborates',
    'temporal_follows',
    'conditions',
    'summarizes',
  ]),
  confidence: z.number(),
  reasoning: z.string(),
});

const CommitHashParam = z.object({
  hash: z.string().openapi({ description: 'Commit hash (URL-encoded)' }),
});

// ── GET /v1/commits-v4/:hash/relations ───────────────────────

const getRelationsRoute = createRoute({
  method: 'get',
  path: '/v1/commits-v4/{hash}/relations',
  tags: ['Relations'],
  summary: 'Get inter-sentence relations for a commit',
  request: { params: CommitHashParam },
  responses: {
    200: {
      description: 'Relations found',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({ relations: z.array(RelationSchema) }),
          }),
        },
      },
    },
    404: {
      description: 'Commit not found',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
  },
});

relationsRoutes.openapi(getRelationsRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);
  try {
    const db = await getDB();
    const commit = await findCommitV4ByHash(db, decodedHash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }
    const relations = await findRelationsByCommit(db, decodedHash);
    return c.json({ success: true as const, data: { relations } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// ── POST /v1/commits-v4/:hash/relations/extract ──────────────

const extractRelationsRoute = createRoute({
  method: 'post',
  path: '/v1/commits-v4/{hash}/relations/extract',
  tags: ['Relations'],
  summary: 'Extract (or re-extract) inter-sentence relations for a commit',
  description:
    'Triggers LLM-based relation extraction on the committed sentences. ' +
    'Idempotent: replaces any existing relations for this commit.',
  request: { params: CommitHashParam },
  responses: {
    200: {
      description: 'Relations extracted',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            data: z.object({
              relations_found: z.number(),
              stats: z.object({
                total_sentences: z.number(),
                relations_found: z.number(),
                avg_confidence: z.number(),
                extraction_time_ms: z.number(),
              }),
            }),
          }),
        },
      },
    },
    404: {
      description: 'Commit not found',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    400: {
      description: 'LLM provider not available',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
    500: {
      description: 'Extraction failed',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(false),
            error: z.object({ code: z.string(), message: z.string() }),
          }),
        },
      },
    },
  },
});

relationsRoutes.openapi(extractRelationsRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);
  try {
    const db = await getDB();
    const commit = await findCommitV4ByHash(db, decodedHash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }
    const provider = await getLLMProvider();
    if (!provider) {
      return errorResponse(
        c,
        'LLM_NOT_CONFIGURED',
        'No LLM provider configured. Set ANTHROPIC_API_KEY or another provider key.'
      );
    }
    const sentences = commit.content.sentences.map((s) => ({ id: s.id, text: s.text }));
    const extractor = createRelationExtractor(provider);
    const result = await extractor.extract(sentences);

    if (!commit.project_id) {
      return errorResponse(c, 'INVALID_REQUEST', 'Commit has no project_id');
    }

    // Delete existing relations, then upsert new ones
    await deleteRelationsByCommit(db, decodedHash);
    if (result.relations.length > 0) {
      await upsertRelations(
        db,
        result.relations.map((r) => ({
          id: r.id,
          project_id: commit.project_id,
          commit_hash: decodedHash,
          source_id: r.source_id,
          target_id: r.target_id,
          type: r.type,
          confidence: r.confidence,
          reasoning: r.reasoning,
        }))
      );
    }
    return c.json(
      {
        success: true as const,
        data: { relations_found: result.relations.length, stats: result.stats },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    pinoLogger.error({ err, hash: decodedHash }, 'relation extraction failed');
    return errorResponse(c, 'EXTRACTION_FAILED', message);
  }
});
