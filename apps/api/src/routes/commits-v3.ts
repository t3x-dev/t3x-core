/**
 * Commits V3 Routes
 *
 * GET  /v1/commits-v3 - List commits v3 (requires project_id query)
 * POST /v1/commits-v3 - Create commit v3
 * GET  /v1/commits-v3/:hash - Get commit v3 by hash
 */

import type { Constraint, Sentence } from '@t3x-dev/core';
import { computeCommitV3Hash } from '@t3x-dev/core';
import {
  type CommitV3Output,
  createCommitV3,
  getCommitV3,
  listCommitsV3,
  ParentNotFoundError,
} from '@t3x-dev/storage/pglite';
import { Hono } from 'hono';
import { getAuthorFromContext } from '../lib/auth';
import { getDB } from '../lib/db';
import { jsonError, jsonSuccess } from '../lib/response';

export const commitsV3Routes = new Hono();

// ============================================================
// Response helpers
// ============================================================

/**
 * Convert storage output to API response format (snake_case)
 */
function toApiCommit(commit: CommitV3Output) {
  return {
    hash: commit.hash,
    schema: commit.schema,
    parents: commit.parents,
    author: commit.author,
    committed_at: commit.committedAt,
    content: commit.content,
    project_id: commit.projectId,
    message: commit.message,
    branch: commit.branch,
    position: commit.position,
    created_at: commit.createdAt,
    updated_at: commit.updatedAt,
  };
}

/**
 * Parse and validate pagination parameter
 */
function parsePaginationParam(
  value: string | undefined,
  defaultValue: number,
  max: number
): number {
  const parsed = parseInt(value ?? String(defaultValue), 10);
  if (Number.isNaN(parsed) || parsed < 0) return defaultValue;
  return Math.min(parsed, max);
}

// ============================================================
// Input validation helpers
// ============================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSentence(input: unknown, index: number): { sentence?: Sentence; error?: string } {
  if (!isRecord(input)) {
    return { error: `sentences[${index}]: expected object` };
  }

  const id = input.id;
  const text = input.text;
  const source = input.source;

  if (typeof id !== 'string' || !id) {
    return { error: `sentences[${index}].id: required string` };
  }
  if (typeof text !== 'string') {
    return { error: `sentences[${index}].text: required string` };
  }
  if (!isRecord(source)) {
    return { error: `sentences[${index}].source: required object` };
  }

  const turnHash = source.turn_hash;
  const startChar = source.start_char;
  const endChar = source.end_char;

  if (typeof turnHash !== 'string' || !turnHash) {
    return { error: `sentences[${index}].source.turn_hash: required string` };
  }
  if (typeof startChar !== 'number') {
    return { error: `sentences[${index}].source.start_char: required number` };
  }
  if (typeof endChar !== 'number') {
    return { error: `sentences[${index}].source.end_char: required number` };
  }

  return {
    sentence: {
      id,
      text,
      source: {
        turn_hash: turnHash,
        start_char: startChar,
        end_char: endChar,
      },
    },
  };
}

function validateConstraint(
  input: unknown,
  index: number
): { constraint?: Constraint; error?: string } {
  if (!isRecord(input)) {
    return { error: `constraints[${index}]: expected object` };
  }

  const type = input.type;
  const id = input.id;
  const value = input.value;
  const match = input.match;

  if (type !== 'require' && type !== 'exclude') {
    return { error: `constraints[${index}].type: must be 'require' or 'exclude'` };
  }
  if (typeof id !== 'string' || !id) {
    return { error: `constraints[${index}].id: required string` };
  }
  if (typeof value !== 'string') {
    return { error: `constraints[${index}].value: required string` };
  }
  if (match !== 'exact' && match !== 'semantic') {
    return { error: `constraints[${index}].match: must be 'exact' or 'semantic'` };
  }

  if (type === 'require') {
    const sourceSentenceId = input.source_sentence_id;
    const suggested = input.suggested;

    return {
      constraint: {
        type: 'require',
        id,
        value,
        match,
        source_sentence_id: typeof sourceSentenceId === 'string' ? sourceSentenceId : undefined,
        suggested: typeof suggested === 'boolean' ? suggested : undefined,
      },
    };
  }

  const reason = input.reason;
  return {
    constraint: {
      type: 'exclude',
      id,
      value,
      match,
      reason: typeof reason === 'string' ? reason : undefined,
    },
  };
}

interface ValidatedContent {
  sentences: Sentence[];
  constraints?: Constraint[];
}

