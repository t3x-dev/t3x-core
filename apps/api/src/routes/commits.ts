/**
 * Commits Routes
 *
 * GET  /v1/commits - List commits (requires project_id query)
 * POST /v1/commits - Create commit
 * GET  /v1/commits/:hash - Get commit by hash
 */

import type { AnchorSource, AnchorType } from '@t3x/core';
import {
  CommitError,
  findCommitByHash,
  findCommitsByProject,
  findProjectById,
  findTurnsInWindow,
  insertCommit,
} from '@t3x/storage/pglite';
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

/**
 * v1.1 Anchor types for commit storage (API layer - snake_case)
 * These types match the PM spec for sentence-level anchor preservation.
 */
type AnchorConstraint = 'must_have' | 'mustnt_have' | 'preferred';

/**
 * Valid AnchorType values from @t3x/core
 * @see packages/core/src/extractors/types.ts
 */
const VALID_ANCHOR_TYPES: Set<AnchorType> = new Set([
  'number',
  'money',
  'duration',
  'percent',
  'date',
  'entity',
  'term',
]);

function isValidAnchorType(value: unknown): value is AnchorType {
  return typeof value === 'string' && VALID_ANCHOR_TYPES.has(value as AnchorType);
}

interface ConfirmedAnchor {
  id: string;
  text: string;
  /** Start offset relative to sentence start */
  start: number;
  /** End offset relative to sentence start */
  end: number;
  type: AnchorType;
  constraint: AnchorConstraint;
}

interface SentenceWithAnchors {
  sentence_id: string;
  text: string;
  start_char: number;
  end_char: number;
  anchors: ConfirmedAnchor[];
}

interface CommitAnchors {
  input_text_hash?: string;
  sentences: SentenceWithAnchors[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number') return value;
  }
  return undefined;
}

/**
 * Normalize anchor constraint value
 * - Accepts both camelCase (mustHave) and snake_case (must_have) input
 * - Outputs snake_case for v1.1 API consistency
 */
function normalizeAnchorConstraint(value: unknown): AnchorConstraint | undefined {
  // Accept snake_case (preferred for v1.1)
  if (value === 'must_have' || value === 'mustnt_have' || value === 'preferred') {
    return value;
  }
  // Accept camelCase for backward compatibility, convert to snake_case
  if (value === 'mustHave') return 'must_have';
  if (value === 'mustntHave') return 'mustnt_have';
  return undefined;
}

/**
 * Validation errors collected during anchor normalization
 */
interface AnchorValidationErrors {
  invalidSentences: string[];
  invalidAnchors: string[];
}

