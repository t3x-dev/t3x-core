/**
 * Curate Preview Routes
 *
 * POST /v1/curate/preview - Get preview of curated chunks based on cosine similarity
 *
 * This endpoint calculates which text chunks to select based on:
 * - Bridge template queries (task/schema)
 * - User intent
 * - Cosine similarity threshold (controlled by slider)
 */

import {
  cosineSimilarity,
  createGoogleAIEmbeddingProvider,
  EmbeddingProviderError,
} from '@t3x/core';
import { findConversationById, findTurnsByConversation } from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

/**
 * Create a proxy-aware fetch function
 */
function getProxyFetch() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    const agent = new ProxyAgent(proxyUrl);
    return (url: string, options?: RequestInit) =>
      undiciFetch(url, { ...options, dispatcher: agent } as Parameters<typeof undiciFetch>[1]) as Promise<Response>;
  }
  return fetch;
}

// ============================================================================
// Types
// ============================================================================

type BridgeTemplate = 'prose' | 'plan' | 'story' | 'summary' | 'refine' | 'explain' | 'clarify';

interface CuratePreviewRequest {
  project_id: string;
  source_conversation_id: string;
  bridge_id: BridgeTemplate;
  intent: string;
  cosine: number; // 0..1 slider value
  unit_title?: string;
  user_message?: string;
  source_text?: string; // Optional: if provided, skip DB lookup
}

interface Chunk {
  id: string;
  start: number;
  end: number;
  text: string;
  score: number;
  selected: boolean;
  cos_intent?: number;
}

interface CuratePreviewResponse {
  algorithm_version: string;
  keep_ratio: number;
  chunks: Chunk[];
  selected_spans: Array<{ start: number; end: number }>;
  /** The source text used for chunking - frontend should use this for tokenization */
  source_text: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Ring3 segment structure from @t3x/core
 */
interface Ring3Segment {
  segmentId: string;
  text: string;
  startChar: number;
  endChar: number;
}

/**
 * Extract chunks from turns using Ring3 segments (rule-based sentence splitting)
 * This reuses the sentence segmentation already computed by @t3x/core
 *
 * Note: Ring3 segments use `splitSentencesRuleBased()`, not Google NLP sentence boundaries.
 * @see CLAUDE.md "硬性规则：WebUI/API 必须复用 Core"
 */
function extractChunksFromTurns(
  turns: Array<{ role: string; content: string; rings?: { rings?: { ring3?: { segments?: Ring3Segment[] } } } }>
): { chunks: Array<{ id: string; start: number; end: number; text: string }>; sourceText: string } {
  const chunks: Array<{ id: string; start: number; end: number; text: string }> = [];
  const textParts: string[] = [];
  let globalOffset = 0;
  let chunkIdx = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const prefix = `[${turn.role}]: `;
    const turnText = prefix + turn.content;

    // Try to use Ring3 segments (rule-based sentence splitting)
    const segments = turn.rings?.rings?.ring3?.segments;

    if (segments && segments.length > 0) {
      // Use pre-computed sentence segments
      for (const seg of segments) {
        chunks.push({
          id: `chunk-${chunkIdx++}`,
          // Adjust offset: prefix length + segment's startChar + global offset
          start: globalOffset + prefix.length + seg.startChar,
          end: globalOffset + prefix.length + seg.endChar,
          text: seg.text,
        });
      }
    } else {
      // Fallback: treat entire turn content as one chunk (no NLP data available)
      chunks.push({
        id: `chunk-${chunkIdx++}`,
        start: globalOffset + prefix.length,
        end: globalOffset + turnText.length,
        text: turn.content,
      });
    }

    textParts.push(turnText);
    // Add separator length to offset (except for last turn)
    const separator = i < turns.length - 1 ? '\n\n' : '';
    globalOffset += turnText.length + separator.length;
  }

  // Join without trailing separator - offsets are already calculated correctly
  const sourceText = textParts.join('\n\n');
  return { chunks, sourceText };
}

/**
 * Fallback: Simple regex-based sentence splitting
 * Only used when source_text is provided directly (no turns/Ring3 data)
 */
function chunkBySentencesFallback(text: string): Array<{ id: string; start: number; end: number; text: string }> {
  const chunks: Array<{ id: string; start: number; end: number; text: string }> = [];

  // Simple sentence splitter - ONLY for fallback when no Ring3 data
  // Prefer using extractChunksFromTurns() which uses NLP-based segmentation
  const sentenceRegex = /[^.!?。！？]+[.!?。！？]+[\s]*/g;

  let match: RegExpExecArray | null;
  let idx = 0;
  let lastEnd = 0;

  while ((match = sentenceRegex.exec(text)) !== null) {
    const sentence = match[0].trim();
    if (sentence.length > 0) {
      chunks.push({
        id: `chunk-${idx++}`,
        start: match.index,
        end: match.index + match[0].length,
        text: sentence,
      });
      lastEnd = match.index + match[0].length;
    }
  }

  // Handle remaining text (no sentence ending)
  if (lastEnd < text.length) {
    const remaining = text.slice(lastEnd).trim();
    if (remaining.length > 0) {
      chunks.push({
        id: `chunk-${idx}`,
        start: lastEnd,
        end: text.length,
        text: remaining,
      });
    }
  }

  return chunks;
}


/**
 * Select top chunks by ratio (keep top N%)
 */
function pickTopByRatio(
  scored: Array<{ id: string; score: number }>,
  keepRatio: number
): Set<string> {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const keepCount = Math.max(1, Math.ceil(sorted.length * keepRatio));
  return new Set(sorted.slice(0, keepCount).map((x) => x.id));
}

/**
 * Deduplicate chunks by cosine similarity
 * Remove chunks that are too similar to already-selected ones
 */
