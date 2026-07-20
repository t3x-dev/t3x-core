import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

export const pullRequestRoutes = new OpenAPIHono();

const PullRequestStatusSchema = z.enum(['draft', 'open', 'ready', 'blocked', 'merged', 'closed']);
const PullRequestCheckStatusSchema = z.enum([
  'pending',
  'running',
  'passed',
  'warning',
  'blocked',
  'failed',
]);

const PullRequestSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  project_id: z.string(),
  title: z.string(),
  description: z.string(),
  source_branch: z.string(),
  target_branch: z.string(),
  source_commit_id: z.string(),
  target_base_commit_id: z.string(),
  status: PullRequestStatusSchema,
  author_id: z.string(),
  steward_id: z.string().nullable(),
  review_owner_id: z.string().nullable(),
  workspace_id: z.string().nullable(),
  release_lane_id: z.string().nullable(),
  linked_work: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  merged_at: z.string().nullable(),
  closed_at: z.string().nullable(),
});

const PullRequestCheckSchema = z.object({
  id: z.string(),
  pull_request_id: z.string(),
  kind: z.enum([
    'source_commit',
    'target_commit',
    'base_freshness',
    'schema_compatibility',
    'merge_simulation',
    'output_impact',
    'review_requirement',
    'permission',
  ]),
  status: PullRequestCheckStatusSchema,
  title: z.string(),
  message: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});

const PullRequestActivitySchema = z.object({
  id: z.string(),
  pull_request_id: z.string(),
  actor_id: z.string(),
  type: z.enum([
    'created',
    'description_updated',
    'status_changed',
    'checks_reran',
    'commented',
    'base_updated',
    'merged',
    'closed',
  ]),
  message: z.string(),
  created_at: z.string(),
});

const PullRequestDetailSchema = PullRequestSchema.extend({
  checks: z.array(PullRequestCheckSchema),
  activity: z.array(PullRequestActivitySchema),
});

const PullRequestCompareCandidateSchema = z.object({
  id: z.string(),
  branch: z.string(),
  base_branch: z.string(),
  title: z.string(),
  description: z.string(),
  head_commit_id: z.string(),
  base_commit_id: z.string(),
  updated_at: z.string(),
  ahead_by: z.number().int().nonnegative(),
  behind_by: z.number().int().nonnegative(),
  yops_changes: z.number().int().nonnegative(),
  changed_nodes: z.number().int().nonnegative(),
  output_impacts: z.number().int().nonnegative(),
  source_refs: z.number().int().nonnegative(),
  schema: z.string(),
  status: z.enum(['ready', 'already_open', 'no_changes']),
  status_label: z.string(),
  open_pull_request_number: z.number().int().positive().nullable(),
});

const PullRequestListResponseSchema = z.object({
  pull_requests: z.array(PullRequestSchema),
  counts: z.object({
    active: z.number().int().nonnegative(),
    merged: z.number().int().nonnegative(),
  }),
});

const PullRequestCompareResponseSchema = z.object({
  base_branches: z.array(z.string()),
  compare_branches: z.array(PullRequestCompareCandidateSchema),
});

type PullRequestStatus = z.infer<typeof PullRequestStatusSchema>;
type PullRequest = z.infer<typeof PullRequestSchema>;
type PullRequestCheck = z.infer<typeof PullRequestCheckSchema>;
type PullRequestActivity = z.infer<typeof PullRequestActivitySchema>;
type PullRequestCompareCandidate = z.infer<typeof PullRequestCompareCandidateSchema>;

const projectPullRequests = new Map<string, PullRequest[]>();
const projectChecks = new Map<string, PullRequestCheck[]>();
const projectActivity = new Map<string, PullRequestActivity[]>();

function nowIso() {
  return new Date().toISOString();
}