function validateContent(input: unknown): { content?: ValidatedContent; errors: string[] } {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { errors: ['content: expected object'] };
  }

  const sentencesInput = input.sentences;
  if (!Array.isArray(sentencesInput)) {
    return { errors: ['content.sentences: required array'] };
  }

  const sentences: Sentence[] = [];
  for (let i = 0; i < sentencesInput.length; i++) {
    const result = validateSentence(sentencesInput[i], i);
    if (result.error) {
      errors.push(result.error);
    } else if (result.sentence) {
      sentences.push(result.sentence);
    }
  }

  const constraints: Constraint[] = [];
  const constraintsInput = input.constraints;
  if (constraintsInput !== undefined && constraintsInput !== null) {
    if (!Array.isArray(constraintsInput)) {
      errors.push('content.constraints: expected array');
    } else {
      for (let i = 0; i < constraintsInput.length; i++) {
        const result = validateConstraint(constraintsInput[i], i);
        if (result.error) {
          errors.push(result.error);
        } else if (result.constraint) {
          constraints.push(result.constraint);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    content: {
      sentences,
      constraints: constraints.length > 0 ? constraints : undefined,
    },
    errors: [],
  };
}

// ============================================================
// Routes
// ============================================================

/**
 * POST /v1/commits-v3 - Create commit v3
 */
commitsV3Routes.post('/v1/commits-v3', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!isRecord(body)) {
    return jsonError(c, 'INVALID_REQUEST', 'Request body must be an object', 400);
  }

  // Validate required fields
  const projectId = body.project_id;
  if (typeof projectId !== 'string' || !projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id is required', 400);
  }

  // Validate content
  const contentValidation = validateContent(body.content);
  if (contentValidation.errors.length > 0) {
    return jsonError(
      c,
      'INVALID_REQUEST',
      `Content validation failed: ${contentValidation.errors.join('; ')}`,
      400
    );
  }

  const content = contentValidation.content!;

  // Optional fields
  const branch = typeof body.branch === 'string' ? body.branch : 'main';
  const message = typeof body.message === 'string' ? body.message : undefined;
  const parents = Array.isArray(body.parents)
    ? body.parents.filter((p): p is string => typeof p === 'string')
    : [];

  let position: { x: number; y: number } | undefined;
  if (isRecord(body.position)) {
    const x = body.position.x;
    const y = body.position.y;
    if (typeof x === 'number' && typeof y === 'number') {
      position = { x, y };
    }
  }

  try {
    const db = await getDB();

    // Build commit data for hashing
    const author = await getAuthorFromContext(c);
    const committedAt = new Date();

    const commitData = {
      schema: 'commit/v3' as const,
      parents,
      author,
      committed_at: committedAt.toISOString(),
      content,
    };

    const hash = computeCommitV3Hash(commitData);

    // Create commit in database
    // Storage types now match Core types, pass through directly
    const commit = await createCommitV3(db, {
      hash,
      schema: 'commit/v3',
      parents,
      author,
      committedAt,
      content,
      projectId,
      message,
      branch,
      position,
    });

    return jsonSuccess(c, toApiCommit(commit), 201);
  } catch (err) {
    if (err instanceof ParentNotFoundError) {
      return jsonError(
        c,
        'PARENT_NOT_FOUND',
        `Parent commits not found: ${err.missingParents.join(', ')}`,
        400
      );
    }
    // Handle PostgreSQL foreign key violation (project_id not found)
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      return jsonError(c, 'PROJECT_NOT_FOUND', `Project ${projectId} not found`, 404);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CREATE_FAILED', message, 500);
  }
});

/**
 * GET /v1/commits-v3/:hash - Get commit v3 by hash
 */
commitsV3Routes.get('/v1/commits-v3/:hash', async (c) => {
  const hash = decodeURIComponent(c.req.param('hash'));

  try {
    const db = await getDB();
    const commit = await getCommitV3(db, hash);

    if (!commit) {
      return jsonError(c, 'NOT_FOUND', `Commit ${hash} not found`, 404);
    }

    return jsonSuccess(c, toApiCommit(commit));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});

/**
 * GET /v1/commits-v3 - List commits v3
 */
commitsV3Routes.get('/v1/commits-v3', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id query param is required', 400);
  }

  const branch = c.req.query('branch') ?? undefined;
  const limit = parsePaginationParam(c.req.query('limit'), 100, 1000);
  const offset = parsePaginationParam(c.req.query('offset'), 0, Number.MAX_SAFE_INTEGER);

  try {
    const db = await getDB();
    const commits = await listCommitsV3(db, { projectId, branch, limit, offset });

    return jsonSuccess(c, {
      commits: commits.map(toApiCommit),
      project_id: projectId,
      branch,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'LIST_FAILED', message, 500);
  }
});
