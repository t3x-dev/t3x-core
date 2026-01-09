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
  type AnchorCandidate,
  type AnchorSource,
  type AnchorType,
  cosineSimilarity,
  createGoogleAIEmbeddingProvider,
  EmbeddingProviderError,
  sha256,
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
// Error Classes
// ============================================================================

/**
 * Error thrown when data validation fails (corrupt data, missing fields, hash mismatch).
 * This should result in a 400 response, not 500.
 */
class DataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataValidationError';
  }
}

// ============================================================================
// Types
// ============================================================================

type BridgeTemplate = 'prose' | 'plan' | 'story' | 'summary' | 'refine' | 'explain' | 'clarify';

interface CuratePreviewRequest {
  project_id: string;
  /** Either source_conversation_id or source_text is required */
  source_conversation_id?: string;
  bridge_id: BridgeTemplate;
  intent: string;
  cosine: number; // 0..1 slider value
  unit_title?: string;
  user_message?: string;
  /** Fallback mode: if provided without source_conversation_id, uses regex splitting (no Ring3/anchors) */
  source_text?: string;
}

interface Chunk {
  id: string;
  start: number;
  end: number;
  text: string;
  score: number;
  selected: boolean;
  cos_intent?: number;
  /** v1.1: Anchor candidates within this chunk (for inline highlighting) */
  anchor_candidates?: ChunkAnchorCandidate[];
}

/**
 * Anchor candidate adjusted to chunk-relative positions (snake_case for API)
 * Used for inline highlighting in UI
 */
interface ChunkAnchorCandidate {
  text: string;
  type: AnchorType;
  /** Start offset relative to chunk start (not global) */
  start: number;
  /** End offset relative to chunk start (not global) */
  end: number;
  confidence: number;
  source: AnchorSource;
}

/**
 * API-level anchor candidate with snake_case fields (global positions)
 * Converted from core's AnchorCandidate (camelCase) for API consistency
 */
interface ApiAnchorCandidate {
  text: string;
  type: AnchorType;
  /** Start offset (global position in source_text) */
  start_char: number;
  /** End offset (global position in source_text) */
  end_char: number;
  confidence: number;
  source: AnchorSource;
}