function seedProjectPullRequests(projectId: string) {
  if (projectPullRequests.has(projectId)) return;

  const createdAt = '2026-07-17T04:00:00.000Z';
  const pullRequests: PullRequest[] = [
    {
      id: `${projectId}:pr:17`,
      number: 17,
      project_id: projectId,
      title: 'Release note cleanup',
      description: 'Prepare release-note state for merge with provenance retained.',
      source_branch: 'release-notes/cleanup',
      target_branch: 'main',
      source_commit_id: 'sha:12cc0d4',
      target_base_commit_id: 'sha:6de18a0',
      status: 'ready',
      author_id: 'noah',
      steward_id: 'noah',
      review_owner_id: 'iris',
      workspace_id: 'product-foundation',
      release_lane_id: '2026.07',
      linked_work: 'Release notes cleanup workspace',
      created_at: createdAt,
      updated_at: '2026-07-15T04:00:00.000Z',
      merged_at: null,
      closed_at: null,
    },
    {
      id: `${projectId}:pr:18`,
      number: 18,
      project_id: projectId,
      title: 'PRD Schema v3 rollout',
      description: 'Review schema rollout before it becomes merge-ready.',
      source_branch: 'schema/prd-v3',
      target_branch: 'main',
      source_commit_id: 'sha:5c10b29',
      target_base_commit_id: 'sha:6de18a0',
      status: 'blocked',
      author_id: 'iris',
      steward_id: 'iris',
      review_owner_id: 'maya',
      workspace_id: 'product-foundation',
      release_lane_id: 'schema-track',
      linked_work: 'PRD schema upgrade',
      created_at: createdAt,
      updated_at: '2026-07-16T04:00:00.000Z',
      merged_at: null,
      closed_at: null,
    },
    {
      id: `${projectId}:pr:19`,
      number: 19,
      project_id: projectId,
      title: 'Audience handoff updates',
      description: 'Move audience handoff state into a reviewable merge proposal.',
      source_branch: 'workspace/audience-handoff',
      target_branch: 'main',
      source_commit_id: 'sha:8ab61ef',
      target_base_commit_id: 'sha:6de18a0',
      status: 'draft',
      author_id: 'maya',
      steward_id: null,
      review_owner_id: null,
      workspace_id: 'product-foundation',
      release_lane_id: null,
      linked_work: 'Audience handoff workspace',
      created_at: createdAt,
      updated_at: '2026-07-17T03:42:00.000Z',
      merged_at: null,
      closed_at: null,
    },
    {
      id: `${projectId}:pr:14`,
      number: 14,
      project_id: projectId,
      title: 'Limitations wording alignment',
      description: 'Merged wording alignment for limitations state.',
      source_branch: 'docs/limitations-copy',
      target_branch: 'main',
      source_commit_id: 'sha:72af006',
      target_base_commit_id: 'sha:12cc0d4',
      status: 'merged',
      author_id: 'iris',
      steward_id: 'iris',
      review_owner_id: 'noah',
      workspace_id: 'product-foundation',
      release_lane_id: null,
      linked_work: 'Limitations wording cleanup',
      created_at: createdAt,
      updated_at: '2026-07-11T04:00:00.000Z',
      merged_at: '2026-07-11T04:00:00.000Z',
      closed_at: null,
    },
  ];

  projectPullRequests.set(projectId, pullRequests);
  for (const pullRequest of pullRequests) {
    projectChecks.set(pullRequest.id, buildChecks(pullRequest));
    projectActivity.set(pullRequest.id, [
      {
        id: `${pullRequest.id}:activity:created`,
        pull_request_id: pullRequest.id,
        actor_id: pullRequest.author_id,
        type: 'created',
        message: 'Merge proposal created.',
        created_at: pullRequest.created_at,
      },
    ]);
  }
}

function buildChecks(pullRequest: PullRequest): PullRequestCheck[] {
  const completedAt = pullRequest.updated_at;
  const blocked = pullRequest.status === 'blocked';

  return [
    {
      id: `${pullRequest.id}:check:source`,
      pull_request_id: pullRequest.id,
      kind: 'source_commit',
      status: 'passed',
      title: 'Source commit',
      message: `${pullRequest.source_commit_id} exists on ${pullRequest.source_branch}.`,
      started_at: completedAt,
      completed_at: completedAt,
    },
    {
      id: `${pullRequest.id}:check:target`,
      pull_request_id: pullRequest.id,
      kind: 'target_commit',
      status: 'passed',
      title: 'Target commit',
      message: `${pullRequest.target_base_commit_id} exists on ${pullRequest.target_branch}.`,
      started_at: completedAt,
      completed_at: completedAt,
    },
    {
      id: `${pullRequest.id}:check:merge`,
      pull_request_id: pullRequest.id,
      kind: 'merge_simulation',
      status: blocked ? 'blocked' : pullRequest.status === 'ready' ? 'passed' : 'pending',
      title: 'Merge simulation',
      message: blocked
        ? 'Schema migration decision is required before deterministic merge simulation can pass.'
        : 'Deterministic merge simulation is queued or passed for this proposal.',
      started_at: completedAt,
      completed_at: pullRequest.status === 'ready' || blocked ? completedAt : null,
    },
  ];
}

function getProjectList(projectId: string) {
  seedProjectPullRequests(projectId);
  return projectPullRequests.get(projectId) ?? [];
}

