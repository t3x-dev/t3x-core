import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type AnyDB,
  findValidationRunDetailsById,
  listProjectCheckRecords,
  listPullRequestChecks,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { createError } from '../lib/errors';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const Kind = z.enum(['review', 'validation', 'schema', 'pull-request']);
const RecordSchema = z.object({
  id: z.string(),
  kind: Kind,
  created_at: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
const params = z.object({ projectId: z.string().min(1) });
const query = z.object({
  kind: Kind.optional(),
  workspace: z.string().min(1).optional(),
  pr: z.coerce.number().int().positive().optional(),
  commit: z.string().min(1).optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const errorResponses = {
  400: {
    description: 'Invalid query',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  403: {
    description: 'Project access denied',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
  404: {
    description: 'Project or record not found',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  },
};
export const projectChecksRoutes = new OpenAPIHono();

const listProjectChecksRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/checks',
  tags: ['Checks'],
  summary: 'List saved check evidence and current PR readiness',
  request: { params, query },
  responses: {
    ...errorResponses,
    200: {
      description: 'Project-scoped check records',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({ records: z.array(RecordSchema), next_cursor: z.string().nullable() })
          ),
        },
      },
    },
  },
});

projectChecksRoutes.openapi(listProjectChecksRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const { cursor, limit, ...filters } = c.req.valid('query');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  let before: { createdAt: string; id: string } | undefined;
  if (cursor) {
    try {
      before = z
        .object({
          createdAt: z.string().refine((v) => Number.isFinite(Date.parse(v))),
          id: z.string().min(1),
        })
        .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    } catch {
      return c.json(createError('INVALID_REQUEST', 'The checks cursor is invalid.'), 400);
    }
  }
  const rows = await listProjectCheckRecords(db, {
    projectId,
    ...filters,
    before,
    limit: limit + 1,
  });
  const records = rows.slice(0, limit);
  const last = records.at(-1);
  const next =
    rows.length > limit && last
      ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString(
          'base64url'
        )
      : null;
  return c.json({ success: true as const, data: { records, next_cursor: next } }, 200);
});

const getProjectCheckRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/checks/{recordId}',
  tags: ['Checks'],
  summary: 'Read one saved check record or the current readiness of a PR',
  request: { params: params.extend({ recordId: z.string().min(1) }) },
  responses: {
    ...errorResponses,
    200: {
      description: 'Check record and available evidence',
      content: { 'application/json': { schema: SuccessResponseSchema(RecordSchema) } },
    },
  },
});

projectChecksRoutes.openapi(getProjectCheckRoute, async (c) => {
  const { projectId, recordId } = c.req.valid('param');
  const db = await getDB();
  const access = await assertProjectAccess(c, db, projectId);
  if (access instanceof Response) return access;
  // PR heads and their replaceable checks must come from the same database snapshot.
  const record = await db.transaction(
    async (tx) => {
      const readDB = tx as AnyDB;
      const [found] = await listProjectCheckRecords(readDB, { projectId, id: recordId, limit: 1 });
      if (!found) return null;
      if (found.kind === 'validation') {
        found.payload.details = await findValidationRunDetailsById(
          readDB,
          String(found.payload.id)
        );
      } else if (found.kind === 'pull-request') {
        found.payload.checks = await listPullRequestChecks(
          readDB,
          String(found.payload.pull_request_id)
        );
      }
      return found;
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' }
  );
  if (!record)
    return c.json(createError('NOT_FOUND', 'Check record not found in this project.'), 404);
  return c.json({ success: true as const, data: record }, 200);
});