function normalizeCommitAnchors(
  input: unknown
): { result: CommitAnchors | undefined; errors: AnchorValidationErrors } | undefined {
  const errors: AnchorValidationErrors = {
    invalidSentences: [],
    invalidAnchors: [],
  };

  // Fail-Fast: Distinguish "no anchors provided" from "invalid anchors structure"
  if (input === undefined || input === null) {
    // Truly not provided - return undefined (not an error)
    return undefined;
  }

  if (!isRecord(input)) {
    // Provided but invalid structure - return error
    errors.invalidSentences.push(`anchors: expected object, got ${typeof input}`);
    return { result: undefined, errors };
  }

  const sentencesInput = input.sentences;
  if (!Array.isArray(sentencesInput)) {
    // Provided but sentences not an array - return error
    errors.invalidSentences.push(
      `anchors.sentences: expected array, got ${sentencesInput === undefined ? 'undefined' : typeof sentencesInput}`
    );
    return { result: undefined, errors };
  }

  const sentences: SentenceWithAnchors[] = [];

  for (let i = 0; i < sentencesInput.length; i++) {
    const sentenceInput = sentencesInput[i];
    if (!isRecord(sentenceInput)) {
      errors.invalidSentences.push(`sentences[${i}]: not an object`);
      continue;
    }

    const sentenceId = readString(sentenceInput, 'sentence_id', 'sentenceId');
    const text = readString(sentenceInput, 'text');
    const startChar = readNumber(sentenceInput, 'start_char', 'startChar');
    const endChar = readNumber(sentenceInput, 'end_char', 'endChar');
    const anchorsInput = sentenceInput.anchors;

    const missingFields: string[] = [];
    if (!sentenceId) missingFields.push('sentence_id');
    if (text === undefined) missingFields.push('text');
    if (startChar === undefined) missingFields.push('start_char');
    if (endChar === undefined) missingFields.push('end_char');

    if (missingFields.length > 0) {
      errors.invalidSentences.push(`sentences[${i}]: missing ${missingFields.join(', ')}`);
      continue;
    }

    const anchors: ConfirmedAnchor[] = [];

    // Fail-Fast: anchorsInput must be an array if provided (not undefined/null)
    if (anchorsInput !== undefined && anchorsInput !== null && !Array.isArray(anchorsInput)) {
      errors.invalidAnchors.push(
        `sentences[${i}].anchors: expected array, got ${typeof anchorsInput}`
      );
    } else if (Array.isArray(anchorsInput)) {
      for (let j = 0; j < anchorsInput.length; j++) {
        const anchorInput = anchorsInput[j];
        if (!isRecord(anchorInput)) {
          errors.invalidAnchors.push(`sentences[${i}].anchors[${j}]: not an object`);
          continue;
        }

        const id = readString(anchorInput, 'id');
        const anchorText = readString(anchorInput, 'text');
        const start = readNumber(anchorInput, 'start');
        const end = readNumber(anchorInput, 'end');
        const typeRaw = readString(anchorInput, 'type');
        const constraint = normalizeAnchorConstraint(anchorInput.constraint);

        const anchorMissing: string[] = [];
        if (!id) anchorMissing.push('id');
        if (anchorText === undefined) anchorMissing.push('text');
        if (start === undefined) anchorMissing.push('start');
        if (end === undefined) anchorMissing.push('end');
        if (!typeRaw) {
          anchorMissing.push('type');
        } else if (!isValidAnchorType(typeRaw)) {
          anchorMissing.push(`type (got: "${typeRaw}", valid: ${[...VALID_ANCHOR_TYPES].join('|')})`);
        }
        if (!constraint) anchorMissing.push(`constraint (got: ${JSON.stringify(anchorInput.constraint)})`);

        if (anchorMissing.length > 0) {
          errors.invalidAnchors.push(`sentences[${i}].anchors[${j}]: missing/invalid ${anchorMissing.join(', ')}`);
          continue;
        }

        anchors.push({
          id: id!,
          text: anchorText!,
          start: start!,
          end: end!,
          type: typeRaw as AnchorType,
          constraint: constraint!,
        });
      }
    }
    // Note: anchorsInput === undefined or null means "no anchors for this sentence" (valid)

    sentences.push({
      sentence_id: sentenceId!,
      text: text!,
      start_char: startChar!,
      end_char: endChar!,
      anchors,
    });
  }

  const inputTextHash = readString(input, 'input_text_hash', 'inputTextHash');

  // Note: If we got here with sentences.length === 0 and no errors, it means:
  // - The client explicitly provided `sentences: []` (empty array)
  // - This is valid semantics for "clear all anchors" and should be preserved
  // - We return { result: { sentences: [] }, errors } NOT undefined

  return {
    result: {
      input_text_hash: inputTextHash,
      sentences,
    },
    errors,
  };
}

/** Custom error class for anchor validation errors (to distinguish from JSON parse errors) */
class AnchorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnchorValidationError';
  }
}

/**
 * Extract anchors from facet snapshot
 * Returns undefined if no anchors facet is found
 * Throws AnchorValidationError if validation errors are found (Fail-Fast)
 * Throws Error if JSON parsing fails
 */