function findPullRequest(projectId: string, number: number) {
  return getProjectList(projectId).find((pullRequest) => pullRequest.number === number);
}

function buildCompareCandidates(
  projectId: string,
  baseBranch: string
): PullRequestCompareCandidate[] {
  const activePullRequests = getProjectList(projectId).filter((pullRequest) =>
    ['draft', 'open', 'ready', 'blocked'].includes(pullRequest.status)
  );
  const openByBranch = new Map(
    activePullRequests.map((pullRequest) => [
      `${pullRequest.target_branch}:${pullRequest.source_branch}`,
      pullRequest.number,
    ])
  );
  const candidates: Omit<
    PullRequestCompareCandidate,
    'open_pull_request_number' | 'status' | 'status_label'
  >[] = [
    {
      id: `${projectId}:compare:outputs-bundle-refresh`,
      branch: 'outputs/bundle-refresh',
      base_branch: baseBranch,
      title: 'Output bundle refresh',
      description:
        'Refresh generated output bundle state after the latest release-note source changes.',
      head_commit_id: 'sha:31af8d2',
      base_commit_id: 'sha:6de18a0',
      updated_at: '2026-07-17T04:52:00.000Z',
      ahead_by: 3,
      behind_by: 0,
      yops_changes: 18,
      changed_nodes: 11,
      output_impacts: 4,
      source_refs: 5,
      schema: 'Output Bundle Schema v1',
    },
    {
      id: `${projectId}:compare:yschema-contract-source`,
      branch: 'yschema-p0/1145-contract-source',
      base_branch: baseBranch,
      title: 'YSchema contract source alignment',
      description: 'Align contract source state before promoting the validation contract branch.',
      head_commit_id: 'sha:44d2c0b',
      base_commit_id: 'sha:6de18a0',
      updated_at: '2026-07-16T02:15:00.000Z',
      ahead_by: 2,
      behind_by: 1,
      yops_changes: 9,
      changed_nodes: 6,
      output_impacts: 1,
      source_refs: 3,
      schema: 'YSchema Contract v1',
    },
    {
      id: `${projectId}:compare:dev`,
      branch: 'dev',
      base_branch: baseBranch,
      title: 'Development branch sync',
      description: 'Review development branch state before deciding whether it should merge.',
      head_commit_id: 'sha:92bd3aa',
      base_commit_id: 'sha:6de18a0',
      updated_at: '2026-07-10T08:30:00.000Z',
      ahead_by: 5,
      behind_by: 2,
      yops_changes: 24,
      changed_nodes: 16,
      output_impacts: 3,
      source_refs: 8,
      schema: 'Product Foundation Schema v2',
    },
    {
      id: `${projectId}:compare:workspace-audience-handoff`,
      branch: 'workspace/audience-handoff',
      base_branch: baseBranch,
      title: 'Audience handoff updates',
      description: 'Existing draft PR already tracks this workspace branch.',
      head_commit_id: 'sha:8ab61ef',
      base_commit_id: 'sha:6de18a0',
      updated_at: '2026-07-17T03:42:00.000Z',
      ahead_by: 2,
      behind_by: 0,
      yops_changes: 12,
      changed_nodes: 8,
      output_impacts: 2,
      source_refs: 4,
      schema: 'PRD Schema v2',
    },
  ];

  return candidates.map((candidate) => {
    const openPullRequestNumber = openByBranch.get(`${baseBranch}:${candidate.branch}`) ?? null;
    const hasChanges = candidate.ahead_by > 0 || candidate.yops_changes > 0;
    const status = openPullRequestNumber ? 'already_open' : hasChanges ? 'ready' : 'no_changes';
    return {
      ...candidate,
      open_pull_request_number: openPullRequestNumber,
      status,
      status_label:
        status === 'already_open'
          ? `PR #${openPullRequestNumber} already open`
          : status === 'ready'
            ? 'Ready to create'
            : 'No changes',
    };
  });
}

const listPullRequestsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/pull-requests',
  tags: ['Pull requests'],
  summary: 'List project pull requests',
  request: {
    params: z.object({ projectId: z.string().min(1) }),
    query: z.object({
      status: z.enum(['active', 'merged', 'all']).default('active'),
      query: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Project pull requests',
      content: {
        'application/json': { schema: SuccessResponseSchema(PullRequestListResponseSchema) },
      },
    },
  },
});

