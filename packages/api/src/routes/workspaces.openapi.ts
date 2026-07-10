/**
 * Workspace flow routes.
 *
 * These endpoints bridge the WebUI workspace review flow with backend-owned
 * candidate/YOps proposal state. The target product path uses LLM proposals
 * before deterministic validation/apply. This preview implementation keeps a
 * deterministic scaffold so local workspace review works without an LLM key.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Draft, Material, SemanticContent, SourcedYOp } from '@t3x-dev/core';
import {
  type AnyDB,
  createCommit,
  findMaterialsByProject,
  findWorkspaceDraft,
  getCommit,
  getLatestCommit,
  insertYOpsLogEntry,
  listWorkspaceDrafts,
  upsertWorkspaceDraft,
} from '@t3x-dev/storage';
import { type NodeSchema, type SlotSchema, t3xPrdP0Fixtures, type YSchema } from '@t3x-dev/yschema';
import { mapBranchLinearityError } from '../lib/commit-linearity';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const SourceBundleItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string().optional(),
  conversationId: z.string().optional(),
  materialId: z.string().optional(),
  contentHash: z.string().optional(),
  tokenEstimate: z.number().optional(),
  fileName: z.string().optional(),
  previewText: z.string().optional(),
  previewTurns: z
    .array(
      z.object({
        id: z.string(),
        role: z.string(),
        author: z.string(),
        content: z.string(),
      })
    )
    .optional(),
});

const ExtractCandidateRequestSchema = z.object({
  workspace: z.record(z.string(), z.unknown()),
  sources: z.array(SourceBundleItemSchema).default([]),
});

const SendYOpsRequestSchema = z.object({
  workspace: z.record(z.string(), z.unknown()),
});

const SaveWorkspaceRequestSchema = z.object({
  workspace: z.record(z.string(), z.unknown()),
});

const CommitWorkspaceRequestSchema = z.object({
  content: z.object({
    trees: z.any(),
    relations: z.any().optional(),
  }),
  message: z.string().optional(),
});

const WorkspaceResponseSchema = z.object({
  candidate_id: z.string(),
  yops_draft_id: z.string().optional(),
  workspace: z.record(z.string(), z.unknown()),
});

const WorkspaceCommitResponseSchema = WorkspaceResponseSchema.extend({
  commit: z.any(),
});

const ListWorkspacesResponseSchema = z.object({
  workspaces: z.array(z.record(z.string(), z.unknown())),
});

const REVIEW_SAVE_STATUSES = new Set(['draft', 'ready_for_yops', 'schema_review']);

type TxRunner = { transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T> };

const projectWorkspacesParams = z.object({
  projectId: z.string(),
});

const workspaceParams = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
});

const listWorkspacesRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces',
  tags: ['Workspaces'],
  summary: 'List persisted workspace staged states',
  request: {
    params: projectWorkspacesParams,
  },
  responses: {
    200: {
      description: 'Persisted workspace staged states',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ListWorkspacesResponseSchema),
        },
      },
    },
  },
});

const getWorkspaceRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}',
  tags: ['Workspaces'],
  summary: 'Read persisted workspace staged state',
  request: {
    params: workspaceParams,
  },
  responses: {
    200: {
      description: 'Persisted workspace staged state',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceResponseSchema),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

const extractCandidateRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/extract-candidate',
  tags: ['Workspaces'],
  summary: 'Extract a workspace candidate proposal from source materials',
  request: {
    params: workspaceParams,
    body: {
      content: {
        'application/json': {
          schema: ExtractCandidateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Extracted workspace candidate',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceResponseSchema),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

const sendYOpsDraftRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/yops-draft',
  tags: ['Workspaces'],
  summary: 'Create a YOps proposal from the reviewed workspace candidate',
  request: {
    params: workspaceParams,
    body: {
      content: {
        'application/json': {
          schema: SendYOpsRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Workspace YOps proposal',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceResponseSchema),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

const saveWorkspaceRoute = createRoute({
  method: 'patch',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}',
  tags: ['Workspaces'],
  summary: 'Save a reviewed workspace staged state',
  request: {
    params: workspaceParams,
    body: {
      content: {
        'application/json': {
          schema: SaveWorkspaceRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Saved workspace staged state',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceResponseSchema),
        },
      },
    },
  },
});

const commitWorkspaceRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/workspaces/{workspaceId}/commit',
  tags: ['Workspaces'],
  summary: 'Commit a reviewed workspace staged state',
  request: {
    params: workspaceParams,
    body: {
      content: {
        'application/json': {
          schema: CommitWorkspaceRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Workspace committed',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(WorkspaceCommitResponseSchema),
        },
      },
    },
    404: {
      description: 'Workspace not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
    409: {
      description: 'Branch is not at the expected head',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
    500: {
      description: 'Commit failed',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

export const workspaceRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

workspaceRoutes.openapi(listWorkspacesRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const db = await getDB();
  const drafts = await listWorkspaceDrafts(db, projectId);
  const workspaces = drafts.flatMap((draft) =>
    draft.workspace_state ? [draft.workspace_state] : []
  );

  return c.json({
    success: true as const,
    data: { workspaces },
  });
});

workspaceRoutes.openapi(getWorkspaceRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const db = await getDB();
  const draft = await findWorkspaceDraft(db, projectId, workspaceId);

  if (!draft?.workspace_state) {
    return c.json(notFoundError('Workspace not found'), 404);
  }

  return c.json({
    success: true as const,
    data: envelopeFromDraft(draft, workspaceId),
  });
});

workspaceRoutes.openapi(saveWorkspaceRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { workspace } = c.req.valid('json');
  const db = await getDB();
  const storedDraft = await findWorkspaceDraft(db, projectId, workspaceId);
  const storedWorkspace = storedDraft?.workspace_state ?? {};
  const {
    backendCandidateId: _storedBackendCandidateId,
    lastCommitHash: _storedLastCommitHash,
    status: storedStatus,
    ...storedEditableWorkspace
  } = storedWorkspace;
  const {
    backendCandidateId: _ignoredBackendCandidateId,
    lastCommitHash: _ignoredLastCommitHash,
    status,
    ...clientWorkspace
  } = workspace;
  const storedBackendCandidateId = resolveStoredBackendCandidateId(storedWorkspace);
  const nextStatus = resolveReviewSaveStatus(status, storedStatus);
  const savedAt = new Date().toISOString();
  const persistedWorkspace = {
    ...storedEditableWorkspace,
    ...clientWorkspace,
    id: workspaceId,
    projectId,
    updatedAt: savedAt,
    ...(typeof nextStatus === 'string' ? { status: nextStatus } : {}),
    ...(storedBackendCandidateId ? { backendCandidateId: storedBackendCandidateId } : {}),
  };
  const draft = await upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: workspaceId,
    title: stringFromWorkspace(persistedWorkspace, 'title', workspaceId),
    parent_commit_hash: nullableStringFromWorkspace(persistedWorkspace, 'baseCommitHash'),
    target_branch: stringFromWorkspace(persistedWorkspace, 'targetBranch', 'main'),
    workspace_state: persistedWorkspace,
  });

  return c.json({
    success: true as const,
    data: envelopeFromDraft(draft, workspaceId),
  });
});

workspaceRoutes.openapi(commitWorkspaceRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { content, message } = c.req.valid('json');

  try {
    const db = await getDB();
    const commitWorkspace = async (txOrDb: AnyDB) => {
      const storedDraft = await findWorkspaceDraft(txOrDb, projectId, workspaceId);

      if (!storedDraft?.workspace_state) {
        return null;
      }

      const storedWorkspace = storedDraft.workspace_state;
      const targetBranch = stringFromWorkspace(storedWorkspace, 'targetBranch', 'main');
      const commitContent = workspaceCommitContent(content);
      const branchHead = await getLatestCommit(txOrDb, projectId, targetBranch);
      const commit = contentMatches(branchHead?.content, commitContent)
        ? branchHead
        : await createCommit(txOrDb, {
            author: { type: 'human' as const, name: 'api' },
            branch: targetBranch,
            content: commitContent,
            enforceBranchLinearity: true,
            message:
              message ??
              `Workspace commit: ${stringFromWorkspace(storedWorkspace, 'title', workspaceId)}`,
            parents: await resolveWorkspaceCommitParents(
              txOrDb,
              projectId,
              targetBranch,
              nullableStringFromWorkspace(storedWorkspace, 'baseCommitHash') ?? undefined,
              branchHead
            ),
            project_id: projectId,
            provenance: { method: 'human_curation' },
            sources: commitSourcesFromWorkspace(storedWorkspace),
            yops_log_ids: await materializeWorkspaceYOpsLog(
              txOrDb,
              projectId,
              workspaceId,
              storedWorkspace
            ),
          });
      const committedAt = new Date().toISOString();
      const committedWorkspace = {
        ...storedWorkspace,
        id: workspaceId,
        projectId,
        lastCommitHash: commit.hash,
        status: 'committed',
        updatedAt: committedAt,
      };
      const draft = await upsertWorkspaceDraft(txOrDb, {
        project_id: projectId,
        workspace_id: workspaceId,
        title: stringFromWorkspace(committedWorkspace, 'title', workspaceId),
        parent_commit_hash: nullableStringFromWorkspace(committedWorkspace, 'baseCommitHash'),
        target_branch: targetBranch,
        workspace_state: committedWorkspace,
      });

      return { commit, draft };
    };
    const runner = db as unknown as Partial<TxRunner>;
    const result =
      typeof runner.transaction === 'function'
        ? await runner.transaction((tx) => commitWorkspace(tx as AnyDB))
        : await commitWorkspace(db);

    if (!result) {
      return c.json(notFoundError('Workspace not found'), 404);
    }

    return c.json({
      success: true as const,
      data: {
        ...envelopeFromDraft(result.draft, workspaceId),
        commit: result.commit,
      },
    });
  } catch (err) {
    const linearity = mapBranchLinearityError(c, err);
    if (linearity) return linearity;
    const message_ = err instanceof Error ? err.message : 'Failed to commit workspace';
    return errorResponse(c, 'COMMIT_FAILED', message_);
  }
});

function resolveReviewSaveStatus(status: unknown, storedStatus: unknown): string {
  if (status === 'committed') return 'schema_review';
  if (typeof status === 'string' && REVIEW_SAVE_STATUSES.has(status)) return status;
  if (typeof storedStatus === 'string' && REVIEW_SAVE_STATUSES.has(storedStatus)) {
    return storedStatus;
  }
  return 'draft';
}

function resolveStoredBackendCandidateId(
  storedWorkspace: Record<string, unknown>
): string | undefined {
  if (typeof storedWorkspace.backendCandidateId === 'string') {
    return storedWorkspace.backendCandidateId;
  }
  return undefined;
}

function workspaceCommitContent(
  content: z.infer<typeof CommitWorkspaceRequestSchema>['content']
): SemanticContent {
  return {
    trees: content.trees,
    relations: content.relations ?? [],
  };
}

async function resolveWorkspaceCommitParents(
  db: AnyDB,
  projectId: string,
  targetBranch: string,
  preferredParentHash: string | undefined,
  branchHead: { hash: string } | null
): Promise<string[]> {
  if (branchHead) return [branchHead.hash];

  if (preferredParentHash) {
    const preferredParent = await getCommit(db, preferredParentHash);
    if (preferredParent?.project_id === projectId) return [preferredParent.hash];
  }

  if (targetBranch !== 'main') {
    const mainHead = await getLatestCommit(db, projectId, 'main');
    if (mainHead) return [mainHead.hash];
  }

  return [];
}

function contentMatches(left: unknown, right: unknown): boolean {
  if (!left) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

workspaceRoutes.openapi(extractCandidateRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { sources, workspace } = c.req.valid('json');
  const db = await getDB();
  const materials = await safeFindMaterialsByProject(db, projectId);
  const sourceTexts = mergeSourceTexts(sources, materials);
  const nextWorkspace = buildExtractedWorkspace(workspace, projectId, sourceTexts);
  const candidateId = candidateIdFor(workspaceId, sourceTexts);
  const persistedWorkspace = {
    ...nextWorkspace,
    id: stringFromWorkspace(nextWorkspace, 'id', workspaceId),
    projectId,
    backendCandidateId: candidateId,
  };
  const draft = await upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: workspaceId,
    title: stringFromWorkspace(persistedWorkspace, 'title', workspaceId),
    parent_commit_hash: nullableStringFromWorkspace(persistedWorkspace, 'baseCommitHash'),
    target_branch: stringFromWorkspace(persistedWorkspace, 'targetBranch', 'main'),
    workspace_state: persistedWorkspace,
  });

  return c.json({
    success: true as const,
    data: envelopeFromDraft(draft, workspaceId),
  });
});

workspaceRoutes.openapi(sendYOpsDraftRoute, async (c) => {
  const { projectId, workspaceId } = c.req.valid('param');
  const { workspace } = c.req.valid('json');
  const db = await getDB();
  const storedDraft = await findWorkspaceDraft(db, projectId, workspaceId);
  const sourceWorkspace = storedDraft?.workspace_state ?? workspace;
  const candidateId = candidateIdFromWorkspace(sourceWorkspace, workspaceId);
  const nextWorkspace = {
    ...sourceWorkspace,
    id: stringFromWorkspace(sourceWorkspace, 'id', workspaceId),
    projectId,
    backendCandidateId: candidateId,
    yopsDraft: buildYOpsDraft(sourceWorkspace, candidateId),
  };
  const draft = await upsertWorkspaceDraft(db, {
    project_id: projectId,
    workspace_id: workspaceId,
    title: stringFromWorkspace(nextWorkspace, 'title', workspaceId),
    parent_commit_hash: nullableStringFromWorkspace(nextWorkspace, 'baseCommitHash'),
    target_branch: stringFromWorkspace(nextWorkspace, 'targetBranch', 'main'),
    workspace_state: nextWorkspace,
  });

  return c.json({
    success: true as const,
    data: envelopeFromDraft(draft, workspaceId),
  });
});

interface WorkspaceEnvelope {
  candidate_id: string;
  yops_draft_id?: string;
  workspace: Record<string, unknown>;
}

function envelopeFromDraft(draft: Draft, workspaceId: string): WorkspaceEnvelope {
  const workspace = draft.workspace_state ?? { id: workspaceId, projectId: draft.project_id };
  const yopsDraft = workspace.yopsDraft as { id?: unknown } | undefined;

  return {
    candidate_id: candidateIdFromWorkspace(workspace, workspaceId),
    yops_draft_id: typeof yopsDraft?.id === 'string' ? yopsDraft.id : undefined,
    workspace,
  };
}

function candidateIdFromWorkspace(workspace: Record<string, unknown>, workspaceId: string): string {
  return typeof workspace.backendCandidateId === 'string'
    ? workspace.backendCandidateId
    : `candidate:${workspaceId}`;
}

function stringFromWorkspace(
  workspace: Record<string, unknown>,
  key: string,
  fallback: string
): string {
  const value = workspace[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function nullableStringFromWorkspace(
  workspace: Record<string, unknown>,
  key: string
): string | null {
  const value = workspace[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function notFoundError(message: string) {
  return {
    success: false as const,
    error: { code: 'NOT_FOUND', message },
  };
}

type CommitSourceRef = { type: 'conversation' | 'import' | 'leaf'; id: string; title?: string };

function commitSourcesFromWorkspace(workspace: Record<string, unknown>): CommitSourceRef[] {
  const sources = workspace.sourceBundle;
  if (!Array.isArray(sources)) return [];

  return sources.flatMap((source): CommitSourceRef[] => {
    if (!isRecord(source)) return [];
    const id = commitSourceId(source);
    if (!id) return [];
    const type =
      source.type === 'chat' ? 'conversation' : source.type === 'leaf' ? 'leaf' : 'import';
    const title =
      typeof source.title === 'string' && source.title.trim() ? source.title : undefined;
    return [{ type, id, ...(title ? { title } : {}) }];
  });
}

async function materializeWorkspaceYOpsLog(
  db: AnyDB,
  projectId: string,
  workspaceId: string,
  workspace: Record<string, unknown>
): Promise<string[]> {
  const operations = workspaceDraftOperations(workspace);
  if (operations.length === 0) return [];
  const conversationId = workspaceConversationId(workspace);
  if (!conversationId) return [];
  const at = new Date().toISOString();
  const yops = operations.flatMap((operation) =>
    workspaceDraftOperationToSourcedYOp(operation, at)
  );
  if (yops.length === 0) return [];

  const record = await insertYOpsLogEntry(db, {
    conversationId,
    metadata: {
      source: 'workspace_commit',
      workspace_id: workspaceId,
      yops_draft_id: workspaceDraftId(workspace),
    },
    pipelineState: 'completed',
    projectId,
    source: 'workspace_draft',
    version: 1,
    yops,
  });
  return [record.id];
}

function workspaceDraftOperations(workspace: Record<string, unknown>): Record<string, unknown>[] {
  const yopsDraft = workspace.yopsDraft;
  if (!isRecord(yopsDraft) || !Array.isArray(yopsDraft.operations)) return [];
  return yopsDraft.operations.filter(isRecord);
}

function workspaceDraftId(workspace: Record<string, unknown>): string | undefined {
  const yopsDraft = workspace.yopsDraft;
  if (!isRecord(yopsDraft)) return undefined;
  return typeof yopsDraft.id === 'string' ? yopsDraft.id : undefined;
}

function workspaceConversationId(workspace: Record<string, unknown>): string | null {
  const sources = workspace.sourceBundle;
  if (!Array.isArray(sources)) return null;
  for (const source of sources) {
    if (!isRecord(source)) continue;
    if (typeof source.conversationId === 'string' && source.conversationId.trim()) {
      return source.conversationId;
    }
    if (source.type === 'chat' && typeof source.id === 'string') {
      const match = source.id.match(/(?:^|:)conv_[A-Za-z0-9_-]+$/);
      if (match) return match[0].replace(/^.*:/, '');
    }
  }
  return null;
}

function workspaceDraftOperationToSourcedYOp(
  operation: Record<string, unknown>,
  at: string
): SourcedYOp[] {
  const opName = typeof operation.op === 'string' ? operation.op.trim().toLowerCase() : '';
  const path = typeof operation.path === 'string' ? operation.path.trim() : '';
  if (!opName || !path) return [];
  const source = { type: 'human' as const, author: 'workspace', at, surface: 'script' as const };
  const value = operation.afterValue ?? '';

  if (opName === 'set') return [{ set: { path, value }, source } as SourcedYOp];
  if (opName === 'add' || opName === 'append') {
    return [
      {
        append: { path: path.replace(/(?:\/|\.)-$/, ''), value },
        source,
      } as SourcedYOp,
    ];
  }
  if (opName === 'populate' && isRecord(operation.afterValue)) {
    return [{ populate: { path, values: operation.afterValue }, source } as SourcedYOp];
  }
  if (opName === 'create' || opName === 'define')
    return [{ define: { path }, source } as SourcedYOp];
  if (opName === 'delete' || opName === 'drop') return [{ drop: { path }, source } as SourcedYOp];
  if (opName === 'unset') return [{ unset: { path }, source } as SourcedYOp];
  return [];
}

function commitSourceId(source: Record<string, unknown>): string | null {
  for (const key of ['conversationId', 'materialId', 'contentHash', 'id']) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

interface WorkspaceSourceText {
  id: string;
  title: string;
  text: string;
}

interface CandidateField {
  id: string;
  path: string;
  label: string;
  type: string;
  required: boolean;
  status: 'covered' | 'missing' | 'needs_confirmation' | 'type_mismatch' | 'extra';
  value?: string;
  evidence?: string;
  sourceRefs: number;
  children?: CandidateField[];
}

interface SlotExtraction {
  value: string;
  source?: WorkspaceSourceText;
}

async function safeFindMaterialsByProject(
  db: Awaited<ReturnType<typeof getDB>>,
  projectId: string
): Promise<Material[]> {
  try {
    return await findMaterialsByProject(db, projectId, { limit: 500 });
  } catch {
    return [];
  }
}

function mergeSourceTexts(
  sources: z.infer<typeof SourceBundleItemSchema>[],
  materials: Material[]
): WorkspaceSourceText[] {
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const fromSources = sources.flatMap((source): WorkspaceSourceText[] => {
    const material = source.materialId ? materialById.get(source.materialId) : undefined;
    const chatText = source.previewTurns
      ?.map((turn) => `${turn.author}: ${turn.content}`)
      .join('\n');
    const text =
      material?.content_text ?? chatText ?? source.previewText ?? source.description ?? '';
    if (!text.trim()) return [];
    return [{ id: source.id, title: source.title, text }];
  });

  return fromSources;
}

function buildExtractedWorkspace(
  workspace: Record<string, unknown>,
  projectId: string,
  sourceTexts: WorkspaceSourceText[]
): Record<string, unknown> {
  const sourceText = joinSourceTexts(sourceTexts);
  const schema = resolveWorkspaceYSchema(workspace);
  const fields = schema
    ? buildCandidateFieldsFromYSchema(schema, sourceTexts)
    : buildFallbackCandidateFields(sourceText, sourceTexts);
  const gaps = collectCandidateGaps(fields);

  return {
    ...workspace,
    projectId,
    schemaCandidate: {
      proposalMode: 'deterministic_scaffold',
      summary:
        sourceTexts.length > 0
          ? `Deterministic scaffold mapped ${countFields(fields)} schema fields from ${sourceTexts.length} source${sourceTexts.length === 1 ? '' : 's'}.`
          : 'No source text available for candidate proposal.',
      fields,
    },
    schemaReview: {
      verdict: gaps.length === 0 && sourceTexts.length > 0 ? 'ready' : 'needs_review',
      summary:
        sourceTexts.length > 0 && gaps.length === 0
          ? 'Candidate proposal mapped from source material and ready for deterministic YSchema validation.'
          : 'Add source material before YOps handoff.',
      gaps: sourceTexts.length > 0 ? gaps : ['No source material.'],
    },
  };
}

function resolveWorkspaceYSchema(workspace: Record<string, unknown>): YSchema | null {
  const bindings = workspace.schemaBindings as Array<{ schemaName?: string }> | undefined;
  const primarySchemaName = bindings?.[0]?.schemaName ?? '';
  if (/prd/i.test(primarySchemaName)) return t3xPrdP0Fixtures.normalizedYSchema;
  return null;
}

function buildCandidateFieldsFromYSchema(
  schema: YSchema,
  sources: WorkspaceSourceText[]
): CandidateField[] {
  return Object.entries(schema.nodes)
    .map(([nodeKey, node]) =>
      node.repeated
        ? repeatedNodeToCandidateField(nodeKey, node, sources)
        : nodeToCandidateField(nodeKey, node, sources)
    )
    .filter((field) => field.required || field.sourceRefs > 0 || Boolean(field.children?.length));
}

function nodeToCandidateField(
  nodeKey: string,
  node: NodeSchema,
  sources: WorkspaceSourceText[]
): CandidateField {
  const requiredSlots = new Set(node.requiredSlots ?? []);
  const children = Object.entries(node.slots ?? {}).map(([slotKey, slot]) => {
    const extraction = extractSlotFromSources(nodeKey, slotKey, slot, sources);
    return slotToCandidateField(
      `${nodeKey}.${slotKey}`,
      slotKey,
      slot,
      extraction.value,
      extraction.source ? [extraction.source] : sources,
      Boolean(node.required) && requiredSlots.has(slotKey)
    );
  });

  return {
    id: fieldId(nodeKey),
    path: nodeKey,
    label: labelFromKey(nodeKey),
    type: 'object',
    required: Boolean(node.required),
    status: statusFromChildren(children, Boolean(node.required)),
    sourceRefs: children.reduce((total, child) => total + child.sourceRefs, 0),
    children,
  };
}

function repeatedNodeToCandidateField(
  nodeKey: string,
  node: NodeSchema,
  sources: WorkspaceSourceText[]
): CandidateField {
  const itemFields = sources.flatMap((source, index) =>
    repeatedNodeItemFields(nodeKey, node, source, index)
  );
  const children =
    itemFields.length > 0
      ? itemFields
      : node.required
        ? [emptyRepeatedNodeItemField(nodeKey, node, sources)]
        : [];

  return {
    id: fieldId(nodeKey),
    path: nodeKey,
    label: labelFromKey(nodeKey),
    type: 'object',
    required: Boolean(node.required),
    status: statusFromChildren(children, Boolean(node.required)),
    sourceRefs: children.reduce((total, child) => total + child.sourceRefs, 0),
    children,
  };
}

function repeatedNodeItemFields(
  nodeKey: string,
  node: NodeSchema,
  source: WorkspaceSourceText,
  index: number
): CandidateField[] {
  const requiredSlots = new Set(node.requiredSlots ?? []);
  const itemKey = repeatedItemKey(nodeKey, source.text, source, index);
  const itemPath = `${nodeKey}.${itemKey}`;
  const itemChildren = Object.entries(node.slots ?? {}).map(([slotKey, slot]) =>
    slotToCandidateField(
      `${itemPath}.${slotKey}`,
      slotKey,
      slot,
      extractSchemaSlotValue(nodeKey, slotKey, slot, source.text),
      [source],
      Boolean(node.required) && requiredSlots.has(slotKey)
    )
  );

  if (!itemChildren.some((child) => child.sourceRefs > 0)) return [];

  return [
    {
      id: fieldId(itemPath),
      path: itemPath,
      label: labelFromKey(itemKey),
      type: 'object',
      required: Boolean(node.required),
      status: statusFromChildren(itemChildren, Boolean(node.required)),
      sourceRefs: itemChildren.reduce((total, child) => total + child.sourceRefs, 0),
      children: itemChildren,
    },
  ];
}

function emptyRepeatedNodeItemField(
  nodeKey: string,
  node: NodeSchema,
  sources: WorkspaceSourceText[]
): CandidateField {
  const requiredSlots = new Set(node.requiredSlots ?? []);
  const itemKey = repeatedItemKey(nodeKey, joinSourceTexts(sources), undefined, 0);
  const itemPath = `${nodeKey}.${itemKey}`;
  const itemChildren = Object.entries(node.slots ?? {}).map(([slotKey, slot]) =>
    slotToCandidateField(
      `${itemPath}.${slotKey}`,
      slotKey,
      slot,
      '',
      sources,
      Boolean(node.required) && requiredSlots.has(slotKey)
    )
  );

  return {
    id: fieldId(itemPath),
    path: itemPath,
    label: labelFromKey(itemKey),
    type: 'object',
    required: Boolean(node.required),
    status: statusFromChildren(itemChildren, Boolean(node.required)),
    sourceRefs: 0,
    children: itemChildren,
  };
}

function extractSlotFromSources(
  nodeKey: string,
  slotKey: string,
  slot: SlotSchema,
  sources: WorkspaceSourceText[]
): SlotExtraction {
  for (const source of [...sources].reverse()) {
    const value = extractSchemaSlotValue(nodeKey, slotKey, slot, source.text);
    if (value.trim()) return { value, source };
  }
  return { value: '' };
}

function slotToCandidateField(
  id: string,
  key: string,
  slot: SlotSchema,
  value: string,
  sources: WorkspaceSourceText[],
  required: boolean
): CandidateField {
  const covered = value.trim().length > 0;
  const type = slot.enum ? 'enum' : (slot.type ?? 'string');
  const defaultValue = stringifySlotValue(slot.default);
  const status: CandidateField['status'] = covered
    ? 'covered'
    : defaultValue
      ? 'needs_confirmation'
      : required
        ? 'missing'
        : 'needs_confirmation';

  return {
    id: fieldId(id),
    path: id,
    label: labelFromKey(key),
    type,
    required,
    status,
    value: covered ? value : defaultValue,
    evidence: covered ? evidenceFor(value, sources) : undefined,
    sourceRefs: covered ? sources.length : 0,
  };
}

function buildFallbackCandidateFields(
  sourceText: string,
  sources: WorkspaceSourceText[]
): CandidateField[] {
  const summaryChildren = [
    slotToCandidateField(
      'summary.problem',
      'problem',
      { type: 'string' },
      extractProblem(sourceText),
      sources,
      true
    ),
    slotToCandidateField(
      'summary.audience',
      'audience',
      { type: 'string' },
      extractAudience(sourceText),
      sources,
      true
    ),
    slotToCandidateField(
      'summary.outcome',
      'outcome',
      { type: 'string' },
      extractOutcome(sourceText),
      sources,
      true
    ),
  ];

  return [
    {
      id: 'field_summary',
      path: 'summary',
      label: 'Summary',
      type: 'object',
      required: true,
      status: statusFromChildren(summaryChildren, true),
      sourceRefs: sources.length,
      children: summaryChildren,
    },
  ];
}

function buildYOpsDraft(workspace: Record<string, unknown>, candidateId: string) {
  const fields = flattenCandidateFields(workspace);
  const operations = fields
    .filter((field) => field.status === 'covered' && field.value)
    .map((field, index) => {
      const path = schemaPathToYOpsPath(workspace, field.path);
      const appendsArrayValue = field.type === 'array' || field.type === 'string[]';
      return {
        id: `op_backend_${index + 1}`,
        op: appendsArrayValue ? 'add' : 'set',
        path: appendsArrayValue ? `${path}/-` : path,
        summary: `Set ${field.path} from reviewed candidate proposal.`,
        beforeValue: appendsArrayValue ? 'No value recorded' : '',
        afterValue: field.value,
        reason:
          field.evidence ??
          `Deterministic scaffold proposal ${candidateId} covered ${field.path} from included source material.`,
        sourceRefs: extractWorkspaceSourceRefs(workspace),
      };
    });

  return {
    id: `draft:${candidateId}`,
    proposalMode: 'deterministic_scaffold',
    operations,
  };
}

function flattenCandidateFields(workspace: Record<string, unknown>): Array<Record<string, string>> {
  const candidate = workspace.schemaCandidate as { fields?: unknown[] } | undefined;
  const fields = Array.isArray(candidate?.fields) ? candidate.fields : [];
  return fields.flatMap(flattenField);
}

function flattenField(field: unknown): Array<Record<string, string>> {
  if (!field || typeof field !== 'object') return [];
  const record = field as Record<string, unknown>;
  const children = Array.isArray(record.children) ? record.children : [];
  return [record as Record<string, string>, ...children.flatMap((child) => flattenField(child))];
}

function schemaPathToYOpsPath(workspace: Record<string, unknown>, path: string) {
  const rootKey = String(
    (workspace.schemaBindings as Array<{ schemaName?: string }> | undefined)?.[0]?.schemaName ??
      'Candidate'
  )
    .replace(/\s+Schema$/i, '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return [rootKey, ...path.split('.').filter(Boolean)].join('/');
}

function extractWorkspaceSourceRefs(workspace: Record<string, unknown>): string[] {
  const sources = workspace.sourceBundle;
  if (!Array.isArray(sources)) return [];
  return sources
    .map((source) =>
      source && typeof source === 'object' ? String((source as { id?: unknown }).id ?? '') : ''
    )
    .filter(Boolean);
}

function extractAudience(text: string): string {
  const explicit = matchLabeledValue(text, ['audience', 'reviewers', '受众', '评审']);
  if (explicit) return trimSentence(explicit);
  if (/product/i.test(text) && /engineering/i.test(text))
    return 'Product and engineering reviewers';
  if (/用户|客户|受众/.test(text)) return trimSentence(text);
  return '';
}

function extractProblem(text: string): string {
  const explicit = matchLabeledValue(text, ['problem', 'pain point', 'challenge', '问题', '痛点']);
  if (explicit) return trimSentence(explicit);
  const sentence = findSentence(text, /problem|pain|challenge|need|问题|痛点|难以|无法|依赖|不足/i);
  return sentence ? trimSentence(sentence) : '';
}

function extractOutcome(text: string): string {
  const explicit = matchLabeledValue(text, [
    'outcome',
    'result',
    'goal',
    'objective',
    'purpose',
    '结果',
    '目标',
  ]);
  if (explicit) return trimSentence(explicit);
  const sentence = findSentence(text, /outcome|result|goal|objective|提升|实现|支持|降低|减少/i);
  return sentence ? trimSentence(sentence) : firstMeaningfulSentence(text);
}

function extractRequirementTitle(text: string): string {
  const explicit = matchLabeledValue(text, [
    'requirement',
    'requirements',
    'feature',
    'title',
    '需求',
    '功能',
    '特性',
  ]);
  if (explicit) return trimSentence(explicit);
  return extractOutcome(text) || firstMeaningfulSentence(text);
}

function extractRequirementPriority(text: string): string {
  const explicit = matchLabeledValue(text, ['priority', '优先级']);
  if (/^must|必须|最高|高$/i.test(explicit)) return 'must';
  if (/^could|可以|低$/i.test(explicit)) return 'could';
  if (/^should|应该|中$/i.test(explicit)) return 'should';
  if (/must|必须|关键|核心/i.test(text)) return 'must';
  if (/could|可以|可选/i.test(text)) return 'could';
  return '';
}

function extractRequirementAcceptance(text: string): string {
  const explicit = matchLabeledValue(text, [
    'acceptance',
    'acceptance criteria',
    'criteria',
    '成功标准',
    '验收',
  ]);
  if (explicit) return trimSentence(explicit);
  const sentence = findSentence(
    text,
    /support|ensure|verify|detect|识别|支持|确保|验证|检测|兼顾/i
  );
  return sentence ? trimSentence(sentence) : '';
}

function extractMilestoneTitle(text: string): string {
  const explicit = matchLabeledValue(text, ['milestone', 'delivery', 'phase', '里程碑', '阶段']);
  return explicit ? trimSentence(explicit) : '';
}

function extractMilestoneSequence(text: string): string {
  const explicit = matchLabeledValue(text, ['sequence', 'order', '顺序', '序号']);
  const numeric = explicit.match(/\d+/)?.[0];
  if (numeric) return numeric;
  return extractMilestoneTitle(text) ? '1' : '';
}

function extractSchemaSlotValue(
  nodeKey: string,
  slotKey: string,
  _slot: SlotSchema,
  sourceText: string
): string {
  if (nodeKey === 'summary' && slotKey === 'problem') return extractProblem(sourceText);
  if (nodeKey === 'summary' && slotKey === 'audience') return extractAudience(sourceText);
  if (nodeKey === 'summary' && slotKey === 'outcome') return extractOutcome(sourceText);
  if (nodeKey === 'requirements' && slotKey === 'title') return extractRequirementTitle(sourceText);
  if (nodeKey === 'requirements' && slotKey === 'priority')
    return extractRequirementPriority(sourceText);
  if (nodeKey === 'requirements' && slotKey === 'acceptance')
    return extractRequirementAcceptance(sourceText);
  if (nodeKey === 'milestones' && slotKey === 'title') return extractMilestoneTitle(sourceText);
  if (nodeKey === 'milestones' && slotKey === 'sequence')
    return extractMilestoneSequence(sourceText);

  return matchLabeledValue(sourceText, [slotKey, labelFromKey(slotKey)]);
}

function statusFromChildren(
  children: CandidateField[],
  required: boolean
): CandidateField['status'] {
  const leaves = children.flatMap((child) => flattenCandidateFieldObjects(child));
  const leafFields = leaves.filter((field) => !field.children?.length);
  if (leafFields.length === 0) return required ? 'missing' : 'needs_confirmation';
  if (leafFields.every((field) => field.status === 'covered')) return 'covered';
  if (required && leafFields.every((field) => field.status === 'missing')) return 'missing';
  return 'needs_confirmation';
}

function flattenCandidateFieldObjects(field: CandidateField): CandidateField[] {
  return [field, ...(field.children ?? []).flatMap((child) => flattenCandidateFieldObjects(child))];
}

function collectCandidateGaps(fields: CandidateField[]): string[] {
  return fields
    .flatMap((field) => flattenCandidateFieldObjects(field))
    .filter((field) => field.required && !field.children?.length && field.status === 'missing')
    .map((field) => field.path);
}

function countFields(fields: CandidateField[]): number {
  return fields.flatMap((field) => flattenCandidateFieldObjects(field)).length;
}

function repeatedItemKey(
  nodeKey: string,
  sourceText: string,
  source?: WorkspaceSourceText,
  index = 0
): string {
  const title =
    nodeKey === 'requirements'
      ? extractRequirementTitle(sourceText)
      : nodeKey === 'milestones'
        ? extractMilestoneTitle(sourceText)
        : '';
  const sourceTitle = source ? slugifyKey(source.title) : '';
  const slug = slugifyKey(title) || sourceTitle;
  if (slug) return slug;

  const singular = nodeKey.replace(/s$/, '') || 'item';
  return `${slugifyKey(singular) || 'item'}_${index + 1}`;
}

function fieldId(path: string): string {
  return `field_${path
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()}`;
}

function labelFromKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugifyKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function stringifySlotValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function matchLabeledValue(text: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped}\\s*[:：-]\\s*([^\\n。.!?]+)`, 'i'));
    if (match?.[1]) return match[1];
  }
  return '';
}

function findSentence(text: string, pattern: RegExp): string {
  return (
    text
      .split(/[。.!?\n]/)
      .map((part) => part.trim())
      .find((part) => pattern.test(part)) ?? ''
  );
}

function firstMeaningfulSentence(text: string): string {
  return (
    text
      .split(/[。.!?\n]/)
      .map((part) => part.trim())
      .find((part) => part.length >= 12) ?? ''
  );
}

function trimSentence(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 220);
}

function evidenceFor(value: string, sources: WorkspaceSourceText[]): string {
  const sourceTitle = sources[0]?.title ?? 'source material';
  return `${sourceTitle}: ${value}`;
}

function joinSourceTexts(sources: WorkspaceSourceText[]): string {
  return sources.map((source) => source.text).join('\n\n');
}

function candidateIdFor(workspaceId: string, sources: WorkspaceSourceText[]): string {
  const signature = sources
    .map((source) => `${source.id}:${source.text.length}`)
    .join('|')
    .slice(0, 48);
  return `candidate:${workspaceId}:${signature || 'empty'}`;
}
