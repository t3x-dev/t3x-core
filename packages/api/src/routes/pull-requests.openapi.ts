import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  collectResult,
  diffCommits,
  type MergeDecision,
  type MergeResult,
  runOperation,
  type SemanticContent,
} from '@t3x-dev/core';
import {
  type AnyDB,
  acquirePullRequestLock,
  addPullRequestActivity,
  type Branch,
  commitMergeDraft,
  createMergeDraft,
  createPullRequest,
  ensureMainBranch,
  findActivePullRequestByBranches,
  findBranchByName,
  findBranchesByProject,
  findPendingMergeDraft,
  findPullRequestByNumber,
  getMergeDraft,
  getYOpsForTransitionCommit,
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
import { getDB } from '../lib/db';
import { computeMergeChecks } from '../lib/merge-checks';
import { readMergeDraftDecision } from '../lib/merge-draft-decisions';
import { assertProjectAccess, getUserId } from '../lib/project-access';
import { getRepositorySemanticCommit } from '../lib/repository-state-transition';
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
  base_commit_id: z.string().nullable(),
  updated_at: z.string(),
  ahead_by: z.number().int().nonnegative(),
  behind_by: z.number().int().nonnegative(),
  yops_changes: z.number().int().nonnegative(),
  changed_nodes: z.number().int().nonnegative(),
  output_impacts: z.number().int().nonnegative(),
  source_refs: z.number().int().nonnegative(),
  schema: z.string(),
  status: z.enum(['ready', 'already_open', 'no_changes', 'base_empty']),
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

interface RepositoryCommitView {
  hash: string;
  project_id: string;
  parents: string[];
  content: SemanticContent;
  schema: string;
  yops_log_ids: string[];
  sources: unknown[];
}

async function loadRepositoryCommit(
  db: AnyDB,
  projectId: string,
  digest: string
): Promise<RepositoryCommitView | null> {
  const commit = await getRepositorySemanticCommit(db, digest, projectId);
  if (commit === null) return null;
  const yopsRows = await getYOpsForTransitionCommit(db, projectId, digest);
  return {
    hash: commit.digest,
    project_id: commit.projectId,
    parents: commit.parents,
    content: commit.semanticContent,
    schema: commit.schema,
    yops_log_ids: yopsRows.map((row) => row.id),
    sources: [...commit.evidence],
  };
}

function summarizeCommitChanges(source: RepositoryCommitView, target: RepositoryCommitView) {
  const diff = diffCommits(target.content, source.content);
  const changedNodes = diff.modified.length + diff.onlyInSource.length + diff.onlyInTarget.length;
  const changedRelations = diff.relationsAdded.length + diff.relationsRemoved.length;
  return { changedNodes, hasChanges: changedNodes > 0 || changedRelations > 0 };
}

async function collectAncestorDistances(db: AnyDB, projectId: string, startHash: string) {
  const distances = new Map<string, number>();
  const queue: Array<{ hash: string; distance: number }> = [{ hash: startHash, distance: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || distances.has(current.hash)) continue;
    const commit = await loadRepositoryCommit(db, projectId, current.hash);
    if (!commit) continue;
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
  const comparisonBranches = branches.filter(
    (branch) => branch.name !== baseBranch.name && branch.headCommitHash
  );
  // A lone committed base has nothing to compare. Return its branch metadata
  // without decoding the immutable head; semantic decoding belongs to an
  // actual comparison, not to populating the base selector.
  if (comparisonBranches.length === 0) return [];

  const requiresSemanticComparison = comparisonBranches.some(
    (branch) => branch.headCommitHash !== baseBranch.headCommitHash
  );
  const targetCommit =
    baseBranch.headCommitHash && requiresSemanticComparison
      ? await loadRepositoryCommit(db, projectId, baseBranch.headCommitHash)
      : null;
  if (baseBranch.headCommitHash && requiresSemanticComparison && !targetCommit) {
    return [];
  }

  const openByBranch = new Map(
    activePullRequests.map((pullRequest) => [
      `${pullRequest.targetBranch}:${pullRequest.sourceBranch}`,
      pullRequest.number,
    ])
  );

  const candidates = await Promise.all(
    comparisonBranches.map(async (branch): Promise<PullRequestCompareCandidate | null> => {
      const openPullRequestNumber = openByBranch.get(`${baseBranch.name}:${branch.name}`) ?? null;
      if (
        baseBranch.headCommitHash !== null &&
        branch.headCommitHash === baseBranch.headCommitHash
      ) {
        return {
          id: `${projectId}:compare:${branch.branchId}`,
          branch: branch.name,
          base_branch: baseBranch.name,
          title: branch.description?.trim() || `Merge ${branch.name}`,
          description:
            branch.description?.trim() ||
            `Review ${branch.name} before merging into ${baseBranch.name}.`,
          head_commit_id: branch.headCommitHash,
          base_commit_id: baseBranch.headCommitHash,
          updated_at: branch.updatedAt.toISOString(),
          ahead_by: 0,
          behind_by: 0,
          yops_changes: 0,
          changed_nodes: 0,
          output_impacts: 0,
          source_refs: 0,
          schema: 't3x/commit/v2',
          status: openPullRequestNumber ? 'already_open' : 'no_changes',
          status_label: openPullRequestNumber
            ? `PR #${openPullRequestNumber} already open`
            : 'No semantic changes',
          open_pull_request_number: openPullRequestNumber,
        };
      }
      const sourceCommit = await loadRepositoryCommit(
        db,
        projectId,
        branch.headCommitHash as string
      );
      if (!sourceCommit) return null;
      const distances = targetCommit
        ? await commitDistances(db, projectId, sourceCommit.hash, targetCommit.hash)
        : {
            ahead: (await collectAncestorDistances(db, projectId, sourceCommit.hash)).size,
            behind: 0,
          };
      const { changedNodes, hasChanges: hasSemanticChanges } = targetCommit
        ? summarizeCommitChanges(sourceCommit, targetCommit)
        : summarizeCommitChanges(sourceCommit, {
            ...sourceCommit,
            content: { trees: [], relations: [] },
          });
      const hasChanges = distances.ahead > 0 && hasSemanticChanges;
      const status = !targetCommit
        ? 'base_empty'
        : openPullRequestNumber
          ? 'already_open'
          : hasChanges
            ? 'ready'
            : 'no_changes';
      return {
        id: `${projectId}:compare:${branch.branchId}`,
        branch: branch.name,
        base_branch: baseBranch.name,
        title: branch.description?.trim() || `Merge ${branch.name}`,
        description:
          branch.description?.trim() ||
          `Review ${branch.name} before merging into ${baseBranch.name}.`,
        head_commit_id: sourceCommit.hash,
        base_commit_id: targetCommit?.hash ?? null,
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
              : status === 'base_empty'
                ? 'Base has no commit'
                : distances.ahead === 0 && distances.behind > 0
                  ? 'Behind base'
                  : hasSemanticChanges
                    ? 'No changes'
                    : 'No semantic changes',
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

// @ts-expect-error - OpenAPI handler return type
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

// @ts-expect-error - OpenAPI handler return type
pullRequestRoutes.openapi(comparePullRequestsRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { base } = c.req.valid('query');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  await ensureMainBranch(db, projectId);
  const branches = await findBranchesByProject(db, { projectId });
  const baseBranch = branches.find((branch) => branch.name === base);
  if (!baseBranch)
    return c.json(errorBody('BASE_BRANCH_NOT_FOUND', `Branch ${base} not found.`), 404);
  const active = await listPullRequestsByProject(db, projectId, ACTIVE_STATUSES);
  const candidates = await buildCompareCandidates(db, projectId, baseBranch, branches, active);
  return c.json(
    {
      success: true as const,
      data: {
        base_branches: branches.map((branch) => branch.name),
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
            expected_source_commit_id: z.string().min(1),
            expected_target_commit_id: z.string().min(1),
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
      description: 'A pull request already exists or a compared branch head moved',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
pullRequestRoutes.openapi(createPullRequestRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const body = c.req.valid('json');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  await ensureMainBranch(db, projectId);
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
  if (
    sourceBranch.headCommitHash !== body.expected_source_commit_id ||
    targetBranch.headCommitHash !== body.expected_target_commit_id
  ) {
    return c.json(
      errorBody(
        'PULL_REQUEST_BRANCH_HEAD_CHANGED',
        'A branch moved after comparison. Refresh the comparison before creating the pull request.'
      ),
      409
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
    loadRepositoryCommit(db, projectId, sourceBranch.headCommitHash),
    loadRepositoryCommit(db, projectId, targetBranch.headCommitHash),
  ]);
  if (!sourceCommit || !targetCommit) {
    return c.json(
      errorBody(
        'PULL_REQUEST_COMMIT_NOT_FOUND',
        'A branch head does not resolve to a project commit.'
      ),
      404
    );
  }
  const distances = await commitDistances(db, projectId, sourceCommit.hash, targetCommit.hash);
  const { changedNodes, hasChanges } = summarizeCommitChanges(sourceCommit, targetCommit);
  if (distances.ahead === 0 || !hasChanges) {
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

// @ts-expect-error - OpenAPI handler return type
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

// @ts-expect-error - OpenAPI handler return type
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
    500: {
      description: 'Readiness could not be recorded',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// @ts-expect-error OpenAPI cannot narrow the transaction error response union.
pullRequestRoutes.openapi(rerunChecksRoute, async (c) => {
  const { number, projectId } = c.req.valid('param');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  const actorId = getUserId(c) ?? 'current-user';
  const pipelineContext = await buildPipelineContext(c, projectId);

  try {
    const updated = await db.transaction(async (tx) => {
      await acquirePullRequestLock(tx, projectId, number);
      let pullRequest = await findPullRequestByNumber(tx, projectId, number);
      if (!pullRequest) throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
      if (FINISHED_STATUSES.includes(pullRequest.status as PullRequestStatus)) {
        throw new MergeError(
          'PULL_REQUEST_NOT_ACTIVE',
          'Only active pull requests can rerun readiness checks.'
        );
      }

      const sourceBranch = await findBranchByName(tx, projectId, pullRequest.sourceBranch);
      const targetBranch = await findBranchByName(tx, projectId, pullRequest.targetBranch);
      if (!sourceBranch?.headCommitHash || !targetBranch?.headCommitHash) {
        throw new MergeError(
          'PULL_REQUEST_REVIEW_INPUT_NOT_FOUND',
          'A reviewed branch or branch head no longer exists.'
        );
      }

      const sourceCommit = await loadRepositoryCommit(tx, projectId, sourceBranch.headCommitHash);
      const targetCommit = await loadRepositoryCommit(tx, projectId, targetBranch.headCommitHash);
      if (!sourceCommit || !targetCommit) {
        throw new MergeError(
          'PULL_REQUEST_REVIEW_INPUT_NOT_FOUND',
          'A current branch head commit no longer exists.'
        );
      }

      const previousStatus = pullRequest.status;
      const sourceFresh = sourceBranch.headCommitHash === pullRequest.sourceCommitHash;
      const targetFresh = targetBranch.headCommitHash === pullRequest.targetBaseCommitHash;
      if (!sourceFresh || !targetFresh) {
        const refreshed = await updatePullRequest(tx, pullRequest.pullRequestId, {
          sourceCommitHash: sourceCommit.hash,
          targetBaseCommitHash: targetCommit.hash,
          status: 'checking',
          mergeDraftId: null,
        });
        if (!refreshed) throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
        await addPullRequestActivity(tx, refreshed.pullRequestId, {
          actorId,
          type: 'base_updated',
          message: `Refreshed reviewed commits to ${sourceCommit.hash} -> ${targetCommit.hash}.`,
          createdAt: refreshed.updatedAt,
        });
        pullRequest = refreshed;
      } else {
        const checking = await updatePullRequest(tx, pullRequest.pullRequestId, {
          status: 'checking',
        });
        if (!checking) throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
        pullRequest = checking;
      }

      try {
        const context = { ...pipelineContext, db: tx as AnyDB };
        const { prepared: freshlyPrepared } = await collectResult(
          runOperation(
            mergePrepareOp,
            {
              project_id: projectId,
              source_hash: pullRequest.sourceCommitHash,
              target_hash: pullRequest.targetBaseCommitHash,
            },
            context
          )
        );

        let draft = pullRequest.mergeDraftId
          ? await getMergeDraft(tx, pullRequest.mergeDraftId)
          : await findPendingMergeDraft(
              tx,
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
          draft = await updateMergeDraft(tx, draft.draftId, {
            prepared: freshlyPrepared,
          });
        } else {
          draft = await createMergeDraft(tx, {
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

        const prepared = JSON.parse(draft.preparedJson) as MergeResult;
        const storedDecisions = readMergeDraftDecision(draft);
        const unresolvedConflicts = prepared.conflicts.filter(
          (conflict) => !storedDecisions?.conflictResolutions[conflict.path]
        );
        const serverChecks = await computeMergeChecks(tx, draft);
        const serverChecksPassed = serverChecks.every((check) => check.passed);
        const nextStatus: PullRequestStatus =
          unresolvedConflicts.length === 0 && serverChecksPassed ? 'ready' : 'blocked';
        const diffSummary = {
          changed_nodes:
            prepared.autoKept.length +
            prepared.conflicts.length +
            prepared.onlyInSource.length +
            prepared.onlyInTarget.length,
          yops_operations: sourceCommit.yops_log_ids.length,
          output_impacts: pullRequest.diffSummary.output_impacts ?? 0,
          source_refs: sourceCommit.sources?.length ?? 0,
        };
        const preparedPullRequest = await updatePullRequest(tx, pullRequest.pullRequestId, {
          status: nextStatus,
          mergeDraftId: draft.draftId,
          diffSummary,
        });
        if (!preparedPullRequest)
          throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
        const now = preparedPullRequest.updatedAt;
        await replacePullRequestChecks(tx, preparedPullRequest.pullRequestId, [
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
        await addPullRequestActivity(tx, preparedPullRequest.pullRequestId, {
          actorId,
          type: 'checks_reran',
          message: `Deterministic merge readiness prepared in draft ${draft.draftId}.`,
          createdAt: now,
        });
        if (previousStatus !== preparedPullRequest.status) {
          await addPullRequestActivity(tx, preparedPullRequest.pullRequestId, {
            actorId,
            type: 'status_changed',
            message: `Pull request moved from ${previousStatus} to ${preparedPullRequest.status}.`,
            createdAt: now,
          });
        }
        return preparedPullRequest;
      } catch (error) {
        const failed = await updatePullRequest(tx, pullRequest.pullRequestId, {
          status: 'blocked',
          mergeDraftId: null,
        });
        if (!failed) throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
        const now = failed.updatedAt;
        const failureMessage =
          error instanceof MergeError
            ? error.message
            : 'Deterministic merge preparation failed unexpectedly.';
        await replacePullRequestChecks(tx, failed.pullRequestId, [
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
            status: 'failed',
            title: 'Deterministic merge preparation',
            message: failureMessage,
            startedAt: now,
            completedAt: now,
          },
        ]);
        await addPullRequestActivity(tx, failed.pullRequestId, {
          actorId,
          type: 'checks_reran',
          message: 'Deterministic merge readiness failed and the PR was returned to blocked.',
          createdAt: now,
        });
        if (previousStatus !== failed.status) {
          await addPullRequestActivity(tx, failed.pullRequestId, {
            actorId,
            type: 'status_changed',
            message: `Pull request moved from ${previousStatus} to blocked.`,
            createdAt: now,
          });
        }
        return failed;
      }
    });

    return c.json({ success: true as const, data: await toApiDetail(db, updated) }, 200);
  } catch (error) {
    if (error instanceof MergeError) {
      if (
        error.code === 'PULL_REQUEST_NOT_FOUND' ||
        error.code === 'PULL_REQUEST_REVIEW_INPUT_NOT_FOUND'
      ) {
        return c.json(errorBody(error.code, error.message), 404);
      }
      if (error.code === 'PULL_REQUEST_NOT_ACTIVE') {
        return c.json(errorBody(error.code, error.message), 409);
      }
    }
    return c.json(
      errorBody(
        'PULL_REQUEST_READINESS_FAILED',
        error instanceof Error ? error.message : 'Pull request readiness could not be recorded.'
      ),
      500
    );
  }
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

// @ts-expect-error OpenAPI cannot narrow the transaction error response union.
pullRequestRoutes.openapi(closePullRequestRoute, async (c) => {
  const { number, projectId } = c.req.valid('param');
  const { access, db } = await requireProject(c, projectId);
  if (access instanceof Response) return access;
  try {
    const closed = await db.transaction(async (tx) => {
      await acquirePullRequestLock(tx, projectId, number);
      const pullRequest = await findPullRequestByNumber(tx, projectId, number);
      if (!pullRequest) throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
      if (FINISHED_STATUSES.includes(pullRequest.status as PullRequestStatus)) {
        throw new MergeError(
          'PULL_REQUEST_ALREADY_CLOSED',
          'Only active pull requests can be closed without merging.'
        );
      }
      const closedAt = new Date();
      const updated = await updatePullRequest(tx, pullRequest.pullRequestId, {
        status: 'closed',
        closedAt,
      });
      if (!updated) throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
      await addPullRequestActivity(tx, updated.pullRequestId, {
        actorId: getUserId(c) ?? 'current-user',
        type: 'closed',
        message: 'Pull request closed without merging.',
        createdAt: closedAt,
      });
      return updated;
    });
    return c.json({ success: true as const, data: toApiPullRequest(closed) }, 200);
  } catch (error) {
    if (error instanceof MergeError) {
      if (error.code === 'PULL_REQUEST_NOT_FOUND') {
        return c.json(errorBody(error.code, error.message), 404);
      }
      if (error.code === 'PULL_REQUEST_ALREADY_CLOSED') {
        return c.json(errorBody(error.code, error.message), 409);
      }
    }
    throw error;
  }
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
    const outcome = await db.transaction(async (tx) => {
      await acquirePullRequestLock(tx, projectId, number);
      const pullRequest = await findPullRequestByNumber(tx, projectId, number);
      if (!pullRequest) throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
      const recordedChecks = await listPullRequestChecks(tx, pullRequest.pullRequestId);
      const conflictDecisionCanUnblock =
        pullRequest.status === 'blocked' &&
        body.decisions !== undefined &&
        recordedChecks.length > 0 &&
        recordedChecks.every(
          (check) =>
            check.kind === 'conflict_resolution' ||
            check.status === 'passed' ||
            check.status === 'warning'
        );
      if (pullRequest.status !== 'ready' && !conflictDecisionCanUnblock) {
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

      const sourceBranch = await findBranchByName(tx, projectId, pullRequest.sourceBranch);
      const targetBranch = await findBranchByName(tx, projectId, pullRequest.targetBranch);
      const draft = await getMergeDraft(tx, pullRequest.mergeDraftId);
      if (!sourceBranch || !targetBranch || !draft) {
        throw new MergeError(
          'PULL_REQUEST_MERGE_NOT_PREPARED',
          'A reviewed branch or merge draft no longer exists. Rerun readiness.'
        );
      }

      if (
        body.expected_source_commit_id !== pullRequest.sourceCommitHash ||
        body.expected_target_commit_id !== pullRequest.targetBaseCommitHash
      ) {
        throw new MergeError(
          'PULL_REQUEST_EXPECTATION_MISMATCH',
          'The merge request does not match the PR snapshot currently under review.'
        );
      }

      const sourceFresh = sourceBranch.headCommitHash === pullRequest.sourceCommitHash;
      const targetFresh = targetBranch.headCommitHash === pullRequest.targetBaseCommitHash;
      if (!sourceFresh || !targetFresh) {
        const blocked = await updatePullRequest(tx, pullRequest.pullRequestId, {
          status: 'blocked',
          mergeDraftId: null,
        });
        if (!blocked) throw new MergeError('PULL_REQUEST_NOT_FOUND', 'Pull request not found.');
        const now = blocked.updatedAt;
        await replacePullRequestChecks(tx, blocked.pullRequestId, [
          {
            kind: 'source_commit',
            status: sourceFresh ? 'passed' : 'blocked',
            title: 'Source branch snapshot',
            message: sourceFresh
              ? `${pullRequest.sourceCommitHash} is still the source branch head.`
              : `${pullRequest.sourceBranch} moved after readiness was prepared.`,
            startedAt: now,
            completedAt: now,
          },
          {
            kind: 'base_freshness',
            status: targetFresh ? 'passed' : 'blocked',
            title: 'Target branch freshness',
            message: targetFresh
              ? `${pullRequest.targetBaseCommitHash} is still the target branch head.`
              : `${pullRequest.targetBranch} moved after readiness was prepared.`,
            startedAt: now,
            completedAt: now,
          },
          {
            kind: 'merge_simulation',
            status: 'blocked',
            title: 'Deterministic merge preparation',
            message: 'Rerun readiness against the current branch heads before merging.',
            startedAt: now,
            completedAt: now,
          },
        ]);
        await addPullRequestActivity(tx, blocked.pullRequestId, {
          actorId,
          type: 'status_changed',
          message: 'Pull request moved to blocked because a reviewed branch head changed.',
          createdAt: now,
        });
        return { kind: 'stale' as const };
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

      const prepared = JSON.parse(draft.preparedJson) as MergeResult;
      const decisions: MergeDecision = (body.decisions as MergeDecision | undefined) ??
        readMergeDraftDecision(draft) ?? {
          conflictResolutions: {},
          keepFromSource: prepared.onlyInSource,
          keepFromTarget: prepared.onlyInTarget,
          keepRelationsFromSource: true,
          keepRelationsFromTarget: true,
        };
      const context = { ...pipelineContext, db: tx as AnyDB };
      const persistedDecision = await updateMergeDraft(tx, draft.draftId, {
        decision: decisions,
      });
      if (!persistedDecision) {
        throw new MergeError(
          'PULL_REQUEST_MERGE_NOT_PREPARED',
          'The merge draft disappeared before its decision could be persisted.'
        );
      }
      const result = await collectResult(
        runOperation(
          mergeExecuteOp,
          {
            project_id: projectId,
            source_hash: pullRequest.sourceCommitHash,
            target_hash: pullRequest.targetBaseCommitHash,
            prepared,
            decisions,
            message:
              body.message ?? `Merge pull request #${pullRequest.number}: ${pullRequest.title}`,
            branch: pullRequest.targetBranch,
            author,
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
      return { kind: 'merged' as const, pullRequest: updated };
    });

    if (outcome.kind === 'stale') {
      return c.json(
        errorBody(
          'PULL_REQUEST_HEAD_CHANGED',
          'A reviewed branch head changed. Rerun readiness before merging.'
        ),
        409
      );
    }
    return c.json(
      { success: true as const, data: await toApiDetail(db, outcome.pullRequest) },
      200
    );
  } catch (error) {
    if (error instanceof MergeError) {
      if (error.code === 'PULL_REQUEST_NOT_FOUND') {
        return c.json(errorBody(error.code, error.message), 404);
      }
      if (
        error.code === 'PULL_REQUEST_NOT_READY' ||
        error.code === 'PULL_REQUEST_EXPECTATION_MISMATCH' ||
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
