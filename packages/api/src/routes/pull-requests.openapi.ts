import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type Commit,
  collectResult,
  type MergeDecision,
  type MergeResult,
  runOperation,
} from '@t3x-dev/core';
import {
  type AnyDB,
  acquirePullRequestLock,
  addPullRequestActivity,
  type Branch,
  commitMergeDraft,
  createMergeDraft,
  createPullRequest,
  findActivePullRequestByBranches,
  findBranchByName,
  findBranchesByProject,
  findPendingMergeDraft,
  findPullRequestByNumber,
  getCommit,
  getMergeDraft,
  listPullRequestActivity,
  listPullRequestChecks,
  listPullRequestsByProject,
  type PullRequestStatus,
  replacePullRequestChecks,
  type PullRequest as StoredPullRequest,
  type PullRequestActivity as StoredPullRequestActivity,
  type PullRequestCheck as StoredPullRequestCheck,
  updateMergeDraft,
  updatePullRequest,
} from '@t3x-dev/storage';
import { getAuthorFromContext } from '../lib/auth';
import { mapBranchLinearityError } from '../lib/commit-linearity';
import { getDB } from '../lib/db';
import { computeMergeChecks } from '../lib/merge-checks';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import { buildPipelineContext } from '../ops/context';
import { MergeError, mergeExecuteOp, mergePrepareOp } from '../ops/merge';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import { FrameMergeDecisionSchema } from '../schemas/merge';

export const pullRequestRoutes = new OpenAPIHono();

const ACTIVE_STATUSES: PullRequestStatus[] = ['draft', 'open', 'checking', 'ready', 'blocked'];
const FINISHED_STATUSES: PullRequestStatus[] = ['merged', 'closed'];

const PullRequestStatusSchema = z.enum([
  'draft',
  'open',
  'checking',
  'ready',
  'blocked',
  'merged',
  'closed',
]);
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
  merge_draft_id: z.string().nullable(),
  merge_commit_id: z.string().nullable(),
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
    'conflict_resolution',
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

const PullRequestDiffSummarySchema = z.object({
  changed_nodes: z.number().int().nonnegative(),
  yops_operations: z.number().int().nonnegative(),
  output_impacts: z.number().int().nonnegative(),
  source_refs: z.number().int().nonnegative(),
});

