/**
 * Merge Routes with OpenAPI
 *
 * POST /v1/merge/prepare - Prepare a merge between two commits
 * POST /v1/merge/execute - Execute merge with user resolutions
 */
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { prepareMerge, executeMerge, type Merge2WayResult } from '@t3x/core';
import { getCommitV3, createCommitV3, updateBranchHead } from '@t3x/storage';
import { getDB } from '../lib/db';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import {
  PrepareMergeRequestSchema,
  ExecuteMergeRequestSchema,
  PrepareMergeResponseSchema,
  ExecuteMergeResponseSchema,
} from '../schemas/merge';
import { getAuthorFromContext } from '../lib/auth';

export const mergeRoutes = new OpenAPIHono();

// ============================================================================
// POST /v1/merge/prepare
// ============================================================================

const prepareMergeRoute = createRoute({
  method: 'post',
  path: '/v1/merge/prepare',
  tags: ['Merge'],
  summary: 'Prepare a two-way merge',
  description: `
Analyzes two commits and returns a merge preparation result.

This endpoint performs a two-way merge analysis (no common ancestor required) and returns:
- **identical**: Sentences that are exactly the same in both commits
- **similarPairs**: Pairs of similar sentences that require user resolution
- **onlyInSource**: Sentences only present in the source commit
- **onlyInTarget**: Sentences only present in the target commit

The client must resolve all similarPairs (choose 'source' or 'target') and decide which onlyInSource/onlyInTarget sentences to keep before calling /execute.
  `.trim(),
  request: {
    body: {
      content: {
        'application/json': {
          schema: PrepareMergeRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Merge preparation successful',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PrepareMergeResponseSchema),
        },
      },
    },
    404: {
      description: 'Source or target commit not found',
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

mergeRoutes.openapi(prepareMergeRoute, async (c) => {
  const { source_hash, target_hash } = c.req.valid('json');
  const db = await getDB();

  // Load commits
  const sourceCommit = await getCommitV3(db, source_hash);
  if (!sourceCommit) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'NOT_FOUND',
          message: `Source commit not found: ${source_hash}`,
        },
      },
      404
    );
  }

  const targetCommit = await getCommitV3(db, target_hash);
  if (!targetCommit) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'NOT_FOUND',
          message: `Target commit not found: ${target_hash}`,
        },
      },
      404
    );
  }

  // Prepare merge
  const prepared = prepareMerge(sourceCommit.content, targetCommit.content);

  return c.json({ success: true as const, data: prepared }, 200);
});

// ============================================================================
// POST /v1/merge/execute
// ============================================================================

const executeMergeRoute = createRoute({
  method: 'post',
  path: '/v1/merge/execute',
  tags: ['Merge'],
  summary: 'Execute a merge with user resolutions',
  description: `
Executes a merge after the user has made all resolution decisions.

**Requirements:**
- All \`similarPairs[].resolution\` must be set to either 'source' or 'target'
- All \`onlyInSource[].keep\` and \`onlyInTarget[].keep\` must be set to true or false

**Result:**
- Creates a new merge commit with 2 parents: [source_hash, target_hash]
- Merged sentences get new IDs: 'm1', 'm2', ...
- Merged constraints get new IDs: 'mc1', 'mc2', ...
- Optionally updates the branch pointer if \`branch\` is specified

**Author Information:**
- If \`X-User-Name\` and \`X-User-Email\` headers are present, uses those (verified author)
- Otherwise, uses local author (verification: 'none')
  `.trim(),
  request: {
    body: {
      content: {
        'application/json': {
          schema: ExecuteMergeRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Merge executed successfully',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ExecuteMergeResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid request (e.g., unresolved similar pairs)',
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

mergeRoutes.openapi(executeMergeRoute, async (c) => {
  const { source_hash, target_hash, prepared, message, branch } = c.req.valid('json');

  // Validate all similar pairs are resolved
  const unresolved = prepared.similarPairs.filter((p) => !p.resolution);
  if (unresolved.length > 0) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'UNRESOLVED_PAIRS',
          message: `${unresolved.length} similar pair(s) have no resolution`,
        },
      },
      400
    );
  }

  // Get author from context
  const author = getAuthorFromContext(c);
  const db = await getDB();

  try {
    // Execute merge
    const mergeCommit = executeMerge(
      prepared as Merge2WayResult,
      source_hash,
      target_hash,
      author,
      message
    );

    // Set branch if provided
    if (branch) {
      mergeCommit.branch = branch;
    }

    // Convert to CreateCommitV3Input format
    const commitInput = {
      hash: mergeCommit.hash,
      schema: mergeCommit.schema,
      parents: mergeCommit.parents,
      author: mergeCommit.author,
      committedAt: new Date(mergeCommit.committed_at),
      content: {
        sentences: mergeCommit.content.sentences.map((s) => ({
          text: s.text,
          startChar: 0,
          endChar: s.text.length,
          id: s.id,
          confidence: s.confidence,
          source: s.source,
        })),
        constraints: mergeCommit.content.constraints || [],
      },
      message: mergeCommit.message,
      branch: mergeCommit.branch,
    };

    // Save to storage
    await createCommitV3(db, commitInput, { strictParents: false });

    // Update branch head if branch specified
    if (branch) {
      // Get project_id from source commit
      const sourceCommit = await getCommitV3(db, source_hash);
      if (sourceCommit?.projectId) {
        await updateBranchHead(db, sourceCommit.projectId, branch, mergeCommit.hash);
      }
    }

    return c.json({ success: true as const, data: mergeCommit }, 200);
  } catch (error) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'MERGE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});