interface CuratePreviewResponse {
  algorithm_version: string;
  keep_ratio: number;
  chunks: Chunk[];
  selected_spans: Array<{ start: number; end: number }>;
  /** The source text used for chunking - frontend should use this for tokenization */
  source_text: string;
  /** v1.1: SHA-256 hash of source_text for CommitAnchors.input_text_hash */
  input_text_hash: string;
  /** v1.1: All anchor candidates from Ring1 (global positions, snake_case) */
  anchor_candidates?: ApiAnchorCandidate[];
  /** v1.2: Warnings about data quality issues (e.g., skipped anchors, hash mismatches) */
  warnings?: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Ring3 segment structure from @t3x/core
 */
interface Ring3Segment {
  segmentId?: string;
  segment_id?: string;
  text: string;
  startChar?: number;
  start_char?: number;
  endChar?: number;
  end_char?: number;
}

/**
 * Ring1 anchor candidate structure from @t3x/core v1.1
 */
interface Ring1AnchorCandidate {
  text: string;
  type: AnchorType;
  startChar?: number;
  start_char?: number;
  endChar?: number;
  end_char?: number;
  confidence: number;
  source: AnchorSource;
}

/**
 * Ring1 output structure (partial, for hash extraction)
 * Supports both camelCase and snake_case property names
 */
interface Ring1Output {
  anchorCandidates?: Ring1AnchorCandidate[];
  anchor_candidates?: Ring1AnchorCandidate[];
  inputTextHash?: string;
  input_text_hash?: string;
}

interface ExtractedData {
  chunks: Array<{ id: string; start: number; end: number; text: string }>;
  sourceText: string;
  /** v1.1: All anchor candidates with global positions */
  anchorCandidates: AnchorCandidate[];
  /** Warnings about data quality issues (e.g., skipped anchors, hash mismatches) */
  warnings: string[];
}

/**
 * Extract chunks from turns using Ring3 segments (rule-based sentence splitting)
 * Also extracts Ring1 anchor candidates for inline highlighting.
 * This reuses the sentence segmentation already computed by @t3x/core
 *
 * Note: Ring3 segments use `splitSentencesRuleBased()`, not Google NLP sentence boundaries.
 * @see CLAUDE.md "硬性规则：WebUI/API 必须复用 Core"
 */
function extractChunksFromTurns(
  turns: Array<{
    role: string;
    content: string;
    rings?: {
      // Support both formats: { rings: { ring1, ring3 } } and { ring1, ring3 }
      rings?: {
        ring1?: Ring1Output;
        ring3?: { segments?: Ring3Segment[] };
      };
      ring1?: Ring1Output;
      ring3?: { segments?: Ring3Segment[] };
    };
  }>,
  computeHash: (text: string) => string
): ExtractedData {
  const chunks: Array<{ id: string; start: number; end: number; text: string }> = [];
  const allAnchorCandidates: AnchorCandidate[] = [];
  const warnings: string[] = [];
  const textParts: string[] = [];
  let globalOffset = 0;
  let chunkIdx = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const prefix = `[${turn.role}]: `;
    const turnText = prefix + turn.content;

    // Support both formats: { rings: { ring3 } } and { ring3 }
    const ring3 = turn.rings?.rings?.ring3 ?? turn.rings?.ring3;

    // Fail-Fast: Distinguish "ring3 missing" from "ring3 exists with empty segments"
    if (!ring3) {
      throw new DataValidationError(
        `[curate] Ring3 missing for turn ${i} (role: ${turn.role}). ` +
          `Content preview: "${turn.content.slice(0, 50)}...". ` +
          `Ensure turns were created with NLP extraction enabled (POST /v1/turns with content).`
      );
    }

    const segments = ring3.segments;

    // Fail-Fast: ring3.segments must be an array (not undefined/null)
    if (!Array.isArray(segments)) {
      throw new DataValidationError(
        `[curate] Ring3 segments is not an array for turn ${i} (role: ${turn.role}). ` +
          `Got: ${segments === undefined ? 'undefined' : typeof segments}. ` +
          `Content preview: "${turn.content.slice(0, 50)}...". ` +
          `This indicates data corruption.`
      );
    }

    // Empty segments array is valid (empty text, punctuation-only, etc.)
    // Skip only chunk extraction, but still process Ring1 anchors below
    const hasSegments = segments.length > 0;

    if (hasSegments) {
      // Fail-Fast: Check ALL segments have required fields (no partial fallback)
      const invalidSegmentDetails: string[] = [];
      const normalizedSegments: Array<{ text: string; startChar: number; endChar: number }> = [];

      for (let j = 0; j < segments.length; j++) {
        const seg = segments[j];
        const missing: string[] = [];

        const text = seg.text;
        const startChar = seg.startChar ?? seg.start_char;
        const endChar = seg.endChar ?? seg.end_char;

        // Validate all required fields
        if (typeof text !== 'string') missing.push('text');
        if (typeof startChar !== 'number') missing.push('startChar/start_char');
        if (typeof endChar !== 'number') missing.push('endChar/end_char');

        if (missing.length > 0) {
          invalidSegmentDetails.push(`[${j}]: missing ${missing.join(', ')}`);
        } else {
          normalizedSegments.push({ text, startChar, endChar });
        }
      }

      // Fail-Fast: Any segment missing required fields is an error (no silent degradation)
      if (invalidSegmentDetails.length > 0) {
        throw new DataValidationError(
          `[curate] Ring3 segments have missing fields for turn ${i} (role: ${turn.role}). ` +
            `${invalidSegmentDetails.length}/${segments.length} segments invalid: ${invalidSegmentDetails.join('; ')}. ` +
            `Content preview: "${turn.content.slice(0, 50)}...".`
        );
      }

      // All segments valid - add chunks
      for (const seg of normalizedSegments) {
        chunks.push({
          id: `chunk-${chunkIdx++}`,
          // Adjust offset: prefix length + segment's startChar + global offset
          start: globalOffset + prefix.length + seg.startChar,
          end: globalOffset + prefix.length + seg.endChar,
          text: seg.text,
        });
      }
    }
    // Note: If segments.length === 0, we skip chunk extraction but continue to Ring1 processing

    // v1.1: Extract anchor candidates with strict validation (Fail-Fast)
    // Support both formats: { rings: { ring1 } } and { ring1 }
    const ring1 = turn.rings?.rings?.ring1 ?? turn.rings?.ring1;
    const storedHash = ring1?.inputTextHash ?? ring1?.input_text_hash;

    // Fail-Fast: Validate anchorCandidates/anchor_candidates is an array if present
    const rawCamel = ring1?.anchorCandidates;
    const rawSnake = ring1?.anchor_candidates;

    // Strict fail-fast: if property exists but is not an array, data is corrupt
    if (rawCamel !== undefined && rawCamel !== null && !Array.isArray(rawCamel)) {
      throw new DataValidationError(
        `[curate] Turn ${i}: ring1.anchorCandidates is not an array (got ${typeof rawCamel}). ` +
          `This indicates data corruption. Re-create the turn with NLP extraction enabled.`
      );
    }
    if (rawSnake !== undefined && rawSnake !== null && !Array.isArray(rawSnake)) {
      throw new DataValidationError(
        `[curate] Turn ${i}: ring1.anchor_candidates is not an array (got ${typeof rawSnake}). ` +
          `This indicates data corruption. Re-create the turn with NLP extraction enabled.`
      );
    }

    // Support both camelCase and snake_case property names
    // Only Array.isArray is authoritative - null/undefined falls back to snake_case
    // Empty array [] means "no candidates" (authoritative)
    const anchorCandidates = Array.isArray(rawCamel)
      ? rawCamel
      : Array.isArray(rawSnake)
        ? rawSnake
        : undefined;

    if (anchorCandidates && anchorCandidates.length > 0) {
      // Strict fail-fast: hash mismatch indicates content was modified after anchor extraction
      if (storedHash) {
        const currentHash = computeHash(turn.content);
        if (currentHash !== storedHash) {
          throw new DataValidationError(
            `[curate] Turn ${i}: Content hash mismatch (stored=${storedHash.slice(0, 8)}... current=${currentHash.slice(0, 8)}...). ` +
            `Turn content was modified after anchor extraction. Re-create the turn with NLP extraction enabled.`
          );
        }
      }

      // Strict validation: all anchor candidates must have valid fields
      // Valid values for type and source enums
      const VALID_ANCHOR_TYPES = ['number', 'money', 'duration', 'percent', 'date', 'entity', 'term'];
      const VALID_ANCHOR_SOURCES = ['token', 'entity', 'phrase'];

      for (let k = 0; k < anchorCandidates.length; k++) {
        const candidate = anchorCandidates[k];
        const issues: string[] = [];

        const text = candidate.text;
        const type = candidate.type;
        const startChar = candidate.startChar ?? candidate.start_char;
        const endChar = candidate.endChar ?? candidate.end_char;
        const confidence = candidate.confidence;
        const source = candidate.source;

        // Validate ALL required fields - strict fail-fast
        // Normal flow (RingExtractor) always provides all fields.
        // Missing fields indicate data corruption or incompatible external data.
        if (typeof text !== 'string') issues.push('text: required, got ' + typeof text);
        if (typeof type !== 'string') {
          issues.push('type: required, got ' + typeof type);
        } else if (!VALID_ANCHOR_TYPES.includes(type)) {
          issues.push(`type: invalid value "${type}"`);
        }
        if (typeof startChar !== 'number') issues.push('startChar/start_char: required, got ' + typeof startChar);
        if (typeof endChar !== 'number') issues.push('endChar/end_char: required, got ' + typeof endChar);
        if (typeof confidence !== 'number') issues.push('confidence: required, got ' + typeof confidence);
        if (typeof source !== 'string') {
          issues.push('source: required, got ' + typeof source);
        } else if (!VALID_ANCHOR_SOURCES.includes(source)) {
          issues.push(`source: invalid value "${source}"`);
        }

        // Strict fail-fast: invalid anchor candidates indicate data corruption
        if (issues.length > 0) {
          throw new DataValidationError(
            `[curate] Turn ${i}, anchor[${k}]: Invalid fields - ${issues.join(', ')}. ` +
            `This indicates data corruption. Re-create the turn with NLP extraction enabled.`
          );
        }

        allAnchorCandidates.push({
          text,
          type: type as AnchorType,
          // Adjust offset: prefix length + candidate's startChar + global offset
          startChar: globalOffset + prefix.length + startChar,
          endChar: globalOffset + prefix.length + endChar,
          confidence, // Already validated as number
          source: source as AnchorSource, // Already validated as valid AnchorSource
        });
      }
    }

    textParts.push(turnText);
    // Add separator length to offset (except for last turn)
    const separator = i < turns.length - 1 ? '\n\n' : '';
    globalOffset += turnText.length + separator.length;
  }