pullRequestRoutes.openapi(listPullRequestsRoute, (c) => {
  const { projectId } = c.req.valid('param');
  const { query, status } = c.req.valid('query');
  const normalizedQuery = query?.trim().toLowerCase();
  const all = getProjectList(projectId);
  const active = all.filter((item) => ['draft', 'open', 'ready', 'blocked'].includes(item.status));
  const merged = all.filter((item) => ['merged', 'closed'].includes(item.status));
  const scoped = status === 'merged' ? merged : status === 'all' ? all : active;
  const pullRequests = normalizedQuery
    ? scoped.filter((item) =>
        [
          item.title,
          item.description,
          item.source_branch,
          item.target_branch,
          item.author_id,
          item.steward_id,
          item.review_owner_id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : scoped;

  return c.json(
    {
      success: true as const,
      data: {
        pull_requests: pullRequests,
        counts: { active: active.length, merged: merged.length },
      },
    },
    200
  );
});

const comparePullRequestsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/pull-requests/compare',
  tags: ['Pull requests'],
  summary: 'List branch comparisons available for pull request creation',
  request: {
    params: z.object({ projectId: z.string().min(1) }),
    query: z.object({
      base: z.string().default('main'),
    }),
  },
  responses: {
    200: {
      description: 'Comparable project branches',
      content: {
        'application/json': { schema: SuccessResponseSchema(PullRequestCompareResponseSchema) },
      },
    },
  },
});

pullRequestRoutes.openapi(comparePullRequestsRoute, (c) => {
  const { projectId } = c.req.valid('param');
  const { base } = c.req.valid('query');

  return c.json(
    {
      success: true as const,
      data: {
        base_branches: ['main', 'release/2026-07'],
        compare_branches: buildCompareCandidates(projectId, base),
      },
    },
    200
  );
});

const createPullRequestRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/pull-requests',
  tags: ['Pull requests'],
  summary: 'Create a project pull request',
  request: {
    params: z.object({ projectId: z.string().min(1) }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            title: z.string().min(1),
            description: z.string().default(''),
            source_branch: z.string().min(1),
            target_branch: z.string().min(1),
            draft: z.boolean().default(false),
            review_owner_id: z.string().optional(),
            steward_id: z.string().optional(),
            workspace_id: z.string().optional(),
            release_lane_id: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Pull request created',
      content: { 'application/json': { schema: SuccessResponseSchema(PullRequestDetailSchema) } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(createPullRequestRoute, (c) => {
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');
  const pullRequests = getProjectList(projectId);
  const nextNumber = Math.max(0, ...pullRequests.map((item) => item.number)) + 1;
  const createdAt = nowIso();
  const pullRequest: PullRequest = {
    id: `${projectId}:pr:${nextNumber}`,
    number: nextNumber,
    project_id: projectId,
    title: body.title,
    description: body.description,
    source_branch: body.source_branch,
    target_branch: body.target_branch,
    source_commit_id: 'sha:pending',
    target_base_commit_id: 'sha:pending-base',
    status: body.draft ? 'draft' : 'open',
    author_id: 'current-user',
    steward_id: body.steward_id ?? null,
    review_owner_id: body.review_owner_id ?? null,
    workspace_id: body.workspace_id ?? null,
    release_lane_id: body.release_lane_id ?? null,
    linked_work: null,
    created_at: createdAt,
    updated_at: createdAt,
    merged_at: null,
    closed_at: null,
  };
  pullRequests.unshift(pullRequest);
  projectChecks.set(pullRequest.id, buildChecks(pullRequest));
  projectActivity.set(pullRequest.id, [
    {
      id: `${pullRequest.id}:activity:created`,
      pull_request_id: pullRequest.id,
      actor_id: pullRequest.author_id,
      type: 'created',
      message: 'Merge proposal created. Merge readiness checks are queued.',
      created_at: createdAt,
    },
  ]);

  return c.json(
    {
      success: true as const,
      data: {
        ...pullRequest,
        checks: projectChecks.get(pullRequest.id) ?? [],
        activity: projectActivity.get(pullRequest.id) ?? [],
      },
    },
    201
  );
});

const getPullRequestRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/pull-requests/{number}',
  tags: ['Pull requests'],
  summary: 'Get a project pull request',
  request: {
    params: z.object({
      projectId: z.string().min(1),
      number: z.coerce.number().int().positive(),
    }),
  },
  responses: {
    200: {
      description: 'Pull request detail',
      content: { 'application/json': { schema: SuccessResponseSchema(PullRequestDetailSchema) } },
    },
    404: {
      description: 'Pull request not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(getPullRequestRoute, (c) => {
  const { number, projectId } = c.req.valid('param');
  const pullRequest = findPullRequest(projectId, number);
  if (!pullRequest) {
    return c.json(
      {
        success: false as const,
        error: { code: 'PULL_REQUEST_NOT_FOUND', message: 'Pull request not found' },
      },
      404
    );
  }

  return c.json(
    {
      success: true as const,
      data: {
        ...pullRequest,
        checks: projectChecks.get(pullRequest.id) ?? [],
        activity: projectActivity.get(pullRequest.id) ?? [],
      },
    },
    200
  );
});

const listChecksRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/pull-requests/{number}/checks',
  tags: ['Pull requests'],
  summary: 'List pull request readiness checks',
  request: {
    params: z.object({
      projectId: z.string().min(1),
      number: z.coerce.number().int().positive(),
    }),
  },
  responses: {
    200: {
      description: 'Readiness checks',
      content: {
        'application/json': { schema: SuccessResponseSchema(z.array(PullRequestCheckSchema)) },
      },
    },
    404: {
      description: 'Pull request not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(listChecksRoute, (c) => {
  const { number, projectId } = c.req.valid('param');
  const pullRequest = findPullRequest(projectId, number);
  if (!pullRequest) {
    return c.json(
      {
        success: false as const,
        error: { code: 'PULL_REQUEST_NOT_FOUND', message: 'Pull request not found' },
      },
      404
    );
  }

  return c.json({ success: true as const, data: projectChecks.get(pullRequest.id) ?? [] }, 200);
});

const rerunChecksRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/pull-requests/{number}/checks/rerun',
  tags: ['Pull requests'],
  summary: 'Rerun pull request readiness checks',
  request: {
    params: z.object({
      projectId: z.string().min(1),
      number: z.coerce.number().int().positive(),
    }),
  },
  responses: {
    200: {
      description: 'Readiness checks rerun',
      content: {
        'application/json': { schema: SuccessResponseSchema(z.array(PullRequestCheckSchema)) },
      },
    },
  },
});

pullRequestRoutes.openapi(rerunChecksRoute, (c) => {
  const { number, projectId } = c.req.valid('param');
  const pullRequest = findPullRequest(projectId, number);
  if (!pullRequest) {
    return c.json(
      {
        success: false as const,
        error: { code: 'PULL_REQUEST_NOT_FOUND', message: 'Pull request not found' },
      },
      404
    );
  }

  const checks = buildChecks({ ...pullRequest, updated_at: nowIso() });
  projectChecks.set(pullRequest.id, checks);
  projectActivity.set(pullRequest.id, [
    ...(projectActivity.get(pullRequest.id) ?? []),
    {
      id: `${pullRequest.id}:activity:rerun:${Date.now()}`,
      pull_request_id: pullRequest.id,
      actor_id: 'current-user',
      type: 'checks_reran',
      message: 'Merge readiness checks rerun.',
      created_at: nowIso(),
    },
  ]);

  return c.json({ success: true as const, data: checks }, 200);
});

const mergePullRequestRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/pull-requests/{number}/merge',
  tags: ['Pull requests'],
  summary: 'Merge a project pull request',
  request: {
    params: z.object({
      projectId: z.string().min(1),
      number: z.coerce.number().int().positive(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            expected_source_commit_id: z.string().optional(),
            expected_target_commit_id: z.string().optional(),
            strategy: z.literal('deterministic_merge').default('deterministic_merge'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Pull request merged',
      content: { 'application/json': { schema: SuccessResponseSchema(PullRequestSchema) } },
    },
    409: {
      description: 'Pull request is not ready to merge',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(mergePullRequestRoute, (c) => {
  const { number, projectId } = c.req.valid('param');
  const pullRequest = findPullRequest(projectId, number);
  if (!pullRequest) {
    return c.json(
      {
        success: false as const,
        error: { code: 'PULL_REQUEST_NOT_FOUND', message: 'Pull request not found' },
      },
      404
    );
  }

  if (pullRequest.status !== 'ready') {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'PULL_REQUEST_NOT_READY',
          message: 'Only ready pull requests can be merged.',
        },
      },
      409
    );
  }

  pullRequest.status = 'merged' satisfies PullRequestStatus;
  pullRequest.merged_at = nowIso();
  pullRequest.updated_at = pullRequest.merged_at;
  projectActivity.set(pullRequest.id, [
    ...(projectActivity.get(pullRequest.id) ?? []),
    {
      id: `${pullRequest.id}:activity:merged`,
      pull_request_id: pullRequest.id,
      actor_id: 'current-user',
      type: 'merged',
      message: 'Pull request merged through deterministic merge.',
      created_at: pullRequest.merged_at,
    },
  ]);

  return c.json({ success: true as const, data: pullRequest }, 200);
});
