import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  MAX_SOURCE_ATTACHMENT_BYTES,
  type SourceIngestionInput,
  SourceIngestionInputSchema,
  SourceIngestionReceiptSchema,
} from '@t3x-dev/api-client';
import { sha256 } from '@t3x-dev/core';
import {
  type AnyDB,
  createMaterial,
  findConversationById,
  findSourceIngestionReceipt,
  insertConversation,
  insertTurn,
  SourceIngestionConflictError,
  transactSourceIngestion,
} from '@t3x-dev/storage';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { getRequestPrincipal } from '../lib/request-principal';
import { parseSourceAttachment } from '../lib/source-attachments';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const params = z.object({ projectId: z.string().min(1), requestId: z.string().min(1).max(200) });
const failure = {
  description: 'Source ingestion rejected',
  content: { 'application/json': { schema: ErrorResponseSchema } },
};
const responses = {
  200: {
    description: 'Persisted Project Source ingestion receipt',
    content: {
      'application/json': { schema: SuccessResponseSchema(SourceIngestionReceiptSchema) },
    },
  },
  400: failure,
  401: failure,
  403: failure,
  404: failure,
  409: failure,
  413: failure,
};

const writeRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/source-ingestions/{requestId}',
  tags: ['Sources'],
  request: {
    params,
    body: {
      required: true,
      content: { 'application/json': { schema: SourceIngestionInputSchema } },
    },
  },
  responses,
});
const readRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/source-ingestions/{requestId}',
  tags: ['Sources'],
  request: { params },
  responses,
});

export const sourceIngestionRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });
sourceIngestionRoutes.use(
  '/v1/projects/:projectId/source-ingestions/:requestId',
  bodyLimit({
    maxSize: 4 * Math.ceil(MAX_SOURCE_ATTACHMENT_BYTES / 3) + 4096,
    onError: (c) =>
      c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Source ingestion body is too large.' },
        },
        413
      ),
  })
);

async function authorize(c: Context, projectId: string, requestId: string) {
  const principal = getRequestPrincipal(c);
  if (!principal || principal.credential.kind === 'local_dev') {
    return errorResponse(c, 'UNAUTHORIZED', 'An authenticated credential is required.');
  }
  if (
    principal.actor.kind !== 'agent' ||
    principal.credential.projectId !== projectId ||
    !principal.actor.id.startsWith('agent:api-key:')
  ) {
    return errorResponse(
      c,
      'FORBIDDEN',
      'Source ingestion requires a project-bound Agent credential.'
    );
  }
  const db = await getDB();
  const allowed = await assertProjectAccess(c, db, projectId, 'project:edit');
  if (allowed instanceof Response) return allowed;
  return { db, key: { projectId, requestId, actorId: principal.actor.id } };
}

function responseReceipt(receipt: {
  requestId: string;
  projectId: string;
  actorId: string;
  result: Record<string, unknown>;
}) {
  return SourceIngestionReceiptSchema.parse({
    request_id: receipt.requestId,
    project_id: receipt.projectId,
    actor: { kind: 'agent', id: receipt.actorId },
    result: receipt.result,
  });
}

class UnknownSourceThreadError extends Error {}
class SourceAttachmentError extends Error {}

async function ingest(tx: AnyDB, projectId: string, actorId: string, input: SourceIngestionInput) {
  const { action } = input;
  if (action === 'create_thread') {
    const thread = await insertConversation(tx, { projectId, title: input.title });
    return { action, source_thread_id: thread.conversationId };
  }
  if (action === 'append_turn') {
    const thread = await findConversationById(tx, input.source_thread_id);
    if (!thread || thread.projectId !== projectId) throw new UnknownSourceThreadError();
    const turn = await insertTurn(tx, {
      projectId,
      conversationId: thread.conversationId,
      role: 'tool',
      content: input.content,
      expectedParentTurnHash: input.expected_parent_turn_hash,
    });
    return {
      action,
      source_thread_id: thread.conversationId,
      turn_hash: turn.turnHash,
      parent_turn_hash: turn.parentTurnHash,
      content_digest: `sha256:${sha256(input.content)}`,
    };
  }
  const buffer = Buffer.from(input.bytes_base64, 'base64');
  if (
    buffer.length > MAX_SOURCE_ATTACHMENT_BYTES ||
    buffer.toString('base64') !== input.bytes_base64
  ) {
    throw new SourceAttachmentError('Provide canonical base64 for an attachment up to 5 MiB.');
  }
  const attachment = await parseSourceAttachment(
    buffer,
    input.filename,
    input.mime_type ?? ''
  ).catch((error) => {
    throw new SourceAttachmentError(
      error instanceof Error ? error.message : 'Attachment could not be parsed.'
    );
  });
  const material = await createMaterial(
    tx,
    { ...attachment, project_id: projectId, created_by: actorId },
    true
  );
  if (
    material.content_text !== attachment.content_text ||
    material.source_type !== attachment.source_type
  ) {
    throw new SourceIngestionConflictError(
      'An existing material with this import digest has a different parsed representation.'
    );
  }
  return {
    action,
    material_id: material.id,
    attachment_digest: `sha256:${sha256(buffer)}`,
    content_hash: material.content_hash,
    material_created_by: material.created_by ?? null,
  };
}

sourceIngestionRoutes.openapi(writeRoute, async (c) => {
  const { projectId, requestId } = c.req.valid('param');
  const authorized = await authorize(c, projectId, requestId);
  if (authorized instanceof Response) return authorized;
  const input = c.req.valid('json');
  try {
    const receipt = await transactSourceIngestion(
      authorized.db,
      authorized.key,
      sha256(input),
      (tx) => ingest(tx, projectId, authorized.key.actorId, input)
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json({ success: true as const, data: responseReceipt(receipt) }, 200);
  } catch (error) {
    if (error instanceof SourceIngestionConflictError)
      return errorResponse(c, 'CONFLICT', error.message);
    if (error instanceof UnknownSourceThreadError)
      return errorResponse(c, 'NOT_FOUND', 'Source Thread not found.');
    if (error instanceof SourceAttachmentError)
      return errorResponse(c, 'INVALID_REQUEST', error.message);
    throw error;
  }
});

sourceIngestionRoutes.openapi(readRoute, async (c) => {
  const { projectId, requestId } = c.req.valid('param');
  const authorized = await authorize(c, projectId, requestId);
  if (authorized instanceof Response) return authorized;
  const receipt = await findSourceIngestionReceipt(authorized.db, authorized.key);
  if (!receipt) return errorResponse(c, 'NOT_FOUND', 'Source ingestion receipt not found.');
  c.header('Cache-Control', 'private, no-store');
  return c.json({ success: true as const, data: responseReceipt(receipt) }, 200);
});
