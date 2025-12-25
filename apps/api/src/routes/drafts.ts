/**
 * Drafts Routes
 *
 * GET    /v1/drafts - List drafts (requires project_id query)
 * POST   /v1/drafts - Create draft
 * GET    /v1/drafts/:id - Get draft
 * DELETE /v1/drafts/:id - Delete draft
 */
import { Hono } from 'hono';
import { getDB } from '../lib/db';
import { jsonSuccess, jsonError } from '../lib/response';
import {
  insertDraft,
  findDraftsByProject,
  findDraftById,
  findProjectById,
  deleteDraft,
  type DraftStatus,
} from '@t3x/storage/pglite';

export const draftRoutes = new Hono();

/**
 * GET /v1/drafts - List drafts
 */
draftRoutes.get('/v1/drafts', async (c) => {
  const projectId = c.req.query('project_id');

  if (!projectId) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id query param is required', 400);
  }

  const status = (c.req.query('status') as DraftStatus | null) ?? undefined;
  const limit = parseInt(c.req.query('limit') ?? '100', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  try {
    const db = await getDB();
    const draftList = await findDraftsByProject(db, { projectId, status, limit, offset });

    const apiDrafts = draftList.map((d) => ({
      draft_id: d.draftId,
      project_id: d.projectId,
      conversation_id: d.conversationId,
      base_commit_hash: d.baseCommitHash,
      turn_anchor_hash: d.turnAnchorHash,
      bridge_id: d.bridgeId,
      bridge_payload_json: d.bridgePayloadJson,
      must_have_json: d.mustHaveJson,
      mustnt_have_json: d.mustntHaveJson,
      llm_config_json: d.llmConfigJson,
      text: d.text,
      status: d.status,
      created_at: d.createdAt.toISOString(),
      completed_at: d.completedAt?.toISOString() ?? null,
    }));

    return jsonSuccess(c, { drafts: apiDrafts, project_id: projectId, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'LIST_FAILED', message, 500);
  }
});

/**
 * POST /v1/drafts - Create draft
 */
draftRoutes.post('/v1/drafts', async (c) => {
  let body: {
    project_id?: string;
    conversation_id?: string;
    base_commit_hash?: string;
    turn_anchor_hash?: string;
    bridge_id?: string;
    bridge_payload?: unknown;
    must_have?: unknown[];
    mustnt_have?: unknown[];
    llm_config?: unknown;
    text?: string;
  } | null = null;

  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 'INVALID_JSON', 'Invalid JSON body', 400);
  }

  if (!body?.project_id || !body?.conversation_id || !body?.bridge_id || !body?.text) {
    return jsonError(c, 'INVALID_REQUEST', 'project_id, conversation_id, bridge_id, and text are required', 400);
  }

  try {
    const db = await getDB();

    // Verify project exists
    const project = await findProjectById(db, body.project_id);
    if (!project) {
      return jsonError(c, 'NOT_FOUND', `Project ${body.project_id} not found`, 404);
    }

    const draft = await insertDraft(db, {
      projectId: body.project_id,
      conversationId: body.conversation_id,
      baseCommitHash: body.base_commit_hash,
      turnAnchorHash: body.turn_anchor_hash,
      bridgeId: body.bridge_id,
      bridgePayload: body.bridge_payload ?? {},
      mustHave: body.must_have,
      mustntHave: body.mustnt_have,
      llmConfig: body.llm_config ?? {},
      text: body.text,
    });

    const apiDraft = {
      draft_id: draft.draftId,
      project_id: draft.projectId,
      conversation_id: draft.conversationId,
      base_commit_hash: draft.baseCommitHash,
      turn_anchor_hash: draft.turnAnchorHash,
      bridge_id: draft.bridgeId,
      bridge_payload_json: draft.bridgePayloadJson,
      must_have_json: draft.mustHaveJson,
      mustnt_have_json: draft.mustntHaveJson,
      llm_config_json: draft.llmConfigJson,
      text: draft.text,
      status: draft.status,
      created_at: draft.createdAt.toISOString(),
      completed_at: draft.completedAt?.toISOString() ?? null,
    };

    return jsonSuccess(c, apiDraft, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'CREATE_FAILED', message, 500);
  }
});

/**
 * GET /v1/drafts/:id - Get draft
 */
draftRoutes.get('/v1/drafts/:id', async (c) => {
  const draftId = c.req.param('id');

  try {
    const db = await getDB();
    const draft = await findDraftById(db, draftId);

    if (!draft) {
      return jsonError(c, 'NOT_FOUND', `Draft ${draftId} not found`, 404);
    }

    const apiDraft = {
      draft_id: draft.draftId,
      project_id: draft.projectId,
      conversation_id: draft.conversationId,
      base_commit_hash: draft.baseCommitHash,
      turn_anchor_hash: draft.turnAnchorHash,
      bridge_id: draft.bridgeId,
      bridge_payload_json: draft.bridgePayloadJson,
      must_have_json: draft.mustHaveJson,
      mustnt_have_json: draft.mustntHaveJson,
      llm_config_json: draft.llmConfigJson,
      text: draft.text,
      status: draft.status,
      created_at: draft.createdAt.toISOString(),
      completed_at: draft.completedAt?.toISOString() ?? null,
    };

    return jsonSuccess(c, apiDraft);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'GET_FAILED', message, 500);
  }
});

/**
 * DELETE /v1/drafts/:id - Delete draft
 */
draftRoutes.delete('/v1/drafts/:id', async (c) => {
  const draftId = c.req.param('id');

  try {
    const db = await getDB();
    const deleted = await deleteDraft(db, draftId);

    if (!deleted) {
      return jsonError(c, 'NOT_FOUND', `Draft ${draftId} not found`, 404);
    }

    return jsonSuccess(c, { deleted: true, draft_id: draftId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(c, 'DELETE_FAILED', message, 500);
  }
});
