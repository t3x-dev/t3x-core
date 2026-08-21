/**
 * Drafts Workflow Routes
 *
 * Heavier workflow operations for Draft management.
 * - POST /v1/drafts/:id/preview  - Generate preview output
 * - POST /v1/drafts/:id/commit   - Commit draft to project state
 * - POST /v1/drafts/:id/fork     - Fork a committed draft
 * - POST /v1/drafts/:id/extract  - Extract nodes from conversation
 * - POST /v1/drafts/:id/suggest  - Node suggestions from tree-backed graph search
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: workflow routes adapt heterogeneous draft and commit node payloads pending shared API types */

import { createHash } from 'node:crypto';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  DEMO_WORKSPACE_FIXTURE,
  DEMO_WORKSPACE_REPLAY_GOAL,
  generateLeafOutput,
  generateNodeId,
  isGenerationConfigured,
} from '@t3x-dev/core';
import {
  type AnyDB,
  commitDraft,
  createLeaf,
  ensureMainBranch,
  findDraftById,
  findMembersByNode,
  forkDraft,
  getTransitionRefHead,
  searchKnowledgeNodes,
  TransitionHeadConflictError,
  TransitionRefNotFoundError,
  updateDraftPreview,
  updateLeafAtomic,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { previewCache, previewDebounce } from '../lib/drafts-preview';
import { getEmbedder } from '../lib/embedder';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { getUserId, resolveProjectResourceAccess } from '../lib/project-access';
import {
  commitRepositoryYOpsState,
  createRepositoryYOpsStateFromSemanticContent,
  getRepositoryConversationEvidence,
} from '../lib/repository-state-transition';
import { findUncommittedYOpsIds, mapSupersededError } from '../lib/yops-commit-link';
import { ErrorResponseSchema, IdParamSchema, SuccessResponseSchema } from '../schemas/common';
import {
  CommitDraftRequest,
  CommitDraftResponse,
  DraftResponse,
  PreviewDraftRequest,
  PreviewDraftResponse,
  SuggestDraftRequest,
  SuggestDraftResponse,
} from '../schemas/contracts';
import { toApiDraft } from './drafts-crud.openapi';

export const draftsWorkflowRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

function committedAtFromTransition(
  transition: Awaited<ReturnType<typeof commitRepositoryYOpsState>>['transition']
): string {
  return transition.history.observation === 'committed'
    ? transition.history.commit.recordedAt
    : new Date().toISOString();
}

// ============================================================
// In-memory state constants
// ============================================================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_MS = 1000; // 1 second
type TxRunner = { transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown> };

class DraftWorkflowCommitConflictError extends Error {
  constructor(readonly draftId: string) {
    super(`Draft ${draftId} was already committed by another request`);
    this.name = 'DraftWorkflowCommitConflictError';
  }
}

async function observeDraftCommitHead(
  db: AnyDB,
  input: {
    projectId: string;
    targetBranch: string;
    draftParent: string | null | undefined;
  }
): Promise<string | null> {
  if (input.targetBranch === 'main') await ensureMainBranch(db, input.projectId);
  const observed = await getTransitionRefHead(db, {
    projectId: input.projectId,
    refName: input.targetBranch,
  });
  if (input.draftParent != null && input.draftParent !== observed.head) {
    throw new TransitionHeadConflictError(input.draftParent, observed.head);
  }
  return input.draftParent ?? observed.head;
}

// ============================================================
// Route Definitions
// ============================================================

const ProjectAccessDeniedResponse = {
  description: 'Project access denied',
  content: { 'application/json': { schema: ErrorResponseSchema } },
} as const;

// POST /v1/drafts/:id/preview
const previewDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/preview',
  tags: ['Drafts'],
  operationId: 'previewDraft',
  summary: 'Generate preview output',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: PreviewDraftRequest } },
      required: false,
    },
  },
  responses: {
    200: {
      description: 'Preview generated',
      content: { 'application/json': { schema: PreviewDraftResponse } },
    },
    400: {
      description: 'Invalid state',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: ProjectAccessDeniedResponse,
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    429: {
      description: 'Too many requests (debounce)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/drafts/:id/commit
const commitDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/commit',
  tags: ['Drafts', 'Commits'],
  operationId: 'commitDraft',
  summary: 'Commit draft',
  description:
    "Saves the draft's current structured state tree as an immutable commit in the hash chain. " +
    'The draft status changes to `committed`. ' +
    'Optionally provide a `message` and `branch` (defaults to current branch).',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: CommitDraftRequest } },
      required: false,
    },
  },
  responses: {
    201: {
      description: 'Draft committed and new commit created',
      content: { 'application/json': { schema: CommitDraftResponse } },
    },
    400: {
      description: 'Invalid state',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: ProjectAccessDeniedResponse,
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/drafts/:id/fork
const forkDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/fork',
  tags: ['Drafts'],
  operationId: 'forkDraft',
  summary: 'Fork a committed draft',
  request: { params: IdParamSchema },
  responses: {
    201: {
      description: 'Draft forked',
      content: { 'application/json': { schema: SuccessResponseSchema(DraftResponse) } },
    },
    400: {
      description: 'Draft not committed',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    403: ProjectAccessDeniedResponse,
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /v1/drafts/:id/suggest
const suggestDraftRoute = createRoute({
  method: 'post',
  path: '/v1/drafts/{id}/suggest',
  tags: ['Drafts'],
  summary: 'Get node suggestions based on draft goal',
  description:
    'Returns graph-backed node suggestions when a draft goal is provided. Empty goal or no graph matches returns an empty suggestion set.',
  request: {
    params: IdParamSchema,
    body: {
      content: { 'application/json': { schema: SuggestDraftRequest } },
      required: false,
    },
  },
  responses: {
    200: {
      description: 'Suggestions returned',
      content: { 'application/json': { schema: SuggestDraftResponse } },
    },
    403: ProjectAccessDeniedResponse,
    404: {
      description: 'Draft not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: 'Server error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// ============================================================
// Route Handlers
// ============================================================

// POST /v1/drafts/:id/preview
draftsWorkflowRoutes.openapi(previewDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Resolve the draft's stored project, then authorize that boundary.
    const draft = await resolveProjectResourceAccess(c, db, {
      load: () => findDraftById(db, id),
      projectId: (resource) => resource.project_id,
      notFoundCode: 'NOT_FOUND',
      notFoundMessage: `Draft not found: ${id}`,
    });
    if (draft instanceof Response) return draft;
    // 2. Validate state
    if (draft.status !== 'editing') {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Draft status is '${draft.status}', must be 'editing'`
      );
    }

    const includedNodes = (draft.nodes as any[]).filter((s: any) => s.included);
    if (includedNodes.length === 0) {
      return errorResponse(c, 'INVALID_REQUEST', 'Draft has no included nodes');
    }

    if (draft.goal === DEMO_WORKSPACE_REPLAY_GOAL) {
      await updateDraftPreview(db, id, DEMO_WORKSPACE_FIXTURE.leaf.output);
      return c.json(
        {
          success: true as const,
          data: {
            output: DEMO_WORKSPACE_FIXTURE.leaf.output,
            model_used: DEMO_WORKSPACE_FIXTURE.leaf.config.model,
            token_count: Math.ceil(DEMO_WORKSPACE_FIXTURE.leaf.output.length / 4),
            cached: false,
          },
        },
        200
      );
    }

    // 3. Check generation configured
    if (!isGenerationConfigured()) {
      return errorResponse(c, 'GENERATION_NOT_CONFIGURED', 'ANTHROPIC_API_KEY not set');
    }

    // 4. Debounce check
    const now = Date.now();
    const lastRequest = previewDebounce.get(id) ?? 0;
    if (now - lastRequest < DEBOUNCE_MS) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Please wait before requesting another preview',
          },
        },
        429
      );
    }
    previewDebounce.set(id, now);

    // 5. Compute cache key
    const previewType = body?.preview_type ?? draft.preview_type ?? 'tweet';
    const cacheInput = JSON.stringify({
      nodes: includedNodes.map((n) => n.text).sort(),
      constraints: draft.constraints,
      instructions: draft.instructions,
      preview_type: previewType,
    });
    const cacheHash = createHash('sha256').update(cacheInput).digest('hex');

    // 6. Cache check
    const cached = previewCache.get(id);
    if (cached && cached.hash === cacheHash && now - cached.time < CACHE_TTL_MS) {
      return c.json(
        {
          success: true as const,
          data: {
            output: cached.output,
            model_used: cached.model,
            token_count: cached.tokens,
            cached: true,
          },
        },
        200
      );
    }

    // 7. Build virtual commit + leaf for generation
    const virtualCommit = {
      hash: 'virtual:preview',
      schema: 't3x/commit/v2' as const,
      parents: [],
      author: { type: 'human' as const, name: 'preview' },
      committed_at: new Date().toISOString(),
      content: {
        trees: includedNodes.map((s: any) => ({
          key: s.id,
          slots: { text: s.text },
          children: [],
        })),
        relations: [],
      },
    };

    const virtualLeaf = {
      id: 'virtual:leaf',
      commit_hash: 'virtual:preview',
      type: previewType as 'tweet',
      constraints: draft.constraints.map((c) => ({
        ...c,
        id: c.id,
        match_mode: c.match_mode as 'exact' | 'semantic',
      })),
      config: {},
      project_id: draft.project_id,
      created_at: new Date().toISOString(),
    };

    // 8. Resolve model
    const MODEL_MAP: Record<string, string> = {
      haiku: 'claude-haiku-4-5-20251001',
      sonnet: 'claude-sonnet-4-6',
      opus: 'claude-opus-4-6',
    };
    const requestedModel = body?.model;
    const modelId = requestedModel
      ? (MODEL_MAP[requestedModel] ?? MODEL_MAP.haiku)
      : MODEL_MAP.haiku;

    // 9. Generate
    const result = await generateLeafOutput({
      knowledge: virtualCommit.content as any,
      leaf: virtualLeaf,
      additionalInstructions: draft.instructions,
      model: modelId,
      temperature: 0,
    });

    // 10. Cache + store
    const tokenCount = Math.ceil(result.output.length / 4); // rough estimate
    previewCache.set(id, {
      hash: cacheHash,
      output: result.output,
      model: result.model,
      tokens: tokenCount,
      time: now,
    });

    await updateDraftPreview(db, id, result.output);

    return c.json(
      {
        success: true as const,
        data: {
          output: result.output,
          model_used: result.model,
          token_count: tokenCount,
          cached: false,
        },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'GENERATION_FAILED', message);
  }
});

// POST /v1/drafts/:id/commit
draftsWorkflowRoutes.openapi(commitDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Resolve the draft's stored project, then authorize that boundary.
    const draft = await resolveProjectResourceAccess(c, db, {
      load: () => findDraftById(db, id),
      projectId: (resource) => resource.project_id,
      notFoundCode: 'NOT_FOUND',
      notFoundMessage: `Draft not found: ${id}`,
    });
    if (draft instanceof Response) return draft;
    const userId = getUserId(c);

    // 2. Validate state
    if (draft.status !== 'editing') {
      return errorResponse(
        c,
        'INVALID_REQUEST',
        `Draft status is '${draft.status}', must be 'editing'`
      );
    }

    if (draft.goal === DEMO_WORKSPACE_REPLAY_GOAL) {
      const targetBranch = body?.branch ?? draft.target_branch ?? 'main';
      const expectedHead = await observeDraftCommitHead(db, {
        projectId: draft.project_id,
        targetBranch,
        draftParent: draft.parent_commit_hash,
      });
      const content = {
        trees: DEMO_WORKSPACE_FIXTURE.replay.trees,
        relations: DEMO_WORKSPACE_FIXTURE.replay.relations,
      };
      const target = createRepositoryYOpsStateFromSemanticContent(content);
      const intent = body?.message ?? DEMO_WORKSPACE_FIXTURE.commit.message;
      const written = (await (db as unknown as TxRunner).transaction(async (rawTx) => {
        const tx = rawTx as AnyDB;
        const created = await commitRepositoryYOpsState({
          db: tx,
          projectId: draft.project_id,
          refName: targetBranch,
          expectedHead,
          target,
          actor: { kind: 'service', id: 'service:demo-fixture-replay' },
          intent,
        });
        const createdLeaf = await createLeaf(tx, {
          commit_hash: created.commitDigest,
          type: DEMO_WORKSPACE_FIXTURE.leaf.type,
          title: DEMO_WORKSPACE_FIXTURE.leaf.title,
          constraints: DEMO_WORKSPACE_FIXTURE.leaf.constraints,
          config: DEMO_WORKSPACE_FIXTURE.leaf.config,
          project_id: draft.project_id,
          created_by: 'fixture-replay',
        });
        const leaf =
          (await updateLeafAtomic(tx, createdLeaf.id, {
            output: DEMO_WORKSPACE_FIXTURE.leaf.output,
            assertions: DEMO_WORKSPACE_FIXTURE.leaf.assertions,
          })) ?? createdLeaf;
        const claimed = await commitDraft(tx, id, created.commitDigest, leaf.id);
        if (!claimed) throw new DraftWorkflowCommitConflictError(id);
        return { created, leaf };
      })) as {
        created: Awaited<ReturnType<typeof commitRepositoryYOpsState>>;
        leaf: Awaited<ReturnType<typeof createLeaf>>;
      };

      const commitResponse = {
        hash: written.created.commitDigest,
        schema: 't3x/commit/v2' as const,
        parents: written.created.commit.parents.map((parent) => parent.digest),
        committed_at: committedAtFromTransition(written.created.transition),
        content,
        project_id: draft.project_id,
        message: intent,
        branch: targetBranch,
      };

      return c.json(
        {
          success: true as const,
          data: {
            commit: commitResponse,
            leaf: {
              id: written.leaf.id,
              commit_hash: written.leaf.commit_hash,
              type: written.leaf.type,
              title: written.leaf.title ?? null,
              constraints: written.leaf.constraints ?? [],
              config: written.leaf.config ?? {},
              output: written.leaf.output ?? null,
              generated_at: written.leaf.generated_at ?? null,
              assertions: written.leaf.assertions ?? null,
              project_id: written.leaf.project_id,
              created_at: written.leaf.created_at,
              created_by: written.leaf.created_by ?? null,
            },
            draft_status: 'committed' as const,
          },
        },
        201
      );
    }

    // 3. Convert to Nodes (branch by extraction_mode)
    let nodes: Array<{
      id: string;
      text: string;
      source_ref?: {
        conversation_id: string;
        turn_hash: string;
        start_char: number;
        end_char: number;
      };
      supporting_refs?: Array<{
        conversation_id: string;
        turn_hash: string;
        start_char: number;
        end_char: number;
      }>;
      anchor_type?: 'verbatim' | 'paraphrase' | 'inference';
    }>;

    if (draft.extraction_mode === 'llm') {
      // LLM mode: convert staged SemanticPoints directly to node-like records
      const activeSPs = (
        (draft.semantic_points ?? []) as Array<{
          id: string;
          text: string;
          zone: string;
          status: string;
          staged: boolean;
          evidence?: Array<{
            conversation_id?: string;
            turn_hash?: string;
            start_char?: number;
            end_char?: number;
            role?: string;
          }>;
        }>
      ).filter((sp) => sp.zone === 'ready' && sp.status !== 'undone' && sp.staged);

      if (activeSPs.length === 0) {
        return errorResponse(c, 'INVALID_REQUEST', 'No staged state points to commit');
      }

      nodes = activeSPs.map((sp) => {
        const primary = sp.evidence?.find((e) => e.conversation_id && e.turn_hash);
        return {
          id: sp.id,
          text: sp.text,
          source_ref: primary
            ? {
                conversation_id: primary.conversation_id!,
                turn_hash: primary.turn_hash!,
                start_char: primary.start_char ?? 0,
                end_char: primary.end_char ?? sp.text.length,
              }
            : undefined,
        };
      });
    } else {
      // Deterministic mode: existing DraftNode flow
      const includedNodes = (draft.nodes as any[]).filter((s: any) => s.included);
      if (includedNodes.length === 0) {
        return errorResponse(c, 'INVALID_REQUEST', 'Draft has no included nodes');
      }

      nodes = includedNodes.map((ds: any) => {
        const sourceRef =
          ds.source && (ds.origin.type === 'extracted' || ds.origin.type === 'selected')
            ? {
                conversation_id: ds.source.conversation_id,
                turn_hash: ds.source.turn_hash,
                start_char: ds.source.start_char,
                end_char: ds.source.end_char,
              }
            : undefined;

        return {
          id: generateNodeId(),
          text: ds.text,
          source_ref: sourceRef,
        };
      });
    }

    const targetBranch = body?.branch ?? draft.target_branch ?? 'main';
    const expectedHead = await observeDraftCommitHead(db, {
      projectId: draft.project_id,
      targetBranch,
      draftParent: draft.parent_commit_hash,
    });

    // 4. Build the exact target repository state.
    const commitFrames = nodes.map((s, i) => ({
      id: s.id || `f_${String(i + 1).padStart(3, '0')}`,
      type: 'legacy_sentence' as const,
      slots: { text: s.text },
    }));
    const content = {
      trees: commitFrames.map((frame) => ({
        key: frame.id,
        slots: frame.slots,
        children: [] as any[],
      })),
      relations: [],
    };
    const target = createRepositoryYOpsStateFromSemanticContent(content);
    const intent = body?.message ?? `Draft: ${draft.title}`;

    // 5. Best-effort: populate node vectors (skip on failure)
    const embedder = getEmbedder();
    if (embedder) {
      try {
        const texts = nodes.map((n) => n.text);
        await embedder.encode(texts);
      } catch (embedErr) {
        console.warn('Vector population failed (best-effort, continuing):', embedErr);
      }
    }

    // 6. Persist CommitV2, optional Leaf, and draft claim atomically.
    const written = (await (db as unknown as TxRunner).transaction(async (rawTx) => {
      const tx = rawTx as AnyDB;
      const draftConversationId = draft.goal?.startsWith('auto:') ? draft.goal.slice(5) : undefined;
      const yopsLogIds = draftConversationId
        ? await findUncommittedYOpsIds(tx, draftConversationId, draft.project_id)
        : [];
      const evidence = draftConversationId
        ? await getRepositoryConversationEvidence(tx, draft.project_id, draftConversationId)
        : [];
      const created = await commitRepositoryYOpsState({
        db: tx,
        projectId: draft.project_id,
        refName: targetBranch,
        expectedHead,
        target,
        actor: {
          kind: 'human',
          id: userId ? `user:${userId}` : 'human:local-user',
        },
        intent,
        ...(evidence.length === 0 ? {} : { evidence }),
        ...(yopsLogIds.length === 0 ? {} : { yopsLogIds }),
      });
      let leaf: Awaited<ReturnType<typeof createLeaf>> | null = null;
      if (draft.constraints.length > 0 || draft.preview_type) {
        const leafConstraints = draft.constraints.map((constraint) => ({
          id: constraint.id.replace(/^dc_/, 'cst_'),
          type: constraint.type as 'require' | 'exclude',
          match_mode: constraint.match_mode as 'exact' | 'semantic',
          value: constraint.value,
          reason: constraint.reason,
        }));
        leaf = await createLeaf(tx, {
          commit_hash: created.commitDigest,
          type: (draft.preview_type ?? 'tweet') as 'tweet',
          title: draft.title,
          constraints: leafConstraints,
          config: {},
          project_id: draft.project_id,
        });
      }
      const claimed = await commitDraft(tx, id, created.commitDigest, leaf?.id);
      if (!claimed) throw new DraftWorkflowCommitConflictError(id);
      return { created, leaf };
    })) as {
      created: Awaited<ReturnType<typeof commitRepositoryYOpsState>>;
      leaf: Awaited<ReturnType<typeof createLeaf>> | null;
    };

    // 7. Build the task-oriented CommitV2 projection.
    const commitResponse = {
      hash: written.created.commitDigest,
      schema: 't3x/commit/v2' as const,
      parents: written.created.commit.parents.map((parent) => parent.digest),
      committed_at: committedAtFromTransition(written.created.transition),
      content,
      project_id: draft.project_id,
      message: intent,
      branch: targetBranch,
    };

    const leafResponse = written.leaf
      ? {
          id: written.leaf.id,
          commit_hash: written.leaf.commit_hash,
          type: written.leaf.type,
          title: written.leaf.title ?? null,
          constraints: written.leaf.constraints ?? [],
          config: written.leaf.config ?? {},
          output: written.leaf.output ?? null,
          generated_at: written.leaf.generated_at ?? null,
          assertions: written.leaf.assertions ?? null,
          project_id: written.leaf.project_id,
          created_at: written.leaf.created_at,
          created_by: written.leaf.created_by ?? null,
        }
      : null;

    return c.json(
      {
        success: true as const,
        data: {
          commit: commitResponse,
          leaf: leafResponse,
          draft_status: 'committed' as const,
        },
      },
      201
    );
  } catch (err) {
    if (err instanceof TransitionHeadConflictError) {
      return errorResponse(c, 'BRANCH_NOT_HEAD', err.message);
    }
    if (err instanceof TransitionRefNotFoundError) {
      return errorResponse(c, 'NOT_FOUND', err.message);
    }
    if (err instanceof DraftWorkflowCommitConflictError) {
      return errorResponse(c, 'ALREADY_COMMITTED', err.message);
    }
    // Suggestion-vs-baseline: surface concurrent-supersede races as
    // 409 retryable conflict, not opaque 500.
    const conflict = mapSupersededError(c, err);
    if (conflict) return conflict;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// POST /v1/drafts/:id/fork
draftsWorkflowRoutes.openapi(forkDraftRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const draft = await resolveProjectResourceAccess(c, db, {
      load: () => findDraftById(db, id),
      projectId: (resource) => resource.project_id,
      notFoundCode: 'NOT_FOUND',
      notFoundMessage: `Draft not found: ${id}`,
    });
    if (draft instanceof Response) return draft;
    const forked = await forkDraft(db, id);

    return c.json({ success: true as const, data: toApiDraft(forked) }, 201);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('not found')) {
        return errorResponse(c, 'NOT_FOUND', err.message);
      }
      if (err.message.includes('Cannot fork')) {
        return errorResponse(c, 'INVALID_REQUEST', err.message);
      }
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'CREATE_FAILED', message);
  }
});

// POST /v1/drafts/:id/suggest
draftsWorkflowRoutes.openapi(suggestDraftRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');

  try {
    const db = await getDB();

    // 1. Resolve the draft's stored project, then authorize that boundary.
    const draft = await resolveProjectResourceAccess(c, db, {
      load: () => findDraftById(db, id),
      projectId: (resource) => resource.project_id,
      notFoundCode: 'NOT_FOUND',
      notFoundMessage: `Draft not found: ${id}`,
    });
    if (draft instanceof Response) return draft;

    // No goal means no retrieval intent, so an empty result is a valid response.
    if (!draft.goal) {
      return c.json(
        {
          success: true as const,
          data: { suggestions: [] },
        },
        200
      );
    }

    const limit = body?.limit ?? 10;
    const nodes = await searchKnowledgeNodes(db, draft.project_id, draft.goal, { limit });
    const draftNodeKeys = collectDraftNodeKeys(draft.nodes);
    const suggestions = await Promise.all(
      nodes.map(async (node) => {
        const members = await findMembersByNode(db, node.id);
        const primaryMember = members[0];
        return {
          node_id: node.id,
          text: node.summary ? `${node.label}: ${node.summary}` : node.label,
          commit_hash: primaryMember?.commit_hash ?? '',
          similarity: scoreNodeSuggestion(draft.goal ?? '', node.label),
          already_in_draft: draftNodeKeys.has(node.id) || draftNodeKeys.has(node.label),
        };
      })
    );

    return c.json(
      {
        success: true as const,
        data: { suggestions },
      },
      200
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(c, 'SUGGEST_FAILED', message);
  }
});

function collectDraftNodeKeys(nodes: unknown[]): Set<string> {
  const keys = new Set<string>();

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const record = node as Record<string, unknown>;
    for (const field of ['id', 'key', 'path', 'node_id']) {
      const value = record[field];
      if (typeof value === 'string' && value.trim()) {
        keys.add(value.trim());
      }
    }
  }

  return keys;
}

function scoreNodeSuggestion(goal: string, label: string): number {
  const normalizedGoal = goal.trim().toLowerCase();
  const normalizedLabel = label.trim().toLowerCase();
  if (!normalizedGoal || !normalizedLabel) return 0;
  if (normalizedGoal === normalizedLabel) return 1;
  if (normalizedLabel.includes(normalizedGoal)) return 0.9;
  if (normalizedGoal.includes(normalizedLabel)) return 0.8;
  return 0.5;
}