const PullRequestDetailSchema = PullRequestSchema.extend({
  diff_summary: PullRequestDiffSummarySchema,
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

type ApiPullRequest = z.infer<typeof PullRequestSchema>;
type ApiPullRequestCheck = z.infer<typeof PullRequestCheckSchema>;
type ApiPullRequestActivity = z.infer<typeof PullRequestActivitySchema>;
type PullRequestCompareCandidate = z.infer<typeof PullRequestCompareCandidateSchema>;

function toApiPullRequest(pullRequest: StoredPullRequest): ApiPullRequest {
  return {
    id: pullRequest.pullRequestId,
    number: pullRequest.number,
    project_id: pullRequest.projectId,
    title: pullRequest.title,
    description: pullRequest.description,
    source_branch: pullRequest.sourceBranch,
    target_branch: pullRequest.targetBranch,
    source_commit_id: pullRequest.sourceCommitHash,
    target_base_commit_id: pullRequest.targetBaseCommitHash,
    merge_draft_id: pullRequest.mergeDraftId,
    merge_commit_id: pullRequest.mergeCommitHash,
    status: pullRequest.status as ApiPullRequest['status'],
    author_id: pullRequest.authorId,
    steward_id: null,
    review_owner_id: pullRequest.reviewOwnerId,
    workspace_id: null,
    release_lane_id: null,
    linked_work: pullRequest.linkedWork,
    created_at: pullRequest.createdAt.toISOString(),
    updated_at: pullRequest.updatedAt.toISOString(),
    merged_at: pullRequest.mergedAt?.toISOString() ?? null,
    closed_at: pullRequest.closedAt?.toISOString() ?? null,
  };
}

function toApiCheck(check: StoredPullRequestCheck): ApiPullRequestCheck {
  return {
    id: check.checkId,
    pull_request_id: check.pullRequestId,
    kind: check.kind as ApiPullRequestCheck['kind'],
    status: check.status as ApiPullRequestCheck['status'],
    title: check.title,
    message: check.message,
    started_at: check.startedAt?.toISOString() ?? null,
    completed_at: check.completedAt?.toISOString() ?? null,
  };
}

function toApiActivity(activity: StoredPullRequestActivity): ApiPullRequestActivity {
  return {
    id: activity.activityId,
    pull_request_id: activity.pullRequestId,
    actor_id: activity.actorId,
    type: activity.type as ApiPullRequestActivity['type'],
    message: activity.message,
    created_at: activity.createdAt.toISOString(),
  };
}

async function toApiDetail(db: AnyDB, pullRequest: StoredPullRequest) {
  const [checks, activity] = await Promise.all([
    listPullRequestChecks(db, pullRequest.pullRequestId),
    listPullRequestActivity(db, pullRequest.pullRequestId),
  ]);
  return {
    ...toApiPullRequest(pullRequest),
    diff_summary: pullRequest.diffSummary,
    checks: checks.map(toApiCheck),
    activity: activity.map(toApiActivity),
  };
}

function errorBody(code: string, message: string) {
  return { success: false as const, error: { code, message } };
}

async function requireProject(c: Parameters<typeof assertProjectAccess>[0], projectId: string) {
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  return { access, db };
}

function flattenContent(content: unknown): Map<string, string> {
  const nodes = new Map<string, string>();
  const trees = (content as { trees?: unknown[] } | null)?.trees;
  if (!Array.isArray(trees)) return nodes;

  const visit = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return;
    const record = node as { key?: unknown; slots?: unknown; children?: unknown[] };
    const key = typeof record.key === 'string' ? record.key : path;
    nodes.set(key, JSON.stringify(record.slots ?? null));
    if (Array.isArray(record.children)) {
      record.children.forEach((child, index) => visit(child, `${path}.${index}`));
    }
  };
  trees.forEach((tree, index) => visit(tree, String(index)));
  return nodes;
}

function countChangedNodes(source: Commit, target: Commit): number {
  const sourceNodes = flattenContent(source.content);
  const targetNodes = flattenContent(target.content);
  const keys = new Set([...sourceNodes.keys(), ...targetNodes.keys()]);
  let changed = 0;
  for (const key of keys) {
    if (sourceNodes.get(key) !== targetNodes.get(key)) changed += 1;
  }
  return changed;
}

async function collectAncestorDistances(db: AnyDB, projectId: string, startHash: string) {
  const distances = new Map<string, number>();
  const queue: Array<{ hash: string; distance: number }> = [{ hash: startHash, distance: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || distances.has(current.hash)) continue;
    const commit = await getCommit(db, current.hash);
    if (!commit || commit.project_id !== projectId) continue;
    distances.set(current.hash, current.distance);
    for (const parent of commit.parents) {
      queue.push({ hash: parent, distance: current.distance + 1 });
    }
  }
  return distances;
}

async function commitDistances(
  db: AnyDB,
  projectId: string,
  sourceHash: string,
  targetHash: string
) {
  if (sourceHash === targetHash) return { ahead: 0, behind: 0 };
  const [sourceAncestors, targetAncestors] = await Promise.all([
    collectAncestorDistances(db, projectId, sourceHash),
    collectAncestorDistances(db, projectId, targetHash),
  ]);
  let best: { ahead: number; behind: number; total: number } | null = null;
  for (const [hash, ahead] of sourceAncestors) {
    const behind = targetAncestors.get(hash);
    if (behind === undefined) continue;
    const total = ahead + behind;
    if (!best || total < best.total) best = { ahead, behind, total };
  }
  return best
    ? { ahead: best.ahead, behind: best.behind }
    : { ahead: sourceAncestors.size, behind: targetAncestors.size };
}

async function buildCompareCandidates(
  db: AnyDB,
  projectId: string,
  baseBranch: Branch,
  branches: Branch[],
  activePullRequests: StoredPullRequest[]
): Promise<PullRequestCompareCandidate[]> {
  if (!baseBranch.headCommitHash) return [];
  const targetCommit = await getCommit(db, baseBranch.headCommitHash);
  if (!targetCommit || targetCommit.project_id !== projectId) return [];

  const openByBranch = new Map(
    activePullRequests.map((pullRequest) => [
      `${pullRequest.targetBranch}:${pullRequest.sourceBranch}`,
      pullRequest.number,
    ])
  );

  const candidates = await Promise.all(
    branches
      .filter((branch) => branch.name !== baseBranch.name && branch.headCommitHash)
      .map(async (branch): Promise<PullRequestCompareCandidate | null> => {
        const sourceCommit = await getCommit(db, branch.headCommitHash as string);
        if (!sourceCommit || sourceCommit.project_id !== projectId) return null;
        const distances = await commitDistances(
          db,
          projectId,
          sourceCommit.hash,
          targetCommit.hash
        );
        const openPullRequestNumber = openByBranch.get(`${baseBranch.name}:${branch.name}`) ?? null;
        const changedNodes = countChangedNodes(sourceCommit, targetCommit);
        const hasChanges = sourceCommit.hash !== targetCommit.hash && changedNodes > 0;
        const status = openPullRequestNumber ? 'already_open' : hasChanges ? 'ready' : 'no_changes';
        return {
          id: `${projectId}:compare:${branch.branchId}`,
          branch: branch.name,
          base_branch: baseBranch.name,
          title: branch.description?.trim() || `Merge ${branch.name}`,
          description:
            branch.description?.trim() ||
            `Review ${branch.name} before merging into ${baseBranch.name}.`,
          head_commit_id: sourceCommit.hash,
          base_commit_id: targetCommit.hash,
          updated_at: branch.updatedAt.toISOString(),
          ahead_by: distances.ahead,
          behind_by: distances.behind,
          yops_changes: sourceCommit.yops_log_ids.length,
          changed_nodes: changedNodes,
          output_impacts: 0,
          source_refs: sourceCommit.sources?.length ?? 0,
          schema: sourceCommit.schema,
          status,
          status_label:
            status === 'already_open'
              ? `PR #${openPullRequestNumber} already open`
              : status === 'ready'
                ? 'Available'
                : 'No changes',
          open_pull_request_number: openPullRequestNumber,
        };
      })
  );
  return candidates.filter(
    (candidate): candidate is PullRequestCompareCandidate => candidate !== null
  );
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
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(listPullRequestsRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { query, status } = c.req.valid('query');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;

  const all = await listPullRequestsByProject(db, projectId);
  const active = all.filter((item) => ACTIVE_STATUSES.includes(item.status as PullRequestStatus));
  const finished = all.filter((item) =>
    FINISHED_STATUSES.includes(item.status as PullRequestStatus)
  );
  const scoped = status === 'merged' ? finished : status === 'all' ? all : active;
  const normalizedQuery = query?.trim().toLowerCase();
  const filtered = normalizedQuery
    ? scoped.filter((item) =>
        [
          item.title,
          item.description,
          item.sourceBranch,
          item.targetBranch,
          item.authorId,
          item.reviewOwnerId,
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
        pull_requests: filtered.map(toApiPullRequest),
        counts: { active: active.length, merged: finished.length },
      },
    },
    200
  );
});

const comparePullRequestsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/pull-requests/compare',
  tags: ['Pull requests'],
  summary: 'List real branch comparisons available for pull request creation',
  request: {
    params: z.object({ projectId: z.string().min(1) }),
    query: z.object({ base: z.string().default('main') }),
  },
  responses: {
    200: {
      description: 'Comparable project branches',
      content: {
        'application/json': { schema: SuccessResponseSchema(PullRequestCompareResponseSchema) },
      },
    },
    400: {
      description: 'Base branch has no commit',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project or base branch not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(comparePullRequestsRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { base } = c.req.valid('query');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  const branches = await findBranchesByProject(db, { projectId });
  const baseBranch = branches.find((branch) => branch.name === base);
  if (!baseBranch)
    return c.json(errorBody('BASE_BRANCH_NOT_FOUND', `Branch ${base} not found.`), 404);
  if (!baseBranch.headCommitHash) {
    return c.json(errorBody('BASE_BRANCH_EMPTY', `Branch ${base} has no commits.`), 400);
  }
  const active = await listPullRequestsByProject(db, projectId, ACTIVE_STATUSES);
  const candidates = await buildCompareCandidates(db, projectId, baseBranch, branches, active);
  return c.json(
    {
      success: true as const,
      data: {
        base_branches: branches
          .filter((branch) => branch.headCommitHash)
          .map((branch) => branch.name),
        compare_branches: candidates,
      },
    },
    200
  );
});

const createPullRequestRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/pull-requests',
  tags: ['Pull requests'],
  summary: 'Create a project pull request from real branch heads',
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
            linked_work: z.string().optional(),
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
      description: 'Invalid branch pair',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Project, branch, or commit not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'A pull request already exists',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(createPullRequestRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  if (body.source_branch === body.target_branch) {
    return c.json(
      errorBody('PULL_REQUEST_BRANCHES_IDENTICAL', 'Source and target branches must be different.'),
      400
    );
  }

  const [sourceBranch, targetBranch] = await Promise.all([
    findBranchByName(db, projectId, body.source_branch),
    findBranchByName(db, projectId, body.target_branch),
  ]);
  if (!sourceBranch || !targetBranch) {
    return c.json(
      errorBody('PULL_REQUEST_BRANCH_NOT_FOUND', 'Source or target branch does not exist.'),
      404
    );
  }
  if (!sourceBranch.headCommitHash || !targetBranch.headCommitHash) {
    return c.json(
      errorBody(
        'PULL_REQUEST_BRANCH_EMPTY',
        'Source and target branches must both contain a commit.'
      ),
      400
    );
  }
  const existing = await findActivePullRequestByBranches(
    db,
    projectId,
    body.source_branch,
    body.target_branch
  );
  if (existing) {
    return c.json(
      errorBody(
        'PULL_REQUEST_ALREADY_EXISTS',
        `PR #${existing.number} already tracks this branch pair.`
      ),
      409
    );
  }
  const [sourceCommit, targetCommit] = await Promise.all([
    getCommit(db, sourceBranch.headCommitHash),
    getCommit(db, targetBranch.headCommitHash),
  ]);
  if (
    !sourceCommit ||
    sourceCommit.project_id !== projectId ||
    !targetCommit ||
    targetCommit.project_id !== projectId
  ) {
    return c.json(
      errorBody(
        'PULL_REQUEST_COMMIT_NOT_FOUND',
        'A branch head does not resolve to a project commit.'
      ),
      404
    );
  }
  const changedNodes = countChangedNodes(sourceCommit, targetCommit);
  if (sourceCommit.hash === targetCommit.hash || changedNodes === 0) {
    return c.json(
      errorBody(
        'PULL_REQUEST_NO_CHANGES',
        'The source branch has no changes against the target branch.'
      ),
      400
    );
  }

  const actorId = getUserId(c) ?? 'current-user';
  const pullRequest = await createPullRequest(db, {
    projectId,
    title: body.title,
    description: body.description,
    sourceBranch: sourceBranch.name,
    targetBranch: targetBranch.name,
    sourceCommitHash: sourceCommit.hash,
    targetBaseCommitHash: targetCommit.hash,
    status: body.draft ? 'draft' : 'open',
    authorId: actorId,
    reviewOwnerId: body.review_owner_id,
    linkedWork: body.linked_work,
    diffSummary: {
      changed_nodes: changedNodes,
      yops_operations: sourceCommit.yops_log_ids.length,
      output_impacts: 0,
      source_refs: sourceCommit.sources?.length ?? 0,
    },
  });
  const startedAt = pullRequest.createdAt;
  await replacePullRequestChecks(db, pullRequest.pullRequestId, [
    {
      kind: 'source_commit',
      status: 'passed',
      title: 'Source commit',
      message: `${sourceCommit.hash} exists on ${sourceBranch.name}.`,
      startedAt,
      completedAt: startedAt,
    },
    {
      kind: 'target_commit',
      status: 'passed',
      title: 'Target commit',
      message: `${targetCommit.hash} exists on ${targetBranch.name}.`,
      startedAt,
      completedAt: startedAt,
    },
    {
      kind: 'merge_simulation',
      status: 'pending',
      title: 'Merge simulation',
      message: 'Run readiness to prepare a deterministic merge.',
      startedAt,
    },
  ]);
  await addPullRequestActivity(db, pullRequest.pullRequestId, {
    actorId,
    type: 'created',
    message: 'Pull request created. Merge readiness checks are queued.',
    createdAt: pullRequest.createdAt,
  });
  return c.json({ success: true as const, data: await toApiDetail(db, pullRequest) }, 201);
});

const getPullRequestRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/pull-requests/{number}',
  tags: ['Pull requests'],
  summary: 'Get a project pull request',
  request: {
    params: z.object({ projectId: z.string().min(1), number: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description: 'Pull request detail',
      content: { 'application/json': { schema: SuccessResponseSchema(PullRequestDetailSchema) } },
    },
    404: {
      description: 'Project or pull request not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(getPullRequestRoute, async (c) => {
  const { number, projectId } = c.req.valid('param');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  const pullRequest = await findPullRequestByNumber(db, projectId, number);
  if (!pullRequest)
    return c.json(errorBody('PULL_REQUEST_NOT_FOUND', 'Pull request not found.'), 404);
  return c.json({ success: true as const, data: await toApiDetail(db, pullRequest) }, 200);
});

const listChecksRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/pull-requests/{number}/checks',
  tags: ['Pull requests'],
  summary: 'List pull request readiness checks',
  request: {
    params: z.object({ projectId: z.string().min(1), number: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description: 'Readiness checks',
      content: {
        'application/json': { schema: SuccessResponseSchema(z.array(PullRequestCheckSchema)) },
      },
    },
    404: {
      description: 'Project or pull request not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(listChecksRoute, async (c) => {
  const { number, projectId } = c.req.valid('param');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  const pullRequest = await findPullRequestByNumber(db, projectId, number);
  if (!pullRequest)
    return c.json(errorBody('PULL_REQUEST_NOT_FOUND', 'Pull request not found.'), 404);
  const checks = await listPullRequestChecks(db, pullRequest.pullRequestId);
  return c.json({ success: true as const, data: checks.map(toApiCheck) }, 200);
});

const rerunChecksRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/pull-requests/{number}/checks/rerun',
  tags: ['Pull requests'],
  summary: 'Rerun pull request readiness checks',
  request: {
    params: z.object({ projectId: z.string().min(1), number: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description: 'Pull request readiness rerun',
      content: { 'application/json': { schema: SuccessResponseSchema(PullRequestDetailSchema) } },
    },
    404: {
      description: 'Project, pull request, branch, or commit not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Pull request is no longer active',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(rerunChecksRoute, async (c) => {
  const { number, projectId } = c.req.valid('param');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  const pullRequest = await findPullRequestByNumber(db, projectId, number);
  if (!pullRequest)
    return c.json(errorBody('PULL_REQUEST_NOT_FOUND', 'Pull request not found.'), 404);
  if (FINISHED_STATUSES.includes(pullRequest.status as PullRequestStatus)) {
    return c.json(
      errorBody('PULL_REQUEST_NOT_ACTIVE', 'Only active pull requests can rerun readiness checks.'),
      409
    );
  }
  const [sourceBranch, targetBranch, sourceCommit, targetCommit] = await Promise.all([
    findBranchByName(db, projectId, pullRequest.sourceBranch),
    findBranchByName(db, projectId, pullRequest.targetBranch),
    getCommit(db, pullRequest.sourceCommitHash),
    getCommit(db, pullRequest.targetBaseCommitHash),
  ]);
  if (!sourceBranch || !targetBranch || !sourceCommit || !targetCommit) {
    return c.json(
      errorBody(
        'PULL_REQUEST_REVIEW_INPUT_NOT_FOUND',
        'A reviewed branch or commit no longer exists.'
      ),
      404
    );
  }

  const previousStatus = pullRequest.status;
  const actorId = getUserId(c) ?? 'current-user';
  const sourceFresh = sourceBranch.headCommitHash === pullRequest.sourceCommitHash;
  const targetFresh = targetBranch.headCommitHash === pullRequest.targetBaseCommitHash;

  if (!sourceFresh || !targetFresh) {
    const blocked = await updatePullRequest(db, pullRequest.pullRequestId, { status: 'blocked' });
    if (!blocked)
      return c.json(errorBody('PULL_REQUEST_NOT_FOUND', 'Pull request not found.'), 404);
    const now = blocked.updatedAt;
    await replacePullRequestChecks(db, blocked.pullRequestId, [
      {
        kind: 'source_commit',
        status: sourceFresh ? 'passed' : 'blocked',
        title: 'Source branch snapshot',
        message: sourceFresh
          ? `${pullRequest.sourceCommitHash} is still the source branch head.`
          : `${pullRequest.sourceBranch} moved after this PR snapshot was created.`,
        startedAt: now,
        completedAt: now,
      },
      {
        kind: 'base_freshness',
        status: targetFresh ? 'passed' : 'blocked',
        title: 'Target branch freshness',
        message: targetFresh
          ? `${pullRequest.targetBaseCommitHash} is still the target branch head.`
          : `${pullRequest.targetBranch} moved after readiness was last prepared.`,
        startedAt: now,
        completedAt: now,
      },
      {
        kind: 'merge_simulation',
        status: 'blocked',
        title: 'Merge preparation',
        message: 'Refresh the PR commit snapshot before deterministic merge preparation.',
        startedAt: now,
        completedAt: now,
      },
    ]);
    await addPullRequestActivity(db, blocked.pullRequestId, {
      actorId,
      type: 'checks_reran',
      message: 'Readiness blocked because a reviewed branch head changed.',
      createdAt: now,
    });
    if (previousStatus !== blocked.status) {
      await addPullRequestActivity(db, blocked.pullRequestId, {
        actorId,
        type: 'status_changed',
        message: `Pull request moved from ${previousStatus} to blocked.`,
        createdAt: now,
      });
    }
    return c.json({ success: true as const, data: await toApiDetail(db, blocked) }, 200);
  }

  const checking = await updatePullRequest(db, pullRequest.pullRequestId, {
    status: 'checking',
  });
  if (!checking) return c.json(errorBody('PULL_REQUEST_NOT_FOUND', 'Pull request not found.'), 404);

  const context = await buildPipelineContext(c, projectId);
  const { prepared: freshlyPrepared } = await collectResult(
    runOperation(
      mergePrepareOp,
      {
        source_hash: pullRequest.sourceCommitHash,
        target_hash: pullRequest.targetBaseCommitHash,
      },
      context
    )
  );

  let draft = pullRequest.mergeDraftId
    ? await getMergeDraft(db, pullRequest.mergeDraftId)
    : await findPendingMergeDraft(
        db,
        projectId,
        pullRequest.sourceCommitHash,
        pullRequest.targetBaseCommitHash,
        pullRequest.sourceBranch,
        pullRequest.targetBranch
      );

  if (
    draft &&
    (draft.status !== 'pending' ||
      draft.sourceHash !== pullRequest.sourceCommitHash ||
      draft.targetHash !== pullRequest.targetBaseCommitHash)
  ) {
    draft = null;
  }

  if (draft) {
    const storedPrepared = JSON.parse(draft.preparedJson) as MergeResult & {
      decisions?: MergeDecision;
    };
    const preparedWithDecisions = {
      ...freshlyPrepared,
      ...(storedPrepared.decisions ? { decisions: storedPrepared.decisions } : {}),
    };
    draft = await updateMergeDraft(db, draft.draftId, { prepared: preparedWithDecisions });
  } else {
    draft = await createMergeDraft(db, {
      projectId,
      sourceHash: pullRequest.sourceCommitHash,
      targetHash: pullRequest.targetBaseCommitHash,
      sourceBranch: pullRequest.sourceBranch,
      targetBranch: pullRequest.targetBranch,
      prepared: freshlyPrepared,
      message: `Merge PR #${pullRequest.number}: ${pullRequest.title}`,
    });
  }

  if (!draft) throw new Error('Could not create or update the pull request merge draft.');

  const prepared = JSON.parse(draft.preparedJson) as MergeResult & {
    decisions?: MergeDecision;
  };
  const unresolvedConflicts = prepared.conflicts.filter(
    (conflict) => !prepared.decisions?.conflictResolutions[conflict.path]
  );
  const serverChecks = await computeMergeChecks(db, draft);
  const serverChecksPassed = serverChecks.every((check) => check.passed);
  const nextStatus: PullRequestStatus =
    unresolvedConflicts.length === 0 && serverChecksPassed ? 'ready' : 'blocked';
  const updated = await updatePullRequest(db, pullRequest.pullRequestId, {
    status: nextStatus,
    mergeDraftId: draft.draftId,
    diffSummary: {
      changed_nodes:
        prepared.autoKept.length +
        prepared.conflicts.length +
        prepared.onlyInSource.length +
        prepared.onlyInTarget.length,
      yops_operations: sourceCommit.yops_log_ids.length,
      output_impacts: pullRequest.diffSummary.output_impacts,
      source_refs: sourceCommit.sources?.length ?? 0,
    },
  });
  if (!updated) return c.json(errorBody('PULL_REQUEST_NOT_FOUND', 'Pull request not found.'), 404);
  const now = updated.updatedAt;
  await replacePullRequestChecks(db, updated.pullRequestId, [
    {
      kind: 'source_commit',
      status: 'passed',
      title: 'Source commit',
      message: `${sourceCommit.hash} is the current head of ${sourceBranch.name}.`,
      startedAt: now,
      completedAt: now,
    },
    {
      kind: 'base_freshness',
      status: 'passed',
      title: 'Target branch freshness',
      message: `${targetCommit.hash} is the current head of ${targetBranch.name}.`,
      startedAt: now,
      completedAt: now,
    },
    {
      kind: 'merge_simulation',
      status: 'passed',
      title: 'Deterministic merge preparation',
      message: `Prepared draft ${draft.draftId} from the reviewed commit snapshots.`,
      startedAt: now,
      completedAt: now,
    },
    {
      kind: 'conflict_resolution',
      status: unresolvedConflicts.length === 0 ? 'passed' : 'blocked',
      title: 'Conflict resolution',
      message:
        unresolvedConflicts.length === 0
          ? 'No unresolved structural conflicts remain.'
          : `${unresolvedConflicts.length} structural conflict(s) require a decision.`,
      startedAt: now,
      completedAt: now,
    },
    ...serverChecks.map((check) => ({
      kind: 'review_requirement' as const,
      status: check.passed ? ('passed' as const) : ('blocked' as const),
      title: check.label,
      message: check.detail ?? null,
      startedAt: now,
      completedAt: now,
    })),
  ]);
  await addPullRequestActivity(db, updated.pullRequestId, {
    actorId,
    type: 'checks_reran',
    message: `Deterministic merge readiness prepared in draft ${draft.draftId}.`,
    createdAt: now,
  });
  if (previousStatus !== updated.status) {
    await addPullRequestActivity(db, updated.pullRequestId, {
      actorId,
      type: 'status_changed',
      message: `Pull request moved from ${previousStatus} to ${updated.status}.`,
      createdAt: now,
    });
  }
  return c.json({ success: true as const, data: await toApiDetail(db, updated) }, 200);
});

const closePullRequestRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/pull-requests/{number}/close',
  tags: ['Pull requests'],
  summary: 'Close a project pull request without merging',
  request: {
    params: z.object({ projectId: z.string().min(1), number: z.coerce.number().int().positive() }),
  },
  responses: {
    200: {
      description: 'Pull request closed',
      content: { 'application/json': { schema: SuccessResponseSchema(PullRequestSchema) } },
    },
    404: {
      description: 'Project or pull request not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Pull request is already finished',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

pullRequestRoutes.openapi(closePullRequestRoute, async (c) => {
  const { number, projectId } = c.req.valid('param');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  const pullRequest = await findPullRequestByNumber(db, projectId, number);
  if (!pullRequest)
    return c.json(errorBody('PULL_REQUEST_NOT_FOUND', 'Pull request not found.'), 404);
  if (FINISHED_STATUSES.includes(pullRequest.status as PullRequestStatus)) {
    return c.json(
      errorBody(
        'PULL_REQUEST_ALREADY_CLOSED',
        'Only active pull requests can be closed without merging.'
      ),
      409
    );
  }
  const closedAt = new Date();
  const closed = await updatePullRequest(db, pullRequest.pullRequestId, {
    status: 'closed',
    closedAt,
  });
  if (!closed) return c.json(errorBody('PULL_REQUEST_NOT_FOUND', 'Pull request not found.'), 404);
  await addPullRequestActivity(db, closed.pullRequestId, {
    actorId: getUserId(c) ?? 'current-user',
    type: 'closed',
    message: 'Pull request closed without merging.',
    createdAt: closedAt,
  });
  return c.json({ success: true as const, data: toApiPullRequest(closed) }, 200);
});

const mergePullRequestRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/pull-requests/{number}/merge',
  tags: ['Pull requests'],
  summary: 'Merge a project pull request',
  request: {
    params: z.object({ projectId: z.string().min(1), number: z.coerce.number().int().positive() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            expected_source_commit_id: z.string().min(1),
            expected_target_commit_id: z.string().min(1),
            strategy: z.literal('deterministic_merge').default('deterministic_merge'),
            message: z.string().trim().min(1).optional(),
            decisions: FrameMergeDecisionSchema.optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Pull request merged',
      content: { 'application/json': { schema: SuccessResponseSchema(PullRequestDetailSchema) } },
    },
    404: {
      description: 'Project or pull request not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    409: {
      description: 'Pull request is not ready or its reviewed branch heads changed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Merge failed and was rolled back',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error OpenAPI cannot narrow the transaction error response union.
pullRequestRoutes.openapi(mergePullRequestRoute, async (c) => {
  const { number, projectId } = c.req.valid('param');
  const body = c.req.valid('json');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  const author = await getAuthorFromContext(c);
  const actorId = getUserId(c) ?? author.id ?? 'current-user';
  const pipelineContext = await buildPipelineContext(c, projectId);

  try {
    const merged = await db.transaction(async (tx) => {
      await acquirePullRequestLock(tx, projectId, number);
      const pullRequest = await findPullRequestByNumber(tx, projectId, number);
      if (!pullRequest) throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
      if (pullRequest.status !== 'ready') {
        throw new MergeError(
          'PULL_REQUEST_NOT_READY',
          `Pull request must be ready before merging; current status is ${pullRequest.status}.`
        );
      }
      if (!pullRequest.mergeDraftId) {
        throw new MergeError(
          'PULL_REQUEST_MERGE_NOT_PREPARED',
          'Run readiness before merging this pull request.'
        );
      }

      const [sourceBranch, targetBranch, draft] = await Promise.all([
        findBranchByName(tx, projectId, pullRequest.sourceBranch),
        findBranchByName(tx, projectId, pullRequest.targetBranch),
        getMergeDraft(tx, pullRequest.mergeDraftId),
      ]);
      if (!sourceBranch || !targetBranch || !draft) {
        throw new MergeError(
          'PULL_REQUEST_MERGE_NOT_PREPARED',
          'A reviewed branch or merge draft no longer exists. Rerun readiness.'
        );
      }

      const sourceFresh =
        sourceBranch.headCommitHash === pullRequest.sourceCommitHash &&
        body.expected_source_commit_id === pullRequest.sourceCommitHash;
      const targetFresh =
        targetBranch.headCommitHash === pullRequest.targetBaseCommitHash &&
        body.expected_target_commit_id === pullRequest.targetBaseCommitHash;
      if (!sourceFresh || !targetFresh) {
        throw new MergeError(
          'PULL_REQUEST_HEAD_CHANGED',
          'A reviewed branch head changed. Rerun readiness before merging.'
        );
      }
      if (
        draft.status !== 'pending' ||
        draft.projectId !== projectId ||
        draft.sourceHash !== pullRequest.sourceCommitHash ||
        draft.targetHash !== pullRequest.targetBaseCommitHash ||
        draft.sourceBranch !== pullRequest.sourceBranch ||
        draft.targetBranch !== pullRequest.targetBranch
      ) {
        throw new MergeError(
          'PULL_REQUEST_MERGE_NOT_PREPARED',
          'The merge draft does not match this pull request. Rerun readiness.'
        );
      }

      const preparedWithDecisions = JSON.parse(draft.preparedJson) as MergeResult & {
        decisions?: MergeDecision;
      };
      const decisions: MergeDecision = (body.decisions as MergeDecision | undefined) ??
        preparedWithDecisions.decisions ?? {
          conflictResolutions: {},
          keepFromSource: preparedWithDecisions.onlyInSource,
          keepFromTarget: preparedWithDecisions.onlyInTarget,
          keepRelationsFromSource: true,
          keepRelationsFromTarget: true,
        };
      const context = { ...pipelineContext, db: tx as AnyDB };
      const result = await collectResult(
        runOperation(
          mergeExecuteOp,
          {
            source_hash: pullRequest.sourceCommitHash,
            target_hash: pullRequest.targetBaseCommitHash,
            prepared: preparedWithDecisions,
            decisions,
            message:
              body.message ?? `Merge pull request #${pullRequest.number}: ${pullRequest.title}`,
            branch: pullRequest.targetBranch,
            author,
            manage_transaction: false,
          },
          context
        )
      );

      await commitMergeDraft(tx, draft.draftId);
      const mergedAt = new Date();
      const updated = await updatePullRequest(tx, pullRequest.pullRequestId, {
        status: 'merged',
        mergeCommitHash: result.commit.hash,
        mergedAt,
        closedAt: mergedAt,
      });
      if (!updated) throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
      await addPullRequestActivity(tx, updated.pullRequestId, {
        actorId,
        type: 'merged',
        message: `Merged ${updated.sourceBranch} into ${updated.targetBranch} as ${result.commit.hash}.`,
        createdAt: mergedAt,
      });
      return updated;
    });

    return c.json({ success: true as const, data: await toApiDetail(db, merged) }, 200);
  } catch (error) {
    const linearity = mapBranchLinearityError(c, error);
    if (linearity) return linearity;
    if (error instanceof MergeError) {
      if (error.code === 'PULL_REQUEST_NOT_FOUND') {
        return c.json(errorBody(error.code, error.message), 404);
      }
      if (
        error.code === 'PULL_REQUEST_NOT_READY' ||
        error.code === 'PULL_REQUEST_HEAD_CHANGED' ||
        error.code === 'PULL_REQUEST_MERGE_NOT_PREPARED' ||
        error.code === 'UNRESOLVED_CONFLICTS'
      ) {
        return c.json(errorBody(error.code, error.message), 409);
      }
    }
    return c.json(
      errorBody(
        'PULL_REQUEST_MERGE_FAILED',
        error instanceof Error ? error.message : 'Pull request merge failed.'
      ),
      500
    );
  }
});
