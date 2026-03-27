/**
 * Search Routes
 *
 * Hybrid search endpoint combining BM25 keyword search and pgvector
 * cosine similarity with Reciprocal Rank Fusion (RRF).
 *
 * - POST /v1/search — Search sentences across a project
 *
 * Three modes:
 * - keyword: BM25 full-text search (no embedding provider needed)
 * - semantic: pgvector cosine similarity (requires embedding provider)
 * - hybrid: RRF fusion of keyword + semantic (requires embedding provider, falls back to keyword)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { searchByKeyword, searchHybrid, searchSimilarSentences } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { getEmbedder } from '../lib/embedder';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema } from '../schemas/common';

export const searchRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

// ── Schemas ──────────────────────────────────────────────────

const SearchRequestSchema = z.object({
  project_id: z.string().min(1).openapi({ description: 'Project to search in' }),
  query: z.string().min(1).max(500).openapi({ description: 'Search query text' }),
  mode: z.enum(['hybrid', 'keyword', 'semantic']).default('hybrid').openapi({
    description:
      'Search mode: hybrid (BM25+vector), keyword (BM25 only), or semantic (vector only)',
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .openapi({ description: 'Maximum results to return' }),
});

const SearchResultItemSchema = z.object({
  sentence_id: z.string(),
  commit_hash: z.string(),
  text: z.string(),
  score: z.number(),
  keyword_rank: z.number().nullable(),
  vector_rank: z.number().nullable(),
});

const SearchResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    results: z.array(SearchResultItemSchema),
    total: z.number(),
    mode: z.enum(['hybrid', 'keyword', 'semantic']),
    query_time_ms: z.number(),
  }),
});

// ── POST /v1/search ──────────────────────────────────────────

const searchRoute = createRoute({
  method: 'post',
  path: '/v1/search',
  tags: ['Search'],
  summary: 'Search sentences in a project',
  description:
    'Hybrid search combining BM25 keyword search and pgvector cosine similarity ' +
    'with Reciprocal Rank Fusion (RRF). Falls back to keyword-only if embedding ' +
    'provider is not configured.',
  request: {
    body: {
      content: {
        'application/json': { schema: SearchRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Search results',
      content: { 'application/json': { schema: SearchResponseSchema } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Search failed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

searchRoutes.openapi(searchRoute, async (c) => {
  const { project_id, query, mode, limit } = c.req.valid('json');
  const start = performance.now();

  try {
    const db = await getDB();
    if (project_id) {
      const accessResult = await assertProjectAccess(c, db, project_id);
      if (accessResult instanceof Response) return accessResult;
    }

    let effectiveMode = mode;

    // Determine if embedding provider is available
    const embedder = getEmbedder();
    if ((mode === 'semantic' || mode === 'hybrid') && !embedder) {
      if (mode === 'semantic') {
        return errorResponse(
          c,
          'EMBEDDER_NOT_CONFIGURED',
          'Semantic search requires an embedding provider. Set GOOGLE_AI_STUDIO_KEY or use mode=keyword.'
        );
      }
      // hybrid → fall back to keyword
      effectiveMode = 'keyword';
    }

    interface ResultItem {
      sentence_id: string;
      commit_hash: string;
      text: string;
      score: number;
      keyword_rank: number | null;
      vector_rank: number | null;
    }
    let results: ResultItem[];

    if (effectiveMode === 'keyword') {
      const kwResults = await searchByKeyword(db, project_id, query, limit);
      results = kwResults.map((r, idx) => ({
        sentence_id: r.id,
        commit_hash: r.commit_hash,
        text: r.text,
        score: r.keyword_score,
        keyword_rank: idx + 1,
        vector_rank: null,
      }));
    } else if (effectiveMode === 'semantic') {
      const queryEmbedding = await embedder!.encode([query]);
      const vecResults = await searchSimilarSentences(db, project_id, queryEmbedding[0], limit);
      results = vecResults.map((r, idx) => ({
        sentence_id: r.id,
        commit_hash: r.commit_hash,
        text: r.text,
        score: r.similarity,
        keyword_rank: null,
        vector_rank: idx + 1,
      }));
    } else {
      // hybrid
      const queryEmbedding = await embedder!.encode([query]);
      const hybridResults = await searchHybrid(db, project_id, query, queryEmbedding[0], limit);
      results = hybridResults.map((r) => ({
        sentence_id: r.id,
        commit_hash: r.commit_hash,
        text: r.text,
        score: r.score,
        keyword_rank: r.keyword_rank,
        vector_rank: r.vector_rank,
      }));
    }

    const elapsed = Math.round((performance.now() - start) * 100) / 100;

    return c.json(
      {
        success: true as const,
        data: {
          results,
          total: results.length,
          mode: effectiveMode as 'hybrid' | 'keyword' | 'semantic',
          query_time_ms: elapsed,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'SEARCH_FAILED', message);
  }
});
