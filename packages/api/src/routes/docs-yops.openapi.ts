/**
 * YOps Reference Endpoint
 *
 * Serves a structured, human+AI readable YOps operation reference.
 * Content is derived from the yops.yaml specification.
 *
 * Endpoints:
 * - GET /v1/docs/yops — YOps operation reference
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { zodErrorHook } from '../lib/errors';

export const docsYopsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Reference Data (derived from yops.yaml)
// ============================================================

const YOPS_REFERENCE = {
  name: 'YOps — YAML Operations',
  version: '1.0',
  description:
    '18 base operations + 2 T3X extensions (relate/unrelate) for mutating semantic trees. ' +
    'YOps is to YAML what SQL is to tables — a standard language for tree manipulation.',

  path_syntax: {
    separator: '/',
    description:
      'Slash-separated address into a YAML tree. Three segment types can be freely combined.',
    segments: {
      key: { syntax: 'name', description: 'Mapping key lookup', example: 'config/database/host' },
      index: { syntax: '[n]', description: 'Sequence index (0-based)', example: 'items/[0]/name' },
      match: {
        syntax: '[key=value]',
        description: 'Find first item in a sequence where item.key equals value',
        example: 'users/[name=alice]/role',
      },
    },
  },

  workflow: {
    description: 'Typical agent workflow for editing a semantic tree:',
    steps: [
      'POST /v1/extract — extract semantic tree from text → returns draft_id',
      'GET /v1/drafts/{draft_id} — view the extracted tree and get revision number',
      'POST /v1/drafts/{draft_id}/apply-yops — edit the tree with YOps (pass if_revision)',
      'POST /v1/drafts/{draft_id}/commit — save as immutable commit',
    ],
    tips: [
      'Use GET /v1/drafts/{id} to see the current tree before editing',
      'Always pass if_revision from the last GET/apply response (optimistic locking)',
      'Use POST /v1/yops/validate for dry-run testing without modifying the draft',
      'Prefer set/populate for updating existing nodes over define for creating new ones',
    ],
  },

  categories: {
    ddl: {
      name: 'DDL — Data Definition (structure)',
      operations: ['define', 'drop', 'rename'],
    },
    dml: {
      name: 'DML — Data Manipulation (values)',
      operations: ['set', 'unset', 'populate', 'append'],
    },
    dtl: {
      name: 'DTL — Data Transformation',
      operations: [
        'move',
        'clone',
        'nest',
        'split',
        'fold',
        'merge',
        'sort',
        'unique',
        'pick',
        'omit',
      ],
    },
    dcl: {
      name: 'DCL — Data Constraint',
      operations: ['assert'],
    },
    t3x: {
      name: 'T3X — Semantic Relations (T3X extensions)',
      operations: ['relate', 'unrelate'],
    },
  },

  operations: [
    {
      name: 'define',
      category: 'ddl',
      description: 'Create an empty mapping at a path',
      fields: { path: 'string (required) — path to create' },
      example: [{ define: { path: 'config/database' } }],
      errors: [
        'PATH_NOT_FOUND — parent path does not exist',
        'ALREADY_EXISTS — key already exists',
      ],
    },
    {
      name: 'drop',
      category: 'ddl',
      description: 'Remove a key and its entire subtree from a mapping',
      fields: { path: 'string (required) — path to remove' },
      example: [{ drop: { path: 'config/legacy_settings' } }],
      errors: ['PATH_NOT_FOUND — path does not exist'],
    },
    {
      name: 'rename',
      category: 'ddl',
      description: 'Change a key name without moving its value',
      fields: {
        path: 'string (required) — path to rename',
        to: 'string (required) — new key name',
      },
      example: [{ rename: { path: 'config/db', to: 'database' } }],
      errors: ['PATH_NOT_FOUND', 'ALREADY_EXISTS — target key already exists'],
    },
    {
      name: 'set',
      category: 'dml',
      description: 'Set a value at a path, creating intermediate mappings as needed',
      fields: { path: 'string (required) — target path', value: 'any (required) — value to set' },
      example: [{ set: { path: 'config/database/host', value: 'localhost' } }],
      errors: ['INVALID_PATH — cannot traverse path (intermediate is a scalar)'],
      note: 'This is the most common operation for updating existing slots.',
    },
    {
      name: 'unset',
      category: 'dml',
      description: 'Remove a key from a mapping (idempotent)',
      fields: { path: 'string (required) — path to remove' },
      example: [{ unset: { path: 'config/deprecated_option' } }],
      errors: [],
      note: 'Idempotent — no error if key is already absent.',
    },
    {
      name: 'populate',
      category: 'dml',
      description: 'Set multiple keys on a mapping at once',
      fields: {
        path: 'string (required) — target mapping',
        values: 'object (required) — key-value pairs to set',
      },
      example: [
        {
          populate: {
            path: 'trip/hotel',
            values: { type: 'ryokan', area: 'Asakusa', budget: 200 },
          },
        },
      ],
      errors: ['PATH_NOT_FOUND', 'NOT_A_MAPPING — target is not a mapping'],
      note: 'Prefer populate over multiple set calls when updating several slots on the same node.',
    },
    {
      name: 'append',
      category: 'dml',
      description: 'Append a value to a sequence',
      fields: {
        path: 'string (required) — path to sequence',
        value: 'any (required) — value to append',
      },
      example: [{ append: { path: 'config/tags', value: 'production' } }],
      errors: ['PATH_NOT_FOUND', 'NOT_A_SEQUENCE — target is not a sequence'],
    },
    {
      name: 'move',
      category: 'dtl',
      description: 'Move a value from one path to another',
      fields: {
        from: 'string (required) — source path',
        to: 'string (required) — destination path',
      },
      example: [{ move: { from: 'temp/draft', to: 'published/article' } }],
      errors: [
        'PATH_NOT_FOUND — source does not exist',
        'ALREADY_EXISTS — destination already exists',
      ],
    },
    {
      name: 'clone',
      category: 'dtl',
      description: 'Deep-copy a value from one path to another',
      fields: {
        from: 'string (required) — source path',
        to: 'string (required) — destination path',
      },
      example: [{ clone: { from: 'templates/default', to: 'config/active' } }],
      errors: ['PATH_NOT_FOUND', 'ALREADY_EXISTS'],
    },
    {
      name: 'nest',
      category: 'dtl',
      description: 'Wrap the value at path inside a new parent key',
      fields: {
        path: 'string (required) — path to wrap',
        under: 'string (required) — new parent key name',
      },
      example: [{ nest: { path: 'host', under: 'database' } }],
      errors: ['PATH_NOT_FOUND', 'ALREADY_EXISTS'],
    },
    {
      name: 'split',
      category: 'dtl',
      description: 'Split a mapping into multiple sibling keys',
      fields: {
        path: 'string (required) — mapping to split',
        into: 'array of [key, ...fields] (required)',
      },
      example: [
        {
          split: {
            path: 'config',
            into: [
              ['db', 'host', 'port'],
              ['cache', 'ttl'],
            ],
          },
        },
      ],
      errors: ['PATH_NOT_FOUND', 'NOT_A_MAPPING'],
    },
    {
      name: 'fold',
      category: 'dtl',
      description: 'Merge multiple sibling keys into one mapping',
      fields: { paths: 'array of strings (required)', into: 'string (required) — destination key' },
      example: [{ fold: { paths: ['db_host', 'db_port'], into: 'database' } }],
      errors: ['PATH_NOT_FOUND', 'ALREADY_EXISTS'],
    },
    {
      name: 'merge',
      category: 'dtl',
      description: 'Deep-merge a source mapping into a target mapping',
      fields: {
        from: 'string (required) — source to merge from',
        into: 'string (required) — target to merge into',
      },
      example: [{ merge: { from: 'overrides', into: 'config' } }],
      errors: ['PATH_NOT_FOUND', 'NOT_A_MAPPING'],
    },
    {
      name: 'sort',
      category: 'dtl',
      description: 'Sort a sequence in place',
      fields: {
        path: 'string (required)',
        by: 'string (optional) — key to sort by',
        order: '"asc" | "desc" (default: asc)',
      },
      example: [{ sort: { path: 'items', by: 'priority', order: 'desc' } }],
      errors: ['PATH_NOT_FOUND', 'NOT_A_SEQUENCE'],
    },
    {
      name: 'unique',
      category: 'dtl',
      description: 'Remove duplicate values from a sequence',
      fields: { path: 'string (required)', by: 'string (optional) — key to deduplicate by' },
      example: [{ unique: { path: 'tags' } }],
      errors: ['PATH_NOT_FOUND', 'NOT_A_SEQUENCE'],
    },
    {
      name: 'pick',
      category: 'dtl',
      description: 'Keep only specified keys from a mapping',
      fields: { path: 'string (required)', keys: 'array of strings (required)' },
      example: [{ pick: { path: 'config', keys: ['host', 'port'] } }],
      errors: ['PATH_NOT_FOUND', 'NOT_A_MAPPING'],
    },
    {
      name: 'omit',
      category: 'dtl',
      description: 'Remove specified keys from a mapping',
      fields: { path: 'string (required)', keys: 'array of strings (required)' },
      example: [{ omit: { path: 'config', keys: ['debug', 'verbose'] } }],
      errors: ['PATH_NOT_FOUND', 'NOT_A_MAPPING'],
    },
    {
      name: 'assert',
      category: 'dcl',
      description: 'Validate a condition — no mutation, fails if condition is false',
      fields: {
        path: 'string (required)',
        operator: '"exists" | "equals" | "type"',
        value: 'any (optional)',
      },
      example: [{ assert: { path: 'config/database', operator: 'exists' } }],
      errors: ['ASSERTION_FAILED — condition not met'],
    },
    {
      name: 'relate',
      category: 't3x',
      description: 'Add a semantic relation between two tree nodes (T3X extension)',
      fields: {
        from: 'string (required) — source node path',
        to: 'string (required) — target node path',
        type: 'string (required) — relation type: causes | conditions | contrasts | follows | depends',
      },
      example: [
        { relate: { from: 'diagnosis/root_cause', to: 'solution/approach', type: 'causes' } },
      ],
      errors: ['PATH_NOT_FOUND — endpoint path does not exist'],
    },
    {
      name: 'unrelate',
      category: 't3x',
      description: 'Remove a semantic relation between two tree nodes (T3X extension)',
      fields: {
        from: 'string (required) — source node path',
        to: 'string (required) — target node path',
        type: 'string (required) — relation type to remove',
      },
      example: [
        { unrelate: { from: 'diagnosis/root_cause', to: 'solution/approach', type: 'causes' } },
      ],
      errors: [],
    },
  ],
};

// ============================================================
// Route Definition
// ============================================================

const ResponseSchema = z.object({
  success: z.literal(true),
  data: z.any(),
});

const docsYopsRoute = createRoute({
  method: 'get',
  path: '/v1/docs/yops',
  tags: ['Reference'],
  operationId: 'getYOpsReference',
  summary: 'YOps operation reference for AI agents and developers',
  description:
    'Returns the complete YOps specification as structured JSON. ' +
    'Includes all 18 operations with descriptions, field syntax, examples, and error codes. ' +
    'Also includes path syntax and the recommended workflow.\n\n' +
    'Call this before using `POST /v1/drafts/{id}/apply-yops` to learn the available operations.',
  responses: {
    200: {
      description: 'YOps reference',
      content: { 'application/json': { schema: ResponseSchema } },
    },
  },
});

docsYopsRoutes.openapi(docsYopsRoute, async (c) => {
  return c.json({ success: true as const, data: YOPS_REFERENCE }, 200);
});
