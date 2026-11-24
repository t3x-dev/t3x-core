import { createHash, randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { RepositoryRunReceiptSchema, RepositoryRunTriggerInputSchema } from '@t3x-dev/api-client';
import {
  acknowledgeRepositoryRun,
  getRun,
  getVerifiedTransitionCommitGraph,
  reserveRepositoryRun,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { dispatchRunnerRun } from '../lib/dispatch-runner-run';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { getRequestPrincipal } from '../lib/request-principal';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const failure = {
  description: 'Trigger rejected',
  content: { 'application/json': { schema: ErrorResponseSchema } },
};
const triggerRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/repository-runs',
  tags: ['Runner'],
  request: {
    params: z.object({ projectId: z.string().min(1) }),
    body: {
      required: true,
      content: { 'application/json': { schema: RepositoryRunTriggerInputSchema } },
    },
  },
  responses: {
    200: {
      description: 'Persisted Run reservation and last observed status',
      content: {
        'application/json': { schema: SuccessResponseSchema(RepositoryRunReceiptSchema) },
      },
    },
    400: failure,
    401: failure,
    403: failure,
    404: failure,
    409: failure,
    503: failure,
  },
});

class UnknownCommit extends Error {}
class Unconfigured extends Error {}
const workflowConfig = z.record(z.string(), z.string().regex(/^[A-Za-z0-9_-]{1,128}$/));
function projectWorkflow(projectId: string) {
  let config: Record<string, string>;
  try {
    config = workflowConfig.parse(JSON.parse(process.env.T3X_REPOSITORY_RUN_WEBHOOKS ?? '{}'));
  } catch {
    throw new Unconfigured();
  }
  if (!Object.hasOwn(config, projectId)) throw new Unconfigured();
  return { type: 'n8n', webhook_id: config[projectId]! };
}

export const configuredRunsRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
configuredRunsRoutes.openapi(triggerRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const input = c.req.valid('json');
  const principal = getRequestPrincipal(c);
  if (!principal || principal.credential.kind === 'local_dev')
    return errorResponse(c, 'UNAUTHORIZED', 'An authenticated credential is required.');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (access instanceof Response) return access;
  try {
    const { receipt, created } = await reserveRepositoryRun(
      db,
      {
        projectId,
        actorId: principal.actor.id,
        requestId: input.request_id,
      },
      async (tx) => {
        const workflow = projectWorkflow(projectId);
        if (!(await getVerifiedTransitionCommitGraph(tx, projectId, input.commit_digest)))
          throw new UnknownCommit();
        const runId = 'run_' + randomUUID();
        const workflowJson = JSON.stringify(workflow);
        return {
          commitDigest: input.commit_digest,
          configurationDigest: 'sha256:' + createHash('sha256').update(workflowJson).digest('hex'),
          run: {
            run_id: runId,
            runner_run_id: 'runner_' + runId,
            project_id: projectId,
            commit_ref: input.commit_digest,
            workflow_json: workflowJson,
          },
        };
      }
    );
    if (receipt.commitDigest !== input.commit_digest)
      return errorResponse(c, 'CONFLICT', 'Request ID already binds a different Commit.');
    let run = await getRun(db, receipt.runId);
    if (!run) return errorResponse(c, 'CONFLICT', 'The original Run was deleted.');
    if (created) {
      // Only the transaction that created the receipt may dispatch, including after a lost response.
      let acknowledged = false;
      try {
        const response = await dispatchRunnerRun(
          {
            run_id: run.runId,
            project_id: projectId,
            commit_ref: receipt.commitDigest,
            workflow: JSON.parse(run.workflowJson!),
          },
          true
        );
        acknowledged =
          response.ok && (await response.json()).data?.runner_run_id === run.runnerRunId;
      } catch {
        /* Dispatch outcome is unknown. Read the durable Run below. */
      }
      if (acknowledged) await acknowledgeRepositoryRun(db, run.runId);
      run = await getRun(db, receipt.runId);
      if (!run) return errorResponse(c, 'CONFLICT', 'The original Run was deleted.');
    }
    return c.json({
      success: true as const,
      data: RepositoryRunReceiptSchema.parse({
        run_id: run.runId,
        status: run.status,
        commit_digest: receipt.commitDigest,
        configuration_digest: receipt.configurationDigest,
      }),
    });
  } catch (error) {
    if (error instanceof UnknownCommit)
      return errorResponse(c, 'COMMIT_NOT_FOUND', 'Commit unavailable in project.');
    if (error instanceof Unconfigured)
      return errorResponse(c, 'SERVICE_UNAVAILABLE', 'No valid project workflow is configured.');
    throw error;
  }
});
