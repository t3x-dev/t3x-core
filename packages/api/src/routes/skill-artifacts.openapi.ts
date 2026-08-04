import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  compileSkillBundle,
  type SemanticContent,
  type SlotValue,
  type TreeNode,
  validateSkillPolicy,
} from '@t3x-dev/core';
import { getDB } from '../lib/db';
import { errorResponse } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { getRepositorySemanticCommit } from '../lib/repository-state-transition';
import { SuccessResponseSchema } from '../schemas/common';

const SkillBundleFileSchema = z.object({
  path: z.string(),
  media_type: z.string(),
  content: z.string(),
  sha256: z.string(),
});

const SkillCheckSchema = z.object({
  key: z.string(),
  kind: z.string(),
  run_when: z.string(),
  blocking: z.boolean(),
  command_resource: z.string().optional(),
  assertions: z.array(z.string()),
  success_criteria: z.array(z.string()),
  workflow_keys: z.array(z.string()),
});

const SkillPolicyIssueSchema = z.object({
  code: z.string(),
  path: z.string(),
  message: z.string(),
});

const SkillBundleResponseSchema = z.object({
  commit_hash: z.string(),
  schema_name: z.literal('t3x/skill'),
  renderer_version: z.string(),
  generated_description: z.string(),
  bundle_hash: z.string(),
  publishable: z.boolean(),
  missing_resources: z.array(z.string()),
  gate: z.object({
    declaratively_ready: z.boolean(),
    blocking_check_count: z.number().int().nonnegative(),
    requires_execution: z.boolean(),
    errors: z.array(SkillPolicyIssueSchema),
    gaps: z.array(SkillPolicyIssueSchema),
  }),
  checks: z.array(SkillCheckSchema),
  files: z.array(SkillBundleFileSchema),
});

const getSkillArtifactRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/commits/{commitHash}/artifacts/skill',
  tags: ['Artifacts'],
  summary: 'Compile a deterministic portable Skill bundle from a commit',
  request: {
    params: z.object({
      projectId: z.string().min(1),
      commitHash: z.string().min(1),
    }),
  },
  responses: {
    200: {
      description: 'Portable Skill bundle manifest and file contents',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(SkillBundleResponseSchema),
        },
      },
    },
    400: { description: 'Commit cannot be compiled as a Skill' },
    403: { description: 'Project access denied' },
    404: { description: 'Commit not found' },
  },
});

export const skillArtifactRoutes = new OpenAPIHono();

skillArtifactRoutes.openapi(getSkillArtifactRoute, async (c) => {
  const { projectId, commitHash } = c.req.valid('param');
  const db = await getDB();
  const accessResult = await assertProjectAccess(c, db, projectId);
  if (accessResult instanceof Response) return accessResult;

  const commit = await getRepositorySemanticCommit(db, commitHash, projectId);
  if (!commit) {
    return errorResponse(c, 'COMMIT_NOT_FOUND', `Commit not found: ${commitHash}`);
  }

  try {
    const tree = semanticContentToCandidate(commit.semanticContent);
    const relations = commit.semanticContent.relations.map(({ type, from, to }) => ({
      type,
      from,
      to,
    }));
    const policy = validateSkillPolicy(tree, relations);
    const bundle = compileSkillBundle({ tree, relations });
    const blockingCheckCount = bundle.checks.filter((check) => check.blocking).length;
    const declarativelyReady = policy.ready && bundle.missingResources.length === 0;
    return c.json(
      {
        success: true as const,
        data: {
          commit_hash: commit.digest,
          schema_name: 't3x/skill' as const,
          renderer_version: bundle.rendererVersion,
          generated_description: bundle.generatedDescription,
          bundle_hash: bundle.bundleHash,
          publishable: declarativelyReady,
          missing_resources: bundle.missingResources,
          gate: {
            declaratively_ready: declarativelyReady,
            blocking_check_count: blockingCheckCount,
            requires_execution: blockingCheckCount > 0,
            errors: policy.errors.map(({ code, path, message }) => ({ code, path, message })),
            gaps: policy.gaps.map(({ code, path, message }) => ({ code, path, message })),
          },
          checks: bundle.checks.map((check) => ({
            key: check.key,
            kind: check.kind,
            run_when: check.runWhen,
            blocking: check.blocking,
            ...(check.commandResource ? { command_resource: check.commandResource } : {}),
            assertions: check.assertions,
            success_criteria: check.successCriteria,
            workflow_keys: check.workflowKeys,
          })),
          files: bundle.files.map((file) => ({
            path: file.path,
            media_type: file.mediaType,
            content: file.content,
            sha256: file.sha256,
          })),
        },
      },
      200
    );
  } catch (error) {
    return errorResponse(
      c,
      'SKILL_COMPILE_FAILED',
      error instanceof Error ? error.message : 'Skill compilation failed'
    );
  }
});

function semanticContentToCandidate(content: SemanticContent): Record<string, unknown> {
  return Object.fromEntries(content.trees.map((tree) => [tree.key, treeNodeToValue(tree)]));
}

function treeNodeToValue(tree: TreeNode): Record<string, SlotValue | unknown> {
  return {
    ...tree.slots,
    ...Object.fromEntries(tree.children.map((child) => [child.key, treeNodeToValue(child)])),
  };
}
