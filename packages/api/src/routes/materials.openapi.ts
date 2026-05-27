/**
 * Materials Routes (OpenAPI)
 *
 * Raw project source materials used by the chat Sources > Materials panel.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { estimateTokens, type Material } from '@t3x-dev/core';
import { createMaterial, findMaterialsByProject } from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import { parseDocument } from '../lib/import';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const EXCERPT_CHARS = 600;

export const materialsRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

const MaterialResponseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  source_type: z.enum(['document', 'url', 'platform']),
  title: z.string(),
  filename: z.string().nullable(),
  mime_type: z.string().nullable(),
  content_hash: z.string(),
  content_excerpt: z.string(),
  token_estimate: z.number(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  created_by: z.string().nullable(),
});

const listMaterialsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/materials',
  tags: ['Materials'],
  summary: 'List project materials',
  request: {
    params: z.object({
      projectId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Project materials',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.array(MaterialResponseSchema)),
        },
      },
    },
  },
});

materialsRoutes.openapi(listMaterialsRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const db = await getDB();
  const materials = await findMaterialsByProject(db, projectId, { limit: 500 });
  return c.json({
    success: true as const,
    data: materials.map(toMaterialResponse),
  });
});

const uploadDocumentMaterialRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/materials/document',
  tags: ['Materials'],
  summary: 'Upload a document as a source material',
  description: 'Upload and store a PDF, DOCX, Markdown, HTML, or text file as a raw material.',
  request: {
    params: z.object({
      projectId: z.string(),
    }),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.any(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Material created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(MaterialResponseSchema),
        },
      },
    },
    400: {
      description: 'Upload failed',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
materialsRoutes.openapi(uploadDocumentMaterialRoute, async (c) => {
  try {
    const { projectId } = c.req.valid('param');
    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || !(file instanceof File)) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NO_FILE', message: 'No file uploaded' },
        },
        400
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `File too large (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
          },
        },
        400
      );
    }

    const db = await getDB();
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseDocument(buffer, file.name, file.type);
    const title = parsed.metadata.title ?? file.name;

    const material = await createMaterial(db, {
      project_id: projectId,
      source_type: 'document',
      title,
      filename: file.name,
      mime_type: file.type || undefined,
      content_text: parsed.raw_text,
      content_hash: parsed.metadata.content_hash,
      metadata: parsed.metadata as unknown as Record<string, unknown>,
      token_estimate: estimateTokens(parsed.raw_text),
    });

    return c.json({
      success: true as const,
      data: toMaterialResponse(material),
    });
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'MATERIAL_UPLOAD_FAILED',
          message: err instanceof Error ? err.message : 'Material upload failed',
        },
      },
      400
    );
  }
});

function toMaterialResponse(material: Material) {
  const title = material.title ?? material.filename ?? material.id;
  return {
    id: material.id,
    project_id: material.project_id,
    source_type: material.source_type,
    title,
    filename: material.filename ?? null,
    mime_type: material.mime_type ?? null,
    content_hash: material.content_hash,
    content_excerpt: excerpt(material.content_text),
    token_estimate: material.token_estimate,
    metadata: material.metadata,
    created_at: material.created_at,
    created_by: material.created_by ?? null,
  };
}

function excerpt(text: string): string {
  if (text.length <= EXCERPT_CHARS) return text;
  return `${text.slice(0, EXCERPT_CHARS)}...`;
}
