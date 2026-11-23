import { type RepositoryRunSummary, T3xApiError } from '@t3x-dev/api-client';
import { isSafeBusinessIdentifier } from '../business-capabilities.js';
import { withTransitionApi } from './transition/index.js';
import type { ToolDef, ToolHandler } from './types.js';

const maxPageSize = 100;

export const repositoryRunsDef: ToolDef = {
  name: 't3x_repository_runs',
  description: 'List saved evaluation Runs in a project or read one by its exact Run ID.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'read'] },
      project_id: { type: 'string' },
      run_id: { type: 'string', description: 'Required for read.' },
      status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed'] },
      limit: { type: 'integer', minimum: 1, maximum: maxPageSize },
      offset: { type: 'integer', minimum: 0 },
    },
    required: ['action', 'project_id'],
  },
  annotations: { readOnlyHint: true, idempotentHint: true },
};

function summary(run: RepositoryRunSummary) {
  return {
    run_id: run.runId,
    project_id: run.projectId,
    runner_run_id: run.runnerRunId,
    commit_ref: run.commitRef,
    leaf_id: run.leafId,
    status: run.status,
    title: run.title ?? null,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
  };
}

function report(value: string | null): { result: unknown; result_unreadable?: true } {
  if (value === null) return { result: null };
  try {
    return { result: JSON.parse(value) };
  } catch {
    return { result: null, result_unreadable: true };
  }
}

function integer(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

export const repositoryRunsHandler: ToolHandler = (args) =>
  withTransitionApi(async (client) => {
    const { action, project_id, run_id, status, limit = 25, offset = 0 } = args;
    if (!isSafeBusinessIdentifier(project_id)) {
      throw new T3xApiError('INVALID_ARGUMENT', 'Provide project_id.', 400);
    }
    if (action === 'read' && isSafeBusinessIdentifier(run_id)) {
      const run = await client.getRepositoryRun(run_id);
      if (run.runId !== run_id || run.projectId !== project_id) {
        throw new T3xApiError('NOT_FOUND', 'Run unavailable in this project.', 404);
      }
      return {
        ...summary(run),
        description: run.description ?? null,
        tags: run.tags ?? [],
        ...report(run.resultJson),
      };
    }
    if (
      action !== 'list' ||
      !integer(limit, 1) ||
      limit > maxPageSize ||
      !integer(offset, 0) ||
      (status !== undefined &&
        status !== 'queued' &&
        status !== 'running' &&
        status !== 'completed' &&
        status !== 'failed')
    ) {
      throw new T3xApiError(
        'INVALID_ARGUMENT',
        'Use list with valid filters or read with a Run ID.',
        400
      );
    }
    const page = await client.listRepositoryRuns({ project_id, status, limit, offset });
    if (page.runs.some((run) => run.projectId !== project_id)) {
      throw new T3xApiError(
        'INVALID_RESPONSE',
        'The API returned a Run outside this project.',
        502
      );
    }
    return {
      runs: page.runs.map(summary),
      limit: page.limit,
      offset: page.offset,
      next_offset: page.runs.length === page.limit ? page.offset + page.limit : null,
    };
  });
