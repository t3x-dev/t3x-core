import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type AnyDB,
  createValidationFinding,
  createValidationRun,
  createValidationStepRun,
  findLatestValidationRunByWorkspace,
  findValidationRunDetailsById,
  findWorkspaceDraft,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import {
  type MaterializedEsphomeDeviceInput,
  materializeEsphomeDeviceInput,
  WorkspaceValidationMaterializerError,
} from '../lib/workspace-validation/esphome-materializer';
import {
  type LocalEsphomeValidationResult,
  runLocalEsphomeConfigValidation,
} from '../lib/workspace-validation/local-oci-provider';
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

const CreateValidationRunRequestSchema = z.object({
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

const createWorkspaceValidationRunRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/validation-runs',
  tags: ['Workspace Validation'],
  summary: 'Run workspace validation',
  request: {
    params: ProjectWorkspaceParamsSchema,
    body: {
      required: false,
      content: {
        'application/json': {
          schema: CreateValidationRunRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Workspace validation run result',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ValidationRunDetailsResponseSchema),
        },
      },
    },
    400: {
      description: 'Workspace validation input is not supported',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project or workspace not found',
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

workspaceValidationRoutes.openapi(createWorkspaceValidationRunRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { workflow_name = DEFAULT_WORKFLOW_NAME } = c.req.valid('json') ?? {};

  if (workflow_name !== DEFAULT_WORKFLOW_NAME) {
    return c.json(
      createError(
        'VALIDATION_INPUT_NOT_SUPPORTED',
        `Workspace validation workflow ${workflow_name} is not supported.`
      ),
      400
    );
  }

  try {
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

    const draft = await findWorkspaceDraft(db, projectId, workspaceId);
    if (!draft?.workspace_state) {
      return c.json(createError('WORKSPACE_NOT_FOUND', `Workspace ${workspaceId} not found`), 404);
    }

    const materialized = materializeEsphomeDeviceInput({
      projectId,
      workspaceId,
      workspace: draft.workspace_state,
    });
    const startedAt = new Date();
    const providerResult = await runLocalEsphomeConfigValidation({
      deviceYaml: materialized.files[0].content,
    });
    const finishedAt = new Date();
    const details = await persistWorkspaceValidationResult(db, {
      materialized,
      providerResult,
      startedAt,
      finishedAt,
    });

    return c.json({ success: true as const, data: details }, 201);
  } catch (error) {
    return validationErrorResponse(c, error);
  }
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

async function persistWorkspaceValidationResult(
  db: AnyDB,
  input: {
    materialized: MaterializedEsphomeDeviceInput;
    providerResult: LocalEsphomeValidationResult;
    startedAt: Date;
    finishedAt: Date;
  }
): Promise<z.infer<typeof ValidationRunDetailsResponseSchema>> {
  const run = await createValidationRun(db, {
    project_id: input.materialized.project_id,
    workspace_id: input.materialized.workspace_id,
    subject_hash: input.materialized.subject_hash,
    workflow_name: input.materialized.workflow_name,
    workflow_hash: input.materialized.workflow_hash,
    input_hash: input.materialized.input_hash,
    validator_hash: input.materialized.validator_hash,
    provider: input.materialized.provider,
    status: input.providerResult.status,
    gate_status: input.providerResult.gate_status,
    environment_hash: input.providerResult.environment_hash,
    summary: input.providerResult.summary,
    result_json: {
      input_files: input.materialized.files.map(({ content: _content, ...file }) => file),
    },
    started_at: input.startedAt,
    finished_at: input.finishedAt,
  });
  const step = await createValidationStepRun(db, {
    run_id: run.id,
    step_id: input.providerResult.step.step_id,
    name: input.providerResult.step.name,
    status: input.providerResult.step.status,
    summary: input.providerResult.step.summary,
    error_code: input.providerResult.step.error_code,
    exit_code: input.providerResult.step.exit_code,
    duration_ms: input.providerResult.step.duration_ms,
    command_json: input.providerResult.step.command_json,
    log_excerpt: input.providerResult.step.log_excerpt,
    log_truncated: input.providerResult.step.log_truncated,
    result_json: input.providerResult.step.result_json,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
  });
  const findings = await Promise.all(
    input.providerResult.findings.map((finding) =>
      createValidationFinding(db, {
        run_id: run.id,
        step_run_id: step.id,
        severity: finding.severity,
        file: finding.file,
        line: finding.line,
        state_path: finding.state_path,
        code: finding.code,
        message: finding.message,
        log_excerpt: finding.log_excerpt,
        evidence_json: finding.evidence_json,
      })
    )
  );

  return {
    run,
    steps: [step],
    findings,
  };
}

function validationErrorResponse(c: Context, error: unknown) {
  if (error instanceof WorkspaceValidationMaterializerError) {
    return c.json(createError(error.code, error.message), 400);
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return c.json(createError('VALIDATION_FAILED', message), 500);
}