function extractAnchorsFromFacetSnapshot(facetSnapshotJson: string | null): CommitAnchors | undefined {
  if (!facetSnapshotJson) return undefined;

  let facets: unknown;
  try {
    facets = JSON.parse(facetSnapshotJson);
  } catch (err) {
    // JSON parse error - wrap with context
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[commits] Failed to parse facet_snapshot_json: ${message}. ` +
        `Raw JSON preview: "${facetSnapshotJson?.slice(0, 100)}...". ` +
        `Ensure facet_snapshot contains valid JSON.`
    );
  }

  // Fail-Fast: facet_snapshot must be an array if it exists
  if (!Array.isArray(facets)) {
    throw new AnchorValidationError(
      `[commits] facet_snapshot is not an array (got ${typeof facets}). ` +
        `This indicates data corruption.`
    );
  }

  const anchorsFacet = facets.find((f: { facet?: string }) => f.facet === 'anchors');
  if (!anchorsFacet) {
    // No anchors facet - this is valid (not all commits have anchors)
    return undefined;
  }

  // Fail-Fast: anchors facet must be an object with a value property
  if (!isRecord(anchorsFacet)) {
    throw new AnchorValidationError(
      `[commits] anchors facet is not an object (got ${typeof anchorsFacet}). ` +
        `This indicates data corruption.`
    );
  }

  const normalizeResult = normalizeCommitAnchors(anchorsFacet.value);
  if (!normalizeResult) {
    // anchorsFacet.value is null/undefined - no anchors data
    return undefined;
  }

  const { result: normalized, errors } = normalizeResult;

  // Fail-Fast: Report validation errors instead of silently dropping data
  const allErrors = [...errors.invalidSentences, ...errors.invalidAnchors];
  if (allErrors.length > 0) {
    throw new AnchorValidationError(
      `[commits] Anchor validation errors in stored facet_snapshot: ${allErrors.join('; ')}. ` +
        `This indicates data corruption or schema mismatch.`
    );
  }

  // No valid sentences and no errors means no anchors data
  if (!normalized) return undefined;

  if (!normalized.input_text_hash && isRecord(anchorsFacet)) {
    const facetHash = readString(anchorsFacet, 'input_text_hash');
    if (facetHash) normalized.input_text_hash = facetHash;
  }
  return normalized;
}

export const commitRoutes = new Hono();

/**
 * GET /v1/commits - List commits
 */
commitRoutes.get('/v1/commits', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id query param is required', 400);
  }

  const branch = c.req.query('branch') ?? undefined;
  const limit = parseInt(c.req.query('limit') ?? '100', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  try {
    const db = await getDB();
    const commitList = await findCommitsByProject(db, { projectId, branch, limit, offset });

    const apiCommits = commitList.map((commit) => ({
      commit_hash: commit.commitHash,
      project_id: commit.projectId,
      branch: commit.branch,
      message: commit.message,
      parents_json: commit.parentsJson,
      turn_window_json: commit.turnWindowJson,
      facet_snapshot_json: commit.facetSnapshotJson,
      pipeline_config_json: commit.pipelineConfigJson,
      draft_id: commit.draftId,
      draft_text_hash: commit.draftTextHash,
      signature_json: commit.signatureJson,
      source_excerpt_json: commit.sourceExcerptJson,
      must_have_json: commit.mustHaveJson,
      mustnt_have_json: commit.mustntHaveJson,
      position_x: commit.positionX,
      position_y: commit.positionY,
      source_refs_json: commit.sourceRefsJson,
      // v1.1: Return anchors_json consistently (same as POST response)
      anchors_json: commit.anchorsJson,
      created_at: commit.createdAt.toISOString(),
    }));

    return jsonSuccess(c, { commits: apiCommits, project_id: projectId, branch, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'LIST_FAILED', message, 500);
  }
});

/**
 * POST /v1/commits - Create commit
 */
commitRoutes.post('/v1/commits', async (c) => {
  let body: {
    project_id?: string;
    branch?: string;
    message?: string;
    turn_window?: {
      start_turn_hash: string;
      end_turn_hash: string;
    };
    facet_snapshot?: unknown[];
    merge_parents?: string[];
    pipeline_config?: unknown;
    draft_id?: string;
    draft_text_hash?: string;
    signature?: unknown;
    source_excerpt?: unknown;
    must_have?: unknown[];
    mustnt_have?: unknown[];
    position_x?: number;
    position_y?: number;
    source_refs?: unknown[];
    /**
     * v1.1: Structured anchors with sentence context and positions.
     * This is the recommended format - must_have/mustnt_have are deprecated.
     */
    anchors?: unknown;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.project_id) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id is required', 400);
  }

  // Validate: either turn_window or merge_parents required
  const hasMergeParents = body.merge_parents && body.merge_parents.length > 0;
  const hasTurnWindow = !!body.turn_window;

  if (!hasMergeParents && !hasTurnWindow) {
    return jsonError(c, 'INVALID_REQUEST', 'Either turn_window or merge_parents is required', 400);
  }

  if (hasMergeParents && hasTurnWindow) {
    return jsonError(
      c,
      'INVALID_REQUEST',
      'Cannot specify both merge_parents and turn_window',
      400
    );
  }

  try {
    const db = await getDB();

    // Verify project exists
    const project = await findProjectById(db, body.project_id);
    if (!project) {
      return jsonError(c, 'NOT_FOUND', `Project ${body.project_id} not found`, 404);
    }

    // Ensure facetSnapshot is always an array (type safety for .push())
    let facetSnapshot: unknown[] = Array.isArray(body.facet_snapshot)
      ? body.facet_snapshot
      : [];

    if (hasTurnWindow && facetSnapshot.length === 0 && body.turn_window) {
      try {
        const turns = await findTurnsInWindow(
          db,
          body.turn_window.start_turn_hash,
          body.turn_window.end_turn_hash
        );

        if (turns.length > 0) {
          const collectedFacets: unknown[] = [];

          for (const turn of turns) {
            if (turn.ringsJson) {
              try {
                const parsed = JSON.parse(turn.ringsJson);
                const rings = parsed?.rings ?? parsed;

                if (rings?.ring1?.keywords) {
                  for (const keyword of rings.ring1.keywords) {
                    const text = typeof keyword === 'string' ? keyword : keyword.text;
                    const lemma = typeof keyword === 'string' ? keyword : keyword.lemma;
                    collectedFacets.push({
                      facet: 'keyword',
                      text,
                      key: lemma ?? text,
                      value: text,
                      confidence: keyword?.confidence ?? 1.0,
                      polarity: keyword?.polarity,
                      pos: keyword?.pos,
                      entity_type: keyword?.entityType,
                      turn_hash: turn.turnHash,
                    });
                  }
                }

                if (rings?.ring2?.facets) {
                  for (const facet of rings.ring2.facets) {
                    if (typeof facet === 'string') {
                      collectedFacets.push({
                        facet: 'facet',
                        key: facet,
                        value: facet,
                        confidence: 1.0,
                        turn_hash: turn.turnHash,
                      });
                      continue;
                    }
                    collectedFacets.push({
                      facet: facet.facetType ?? facet.facet ?? 'facet',
                      key: facet.key,
                      value: facet.value,
                      confidence: facet.confidence ?? 1.0,
                      turn_hash: turn.turnHash,
                    });
                  }
                }

                if (rings?.ring3?.segments) {
                  for (const segment of rings.ring3.segments) {
                    const segmentId = segment.segmentId ?? segment.id;
                    collectedFacets.push({
                      facet: 'segment',
                      key: segmentId,
                      text: segment.text,
                      value: segment.text,
                      confidence: 1.0,
                      start_char: segment.startChar ?? segment.start_char,
                      end_char: segment.endChar ?? segment.end_char,
                      turn_hash: turn.turnHash,
                    });
                  }
                }

                if (rings?.ring1?.topic) {
                  collectedFacets.push({
                    facet: 'topic',
                    key: 'topic',
                    value: rings.ring1.topic,
                    confidence: 0.8,
                    turn_hash: turn.turnHash,
                  });
                }

                if (rings?.ring1?.timeAnchor) {
                  collectedFacets.push({
                    facet: 'time_anchor',
                    key: 'time',
                    value: rings.ring1.timeAnchor,
                    confidence: 0.9,
                    turn_hash: turn.turnHash,
                  });
                }

                // Collect preferenceKeywords (keywords with polarity != 0)
                if (rings?.ring1?.preferenceKeywords) {
                  for (const keyword of rings.ring1.preferenceKeywords) {
                    const text = typeof keyword === 'string' ? keyword : keyword.text;
                    const lemma = typeof keyword === 'string' ? keyword : keyword.lemma;
                    const polarity = keyword?.polarity ?? 0;
                    collectedFacets.push({
                      facet: 'preference',
                      text,
                      key: lemma ?? text,
                      value: text,
                      polarity,
                      polarity_label: polarity > 0 ? 'positive' : polarity < 0 ? 'negative' : 'neutral',
                      confidence: keyword?.confidence ?? 1.0,
                      pos: keyword?.pos,
                      entity_type: keyword?.entityType,
                      turn_hash: turn.turnHash,
                    });
                  }
                }
              } catch (parseErr) {
                // Fail-Fast: Do not silently skip turns with invalid rings JSON
                const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
                throw new Error(
                  `[commits] Failed to parse rings JSON for turn ${turn.turnHash}: ${message}. ` +
                    `Raw JSON preview: "${turn.ringsJson?.slice(0, 100)}...". ` +
                    `This indicates data corruption - investigate the turn creation.`
                );
              }
            }
          }

          facetSnapshot = collectedFacets;
        }
      } catch (collectErr) {
        // Fail-Fast: Do not silently skip facet collection errors
        const message = collectErr instanceof Error ? collectErr.message : String(collectErr);
        throw new Error(
          `[commits] Failed to collect facets from turns: ${message}. ` +
            `Turn window: ${body.turn_window?.start_turn_hash} -> ${body.turn_window?.end_turn_hash}. ` +
            `This may indicate missing turns or data corruption.`
        );
      }
    }

    // v1.1: Process structured anchors if provided
    let mustHave = body.must_have;
    let mustntHave = body.mustnt_have;
    const normalizeResult = body.anchors ? normalizeCommitAnchors(body.anchors) : undefined;
    let normalizedAnchors: CommitAnchors | undefined;

    // Fail-Fast: Report validation errors instead of silently dropping data
    if (normalizeResult) {
      const { result, errors } = normalizeResult;
      normalizedAnchors = result;
      const allErrors = [...errors.invalidSentences, ...errors.invalidAnchors];
      if (allErrors.length > 0) {
        return jsonError(
          c,
          'INVALID_ANCHORS',
          `Anchor validation failed: ${allErrors.join('; ')}. ` +
            `Ensure all sentences have sentence_id, text, start_char, end_char. ` +
            `Ensure all anchors have id, text, start, end, type, and valid constraint (must_have|mustnt_have|preferred).`,
          400
        );
      }

      // Store anchors as a special facet in facetSnapshot
      facetSnapshot.push({
        facet: 'anchors',
        key: 'anchors',
        value: normalizedAnchors,
        input_text_hash: normalizedAnchors.input_text_hash,
        confidence: 1.0,
      });

      // Also populate legacy must_have/mustnt_have for backward compatibility
      const derivedMustHave: string[] = [];
      const derivedMustntHave: string[] = [];

      for (const sentence of normalizedAnchors.sentences) {
        for (const anchor of sentence.anchors) {
          // normalizeAnchorConstraint already outputs snake_case
          if (anchor.constraint === 'must_have' || anchor.constraint === 'preferred') {
            derivedMustHave.push(anchor.text);
          } else if (anchor.constraint === 'mustnt_have') {
            derivedMustntHave.push(anchor.text);
          }
        }
      }

      // Only override if not explicitly provided
      if (!mustHave && derivedMustHave.length > 0) {
        mustHave = derivedMustHave;
      }
      if (!mustntHave && derivedMustntHave.length > 0) {
        mustntHave = derivedMustntHave;
      }
    }

    const commit = await insertCommit(db, {
      projectId: body.project_id,
      branch: body.branch,
      message: body.message,
      turnWindow: body.turn_window
        ? {
            startTurnHash: body.turn_window.start_turn_hash,
            endTurnHash: body.turn_window.end_turn_hash,
          }
        : undefined,
      facetSnapshot,
      mergeParents: body.merge_parents,
      pipelineConfig: body.pipeline_config,
      draftId: body.draft_id,
      draftTextHash: body.draft_text_hash,
      signature: body.signature,
      sourceExcerpt: body.source_excerpt,
      mustHave,
      mustntHave,
      positionX: body.position_x,
      positionY: body.position_y,
      sourceRefs: body.source_refs,
      anchors: normalizedAnchors,
    });

    const apiCommit = {
      commit_hash: commit.commitHash,
      project_id: commit.projectId,
      branch: commit.branch,
      message: commit.message,
      parents_json: commit.parentsJson,
      turn_window_json: commit.turnWindowJson,
      facet_snapshot_json: commit.facetSnapshotJson,
      pipeline_config_json: commit.pipelineConfigJson,
      draft_id: commit.draftId,
      draft_text_hash: commit.draftTextHash,
      signature_json: commit.signatureJson,
      source_excerpt_json: commit.sourceExcerptJson,
      must_have_json: commit.mustHaveJson,
      mustnt_have_json: commit.mustntHaveJson,
      position_x: commit.positionX,
      position_y: commit.positionY,
      source_refs_json: commit.sourceRefsJson,
      anchors_json: commit.anchorsJson,
      created_at: commit.createdAt.toISOString(),
    };

    return jsonSuccess(c, apiCommit, 201);
  } catch (err) {
    if (err instanceof CommitError) {
      const status = err.code === 'BRANCH_NOT_FOUND' ? 404 : 400;
      return jsonError(c, err.code, err.message, status);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CREATE_FAILED', message, 500);
  }
});

/**
 * GET /v1/commits/:hash - Get commit by hash
 */
commitRoutes.get('/v1/commits/:hash', async (c) => {
  const commitHash = decodeURIComponent(c.req.param('hash'));

  try {
    const db = await getDB();
    const commit = await findCommitByHash(db, commitHash);

    if (!commit) {
      return jsonError(c, 'NOT_FOUND', `Commit ${commitHash} not found`, 404);
    }

    const apiCommit = {
      commit_hash: commit.commitHash,
      project_id: commit.projectId,
      branch: commit.branch,
      message: commit.message,
      parents_json: commit.parentsJson,
      turn_window_json: commit.turnWindowJson,
      facet_snapshot_json: commit.facetSnapshotJson,
      pipeline_config_json: commit.pipelineConfigJson,
      draft_id: commit.draftId,
      draft_text_hash: commit.draftTextHash,
      signature_json: commit.signatureJson,
      source_excerpt_json: commit.sourceExcerptJson,
      must_have_json: commit.mustHaveJson,
      mustnt_have_json: commit.mustntHaveJson,
      position_x: commit.positionX,
      position_y: commit.positionY,
      source_refs_json: commit.sourceRefsJson,
      // v1.1: Return anchors_json consistently (same as POST response)
      anchors_json: commit.anchorsJson,
      created_at: commit.createdAt.toISOString(),
    };

    return jsonSuccess(c, apiCommit);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});