  // Join without trailing separator - offsets are already calculated correctly
  const sourceText = textParts.join('\n\n');
  return { chunks, sourceText, anchorCandidates: allAnchorCandidates, warnings };
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

  // source_conversation_id is optional if source_text is provided
  if (!body?.project_id || !body?.bridge_id || !body?.intent) {
    return jsonError(
      c,
      'INVALID_REQUEST',
      'project_id, bridge_id, and intent are required',
      400
    );
  }

  // Either source_conversation_id or source_text must be provided
  if (!body?.source_conversation_id && !body?.source_text) {
    return jsonError(
      c,
      'INVALID_REQUEST',
      'Either source_conversation_id or source_text is required',
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
    let sourceText: string | undefined;
    let chunks: Array<{ id: string; start: number; end: number; text: string }>;
    let allAnchorCandidates: AnchorCandidate[] = [];
    let extractionWarnings: string[] = [];

    // Priority: source_conversation_id > source_text
    // source_conversation_id provides Ring3 segments and anchor candidates
    // source_text is fallback mode with regex splitting (no Ring3/anchors)
    if (body.source_conversation_id) {
      // Warn if source_text was also provided (it will be ignored)
      if (body.source_text) {
        extractionWarnings.push(
          'Both source_conversation_id and source_text provided. Using source_conversation_id (source_text ignored).'
        );
      }

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
        })),
        sha256
      );
      chunks = extracted.chunks;
      sourceText = extracted.sourceText;
      // v1.1: Also extract anchor candidates and warnings
      allAnchorCandidates = extracted.anchorCandidates;
      // Merge warnings (preserve any warnings added earlier, e.g., "both sources provided")
      extractionWarnings.push(...extracted.warnings);
    } else if (body.source_text) {
      // source_text provided directly, use simple regex splitting
      // No anchor candidates available in this mode
      sourceText = body.source_text;
      chunks = chunkBySentencesFallback(sourceText);
      // Inform caller about degraded experience (no Ring3 segments, no anchor candidates)
      extractionWarnings.push(
        'Using fallback regex sentence splitting (source_text mode). ' +
          'Anchor candidates not available. For Ring3 segments and anchor extraction, use source_conversation_id instead.'
      );
    } else {
      // This should not happen due to validation above, but handle gracefully
      return jsonError(c, 'INVALID_REQUEST', 'Either source_conversation_id or source_text is required', 400);
    }

    if (!sourceText || sourceText.trim().length === 0) {
      return jsonError(c, 'INVALID_REQUEST', 'No source text available', 400);
    }

    // 1) Chunks already extracted above
    if (chunks.length === 0) {
      // Consistent response structure even with empty chunks
      return jsonSuccess<CuratePreviewResponse>(c, {
        algorithm_version: 'curate_v1.2',
        keep_ratio: 1,
        chunks: [],
        selected_spans: [],
        source_text: sourceText,
        input_text_hash: sha256(sourceText),
        anchor_candidates: allAnchorCandidates.map((ac) => ({
          text: ac.text,
          type: ac.type,
          start_char: ac.startChar,
          end_char: ac.endChar,
          confidence: ac.confidence,
          source: ac.source,
        })),
        warnings: extractionWarnings.length > 0 ? extractionWarnings : undefined,
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

    // 7) Build response with anchor candidates per chunk
    // Use intersection + clamp strategy for cross-boundary anchors
    const responseChunks: Chunk[] = scored.map((x) => {
      // Find anchor candidates that intersect with this chunk (not just fully contained)
      const chunkAnchors: ChunkAnchorCandidate[] = allAnchorCandidates
        .filter((ac) => {
          // Check for intersection: anchor overlaps with chunk
          const intersects = ac.startChar < x.end && ac.endChar > x.start;
          return intersects;
        })
        .map((ac) => {
          // Clamp positions to chunk boundaries
          const clampedStart = Math.max(ac.startChar, x.start);
          const clampedEnd = Math.min(ac.endChar, x.end);
          // Extract the visible portion of text within the chunk
          const visibleText = x.text.slice(clampedStart - x.start, clampedEnd - x.start);

          return {
            text: visibleText || ac.text, // Use visible portion, fallback to original
            type: ac.type,
            // Convert to chunk-relative positions (clamped)
            start: clampedStart - x.start,
            end: clampedEnd - x.start,
            confidence: ac.confidence,
            source: ac.source,
          };
        })
        .filter((ac) => ac.end > ac.start); // Filter out zero-width after clamping

      return {
        id: x.id,
        start: x.start,
        end: x.end,
        text: x.text,
        score: x.score,
        selected: deduped.has(x.id),
        cos_intent: x.cos_intent,
        // v1.1: Include anchor candidates if any exist
        ...(chunkAnchors.length > 0 ? { anchor_candidates: chunkAnchors } : {}),
      };
    });

    const selectedSpans = responseChunks
      .filter((x) => x.selected)
      .map((x) => ({ start: x.start, end: x.end }));

    // Convert anchor candidates to snake_case for API response
    const apiAnchorCandidates: ApiAnchorCandidate[] = allAnchorCandidates.map((ac) => ({
      text: ac.text,
      type: ac.type,
      start_char: ac.startChar,
      end_char: ac.endChar,
      confidence: ac.confidence,
      source: ac.source,
    }));

    const response: CuratePreviewResponse = {
      algorithm_version: 'curate_v1.2',
      keep_ratio: keepRatio,
      chunks: responseChunks,
      selected_spans: selectedSpans,
      source_text: sourceText,
      // v1.1: Hash of source_text for CommitAnchors.input_text_hash
      input_text_hash: sha256(sourceText),
      // v1.1: Include all anchor candidates with global positions (snake_case)
      ...(apiAnchorCandidates.length > 0 ? { anchor_candidates: apiAnchorCandidates } : {}),
      // v1.2: Include warnings about data quality issues (Fail-Fast visibility)
      ...(extractionWarnings.length > 0 ? { warnings: extractionWarnings } : {}),
    };

    return jsonSuccess(c, response);
  } catch (err) {
    if (err instanceof EmbeddingProviderError) {
      return jsonError(c, 'EMBEDDING_ERROR', err.message, 500);
    }
    // Data validation errors are client errors (400), not server errors (500)
    if (err instanceof DataValidationError) {
      return jsonError(c, 'DATA_VALIDATION_ERROR', err.message, 400);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CURATE_PREVIEW_FAILED', message, 500);
  }
});

// Export for testing
export { extractChunksFromTurns, type ExtractedData, type Ring1Output, type Ring3Segment };
