/**
 * Import Routes (OpenAPI)
 *
 * Import project data from cfpack archives.
 *
 * POST /v1/import/cfpack - Import a cfpack JSON archive
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { restoreFromCfpack } from '@t3x/storage/backup';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const importRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// POST /v1/import/cfpack — Import a cfpack archive
// ============================================================

const ImportResultSchema = z.object({
  project_id: z.string(),
  conversations_imported: z.number(),
  turns_imported: z.number(),
});

const importCfpackRoute = createRoute({
  method: 'post',
  path: '/v1/import/cfpack',
  tags: ['Import'],
  summary: 'Import a cfpack archive',
  description: 'Import a cfpack JSON archive to create a new project with all its data.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            version: z.string(),
            project: z.object({
              project_id: z.string(),
              name: z.string(),
              created_at: z.string(),
            }),
            conversations: z.array(
              z.object({
                conversation_id: z.string(),
                project_id: z.string(),
                title: z.string().nullable(),
                created_at: z.string(),
              })
            ),
            turns: z.array(
              z.object({
                turn_hash: z.string(),
                parent_turn_hash: z.string().nullable(),
                conversation_id: z.string(),
                role: z.string(),
                content: z.string(),
                rings_json: z.string().nullable(),
                created_at: z.string(),
              })
            ),
            commits_v3: z.array(z.record(z.unknown())).optional().default([]),
            commits_v4: z.array(z.record(z.unknown())).optional().default([]),
            leaves: z.array(z.record(z.unknown())).optional().default([]),
            pins: z.array(z.record(z.unknown())).optional().default([]),
            meta: z.object({
              exported_at: z.string(),
              exported_by: z.string(),
              format_version: z.string(),
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Import successful',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ImportResultSchema),
        },
      },
    },
    400: {
      description: 'Invalid cfpack data',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

importRoutes.openapi(importCfpackRoute, async (c) => {
  const cfpack = c.req.valid('json');
  const db = await getDB();

  try {
    const result = await restoreFromCfpack(db, cfpack);
    return c.json(
      {
        success: true as const,
        data: result,
      },
      200
    );
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'IMPORT_FAILED',
          message: err instanceof Error ? err.message : 'Import failed',
        },
      },
      400
    );
  }
});
