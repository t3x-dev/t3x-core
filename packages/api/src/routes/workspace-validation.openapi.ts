import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { findLatestValidationRunByWorkspace, findValidationRunDetailsById } from '@t3x-dev/storage';
import type { Context } from 'hono';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const DEFAULT_WORKFLOW_NAME = 'workspace-validation/esphome-config@v0';

const ProjectWorkspaceParamsSchema = z.object({
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
});

const RunParamSchema = z.object({
  runId: z.string().min(1),
});

const LatestValidationRunQuerySchema = z.object({
  workflow_name: z.string().min(1).default(DEFAULT_WORKFLOW_NAME),
});

const ValidationRunStatusSchema = z.enum([
  'pending',
  'running',
  'passed',
  'failed',
  'stale',
  'environment_required',
  'timed_out',
]);

const ValidationStepRunStatusSchema = z.enum([
  'pending',
  'running',
  'passed',
  'failed',
  'skipped',
  'environment_required',
  'timed_out',
]);

const ValidationGateStatusSchema = z.enum(['ready', 'blocked', 'pending', 'stale']);
const ValidationFindingSeveritySchema = z.enum(['error', 'warning', 'info']);

const JsonObjectSchema = z.record(z.string(), z.unknown());

const ValidationRunResponseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  workspace_id: z.string(),
  subject_type: z.literal('candidate'),
  subject_hash: z.string(),
  workflow_name: z.string(),
  workflow_hash: z.string(),
  input_hash: z.string(),
  validator_hash: z.string(),
  environment_hash: z.string().nullable(),
  provider: z.string(),
  status: ValidationRunStatusSchema,
  gate_status: ValidationGateStatusSchema,
  summary: z.string().nullable(),
  result_json: JsonObjectSchema,
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});

const ValidationStepRunResponseSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  step_id: z.string(),
  name: z.string(),
  status: ValidationStepRunStatusSchema,
  summary: z.string().nullable(),
  error_code: z.string().nullable(),
  exit_code: z.number().int().nullable(),
  duration_ms: z.number().int().nullable(),
  command_json: z.array(z.unknown()).nullable(),
  log_excerpt: z.string().nullable(),
  log_truncated: z.boolean(),
  log_artifact_id: z.string().nullable(),
  result_json: JsonObjectSchema,
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});

const ValidationFindingResponseSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  step_run_id: z.string().nullable(),
  severity: ValidationFindingSeveritySchema,
  file: z.string().nullable(),
  line: z.number().int().nullable(),
  state_path: z.string().nullable(),
  code: z.string(),
  message: z.string(),
  log_excerpt: z.string().nullable(),
  evidence_json: JsonObjectSchema,
  created_at: z.string(),
});

const LatestValidationRunResponseSchema = z.object({
  run: ValidationRunResponseSchema.nullable(),
});

const ValidationRunDetailsResponseSchema = z.object({
  run: ValidationRunResponseSchema,
  steps: z.array(ValidationStepRunResponseSchema),
  findings: z.array(ValidationFindingResponseSchema),
});

export const workspaceValidationRoutes = new OpenAPIHono();

const getLatestWorkspaceValidationRunRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/validation-runs/latest',
  tags: ['Workspace Validation'],
  summary: 'Get the latest workspace validation run',
  request: {
    params: ProjectWorkspaceParamsSchema,
    query: LatestValidationRunQuerySchema,
  },
  responses: {
    200: {
      description: 'Latest workspace validation run, or null when none exists',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(LatestValidationRunResponseSchema),
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

const getWorkspaceValidationRunRoute = createRoute({
  method: 'get',
  path: '/v1/workspace-validation-runs/{runId}',
  tags: ['Workspace Validation'],
  summary: 'Get a workspace validation run by id',
  request: {
    params: RunParamSchema,
  },
  responses: {
    200: {
      description: 'Workspace validation run with step and finding evidence',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ValidationRunDetailsResponseSchema),
        },
      },
    },
    404: {
      description: 'Workspace validation run not found',
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

workspaceValidationRoutes.openapi(getLatestWorkspaceValidationRunRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { workflow_name } = c.req.valid('query');

  try {
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

    const run = await findLatestValidationRunByWorkspace(db, {
      project_id: projectId,
      workspace_id: workspaceId,
      workflow_name,
    });

    return c.json({ success: true as const, data: { run } }, 200);
  } catch (error) {
    return validationErrorResponse(c, error);
  }
});

workspaceValidationRoutes.openapi(getWorkspaceValidationRunRoute, async (c) => {
  const { runId } = c.req.valid('param');

  try {
    const db = await getDB();
    const details = await findValidationRunDetailsById(db, runId);
    if (!details) {
      return c.json(createError('NOT_FOUND', `Workspace validation run ${runId} not found`), 404);
    }

    const accessResult = await assertProjectAccess(c, db, details.run.project_id);
    if (accessResult instanceof Response) return accessResult;

    return c.json({ success: true as const, data: details }, 200);
  } catch (error) {
    return validationErrorResponse(c, error);
  }
});

function validationErrorResponse(c: Context, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return c.json(createError('VALIDATION_FAILED', message), 500);
}