function dedupeByCosine(
  selectedIds: Set<string>,
  chunkVecs: Map<string, number[]>,
  threshold: number = 0.92
): Set<string> {
  const result = new Set<string>();
  const selectedArray = Array.from(selectedIds);

  for (const id of selectedArray) {
    const vec = chunkVecs.get(id);
    if (!vec) continue;

    // Check if too similar to any already-added chunk
    let isDuplicate = false;
    for (const existingId of result) {
      const existingVec = chunkVecs.get(existingId);
      if (existingVec && cosineSimilarity(vec, existingVec) > threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      result.add(id);
    }
  }

  return result;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ============================================================================
// Routes
// ============================================================================

export const curateRoutes = new Hono();

/**
 * POST /v1/curate/preview - Get curated preview based on cosine similarity
 */
curateRoutes.post('/v1/curate/preview', async (c) => {
  let body: CuratePreviewRequest | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.project_id || !body?.source_conversation_id || !body?.bridge_id || !body?.intent) {
    return jsonError(
      c,
      'INVALID_REQUEST',
      'project_id, source_conversation_id, bridge_id, and intent are required',
      400
    );
  }

  // Validate bridge_id
  const validBridges: BridgeTemplate[] = ['prose', 'plan', 'story', 'summary', 'refine', 'explain', 'clarify'];
  if (!validBridges.includes(body.bridge_id as BridgeTemplate)) {
    return jsonError(
      c,
      'INVALID_REQUEST',
      `Invalid bridge_id. Must be one of: ${validBridges.join(', ')}`,
      400
    );
  }

  // Validate cosine value
  const cosine = clamp01(body.cosine ?? 0.5);

  // Check for embedding API key
  const googleApiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!googleApiKey) {
    return jsonError(c, 'PROVIDER_ERROR', 'Google AI Studio API key not configured (GOOGLE_AI_STUDIO_KEY)', 400);
  }

  try {
    const db = await getDB();
    let sourceText = body.source_text;
    let chunks: Array<{ id: string; start: number; end: number; text: string }>;

    // If no sourceText provided, load from conversation with Ring3 segments
    if (!sourceText) {
      const conversation = await findConversationById(db, body.source_conversation_id);
      if (!conversation) {
        return jsonError(c, 'NOT_FOUND', `Conversation ${body.source_conversation_id} not found`, 404);
      }

      const turns = await findTurnsByConversation(db, {
        conversationId: body.source_conversation_id,
        limit: 100,
      });

      // Use Ring3 segments (rule-based sentence splitting)
      // This follows the "Core 优先原则" in CLAUDE.md
      const extracted = extractChunksFromTurns(
        turns.map((t) => ({
          role: t.role,
          content: t.content,
          rings: t.ringsJson ? JSON.parse(t.ringsJson) : undefined,
        }))
      );
      chunks = extracted.chunks;
      sourceText = extracted.sourceText;
    } else {
      // Fallback: source_text provided directly, use simple regex splitting
      chunks = chunkBySentencesFallback(sourceText);
    }

    if (!sourceText || sourceText.trim().length === 0) {
      return jsonError(c, 'INVALID_REQUEST', 'No source text available', 400);
    }

    // 1) Chunks already extracted above
    if (chunks.length === 0) {
      return jsonSuccess<CuratePreviewResponse>(c, {
        algorithm_version: 'curate_v1',
        keep_ratio: 1,
        chunks: [],
        selected_spans: [],
        source_text: sourceText,
      });
    }

    // 2) Create embedding provider with proxy support
    const embeddingProvider = createGoogleAIEmbeddingProvider({
      apiKey: googleApiKey,
      fetch: getProxyFetch(),
    });

    // 3) Embed intent and all chunks
    // Simplified: only use intent for matching (no template queries)
    const intentText = body.intent;
    const chunkTexts = chunks.map((c) => c.text);

    // Batch embed: [intent, ...chunks]
    const allTexts = [intentText, ...chunkTexts];
    const allEmbeddings = await embeddingProvider.encode(allTexts);

    const vecIntent = allEmbeddings[0];
    const chunkVecs = new Map<string, number[]>();
    chunks.forEach((chunk, i) => {
      chunkVecs.set(chunk.id, allEmbeddings[1 + i]);
    });

    // 4) Calculate cosine similarity between each chunk and intent
    const scored = chunks.map((chunk) => {
      const vec = chunkVecs.get(chunk.id)!;
      const score = cosineSimilarity(vecIntent, vec);

      return {
        ...chunk,
        score,
        cos_intent: score,
      };
    });

    // 5) Slider -> keepRatio (0 -> 75%, 1 -> 15%)
    const keepRatio = 0.75 - 0.60 * cosine;
    const selected = pickTopByRatio(scored, keepRatio);

    // 6) Dedupe by cosine similarity
    const deduped = dedupeByCosine(selected, chunkVecs, 0.92);

    // 7) Build response
    const responseChunks: Chunk[] = scored.map((x) => ({
      id: x.id,
      start: x.start,
      end: x.end,
      text: x.text,
      score: x.score,
      selected: deduped.has(x.id),
      cos_intent: x.cos_intent,
    }));

    const selectedSpans = responseChunks
      .filter((x) => x.selected)
      .map((x) => ({ start: x.start, end: x.end }));

    const response: CuratePreviewResponse = {
      algorithm_version: 'curate_v1',
      keep_ratio: keepRatio,
      chunks: responseChunks,
      selected_spans: selectedSpans,
      source_text: sourceText,
    };

    return jsonSuccess(c, response);
  } catch (err) {
    if (err instanceof EmbeddingProviderError) {
      return jsonError(c, 'EMBEDDING_ERROR', err.message, 500);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CURATE_PREVIEW_FAILED', message, 500);
  }
});
