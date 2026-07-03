import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { findLatestYSchemaValidationRun, findYSchemaValidationRunById } from '@t3x-dev/storage';
import type { Context } from 'hono';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  runYSchemaValidationForCommit,
  toValidationRunView,
  YSchemaValidationError,
} from '../lib/yschema-validation';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const ProjectParamSchema = z.object({
  projectId: z.string().min(1),
});

const RunParamSchema = z.object({
  runId: z.string().min(1),
});

const CreateYSchemaValidationRunRequest = z.object({
  commit_hash: z.string().min(1).optional(),
  schema_name: z.string().min(1).default('t3x/prd'),
});

const LatestYSchemaValidationQuery = z.object({
  commit_hash: z.string().min(1).optional(),
  schema_name: z.string().min(1).default('t3x/prd'),
});

const YSchemaValidationRunResponse = z.object({
  id: z.string(),
  project_id: z.string(),
  commit_hash: z.string(),
  schema_name: z.string(),
  schema_version: z.string(),
  schema_hash: z.string(),
  validator_version: z.string(),
  status: z.enum(['pending', 'running', 'passed', 'failed', 'stale']),
  valid: z.boolean(),
  ready: z.boolean(),
  error_count: z.number().int(),
  gap_count: z.number().int(),
  fix_count: z.number().int(),
  result: z.record(z.string(), z.any()),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});

export const yschemaValidationRoutes = new OpenAPIHono();

const createValidationRunRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/yschema-validation/runs',
  tags: ['YSchema'],
  summary: 'Run YSchema validation for a project commit',
  request: {
    params: ProjectParamSchema,
    body: {
      content: {
        'application/json': {
          schema: CreateYSchemaValidationRunRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Validation run created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(YSchemaValidationRunResponse),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project or commit not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Commit does not belong to this project',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const getLatestValidationRunRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/yschema-validation/latest',
  tags: ['YSchema'],
  summary: 'Get the latest YSchema validation run for a project',
  request: {
    params: ProjectParamSchema,
    query: LatestYSchemaValidationQuery,
  },
  responses: {
    200: {
      description: 'Latest validation run, or null when none exists',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(YSchemaValidationRunResponse.nullable()),
        },
      },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const getValidationRunRoute = createRoute({
  method: 'get',
  path: '/v1/yschema-validation-runs/{runId}',
  tags: ['YSchema'],
  summary: 'Get a YSchema validation run by id',
  request: {
    params: RunParamSchema,
  },
  responses: {
    200: {
      description: 'Validation run',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(YSchemaValidationRunResponse),
        },
      },
    },
    404: {
      description: 'Validation run not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: {
      description: 'Project access denied',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

yschemaValidationRoutes.openapi(createValidationRunRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

    const run = await runYSchemaValidationForCommit(db, {
      projectId,
      commitHash: body.commit_hash,
      schemaName: body.schema_name,
    });

    return c.json({ success: true as const, data: run }, 201);
  } catch (error) {
    return validationErrorResponse(c, error);
  }
});

yschemaValidationRoutes.openapi(getLatestValidationRunRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { commit_hash, schema_name } = c.req.valid('query');

  try {
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

    const run = await findLatestYSchemaValidationRun(db, {
      project_id: projectId,
      commit_hash,
      schema_name,
    });

    return c.json({ success: true as const, data: run ? toValidationRunView(run) : null }, 200);
  } catch (error) {
    return validationErrorResponse(c, error);
  }
});

yschemaValidationRoutes.openapi(getValidationRunRoute, async (c) => {
  const { runId } = c.req.valid('param');

  try {
    const db = await getDB();
    const run = await findYSchemaValidationRunById(db, runId);
    if (!run) {
      return c.json(createError('NOT_FOUND', `YSchema validation run ${runId} not found`), 404);
    }
    const accessResult = await assertProjectAccess(c, db, run.project_id);
    if (accessResult instanceof Response) return accessResult;

    return c.json({ success: true as const, data: toValidationRunView(run) }, 200);
  } catch (error) {
    return validationErrorResponse(c, error);
  }
});

function validationErrorResponse(c: Context, error: unknown) {
  if (error instanceof YSchemaValidationError) {
    if (error.code === 'COMMIT_NOT_FOUND') {
      return c.json(createError('COMMIT_NOT_FOUND', error.message), 404);
    }
    if (error.code === 'COMMIT_PROJECT_MISMATCH') {
      return c.json(createError('FORBIDDEN', error.message), 403);
    }
    return c.json(createError('VALIDATION_FAILED', error.message), 400);
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return c.json(createError('VALIDATION_FAILED', message), 500);
}
