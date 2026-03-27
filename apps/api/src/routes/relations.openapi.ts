/**
 * Sentence Relations Routes (Inter-sentence Relations)
 *
 * - GET  /v1/commits/:hash/relations           — Get relations for a commit
 * - POST /v1/commits/:hash/relations/extract    — Trigger (re-)extraction
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { createRelationExtractor } from '@t3x-dev/core';
import {
  deleteRelationsByCommit,
  findRelationsByCommit,
  getCommitUnified,
  upsertRelations,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { getLLMProvider } from '../lib/provider-registry';
import { getUserId, recordUsageFireAndForget, wrapWithUsageTracking } from '../lib/usage-tracking';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema } from '../schemas/common';

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
    'temporal_follows',
    'conditions',
    'summarizes',
    'follows',
    'depends',
  ]),
  confidence: z.number(),
  reasoning: z.string(),
});

const CommitHashParam = z.object({
  hash: z.string().openapi({ description: 'Commit hash (URL-encoded)' }),
});

// ── GET /v1/commits/:hash/relations ───────────────────────

const getRelationsRoute = createRoute({
  method: 'get',
  path: '/v1/commits/{hash}/relations',
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
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

relationsRoutes.openapi(getRelationsRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);
  try {
    const db = await getDB();
    const commit = await getCommitUnified(db, decodedHash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }
    // Verify project ownership
    if (commit.project_id) {
      const accessResult = await assertProjectAccess(c, db, commit.project_id);
      if (accessResult instanceof Response) return accessResult;
    }
    const relations = await findRelationsByCommit(db, decodedHash);
    return c.json({ success: true as const, data: { relations } }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GET_FAILED', message);
  }
});

// ── POST /v1/commits/:hash/relations/extract ──────────────

const extractRelationsRoute = createRoute({
  method: 'post',
  path: '/v1/commits/{hash}/relations/extract',
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
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    400: {
      description: 'LLM provider not available',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Extraction failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

relationsRoutes.openapi(extractRelationsRoute, async (c) => {
  const { hash } = c.req.valid('param');
  const decodedHash = decodeURIComponent(hash);
  try {
    const db = await getDB();
    const commit = await getCommitUnified(db, decodedHash);
    if (!commit) {
      return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${decodedHash}`);
    }
    if (!commit.project_id) {
      return errorResponse(c, 'INVALID_REQUEST', 'Commit has no project_id');
    }
    // Verify project ownership
    const accessResult = await assertProjectAccess(c, db, commit.project_id);
    if (accessResult instanceof Response) return accessResult;
    const projectId = commit.project_id;
    const provider = await getLLMProvider();
    if (!provider) {
      return errorResponse(
        c,
        'LLM_NOT_CONFIGURED',
        'No LLM provider configured. Set ANTHROPIC_API_KEY or another provider key.'
      );
    }
    const flat = (await import('@t3x-dev/core')).flattenTrees(commit.content.trees);
    const sentences = flat.map((frame: any) => ({
      id: frame.id,
      text: `[${frame.type}] ${Object.entries(frame.slots)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : String(v)}`)
        .join('; ')}`,
    }));
    const { provider: trackedProvider, usage: trackedUsage } = wrapWithUsageTracking(provider);
    const extractor = createRelationExtractor(trackedProvider);
    const result = await extractor.extract(sentences);

    // Delete existing relations, then upsert new ones (atomic)
    await db.transaction(async (tx) => {
      await deleteRelationsByCommit(tx, decodedHash);
      if (result.relations.length > 0) {
        await upsertRelations(
          tx,
          result.relations.map((r) => ({
            id: r.id,
            project_id: projectId,
            commit_hash: decodedHash,
            source_id: r.source_id,
            target_id: r.target_id,
            type: r.type,
            confidence: r.confidence,
            reasoning: r.reasoning,
          }))
        );
      }
    });

    // Record usage (fire-and-forget)
    if (trackedUsage.inputTokens || trackedUsage.outputTokens) {
      recordUsageFireAndForget(db, {
        user_id: getUserId(c) ?? undefined,
        project_id: projectId,
        endpoint: 'relation_extract',
        model: trackedProvider.id,
        input_tokens: trackedUsage.inputTokens,
        output_tokens: trackedUsage.outputTokens,
      });
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
