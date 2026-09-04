/**
 * Materials Routes (OpenAPI)
 *
 * Raw project source materials used by the chat Sources > Materials panel.
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { estimateTokens, type Material } from '@t3x-dev/core';
import {
  type AnyDB,
  archiveMaterial,
  createMaterial,
  findMaterialById,
  findMaterialByProjectHash,
  findMaterialsByProject,
  restoreArchivedMaterial,
  updateMaterialContent,
} from '@t3x-dev/storage';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import { parseDocument, parseUrl } from '../lib/import';
import { assertProjectAccess } from '../lib/project-access';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_MATERIAL_TEXT_CHARS = 20_000;
const EXCERPT_CHARS = 600;
const SEGMENT_MAX_CHARS = 1200;

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
  archived_at: z.string().nullable(),
  created_by: z.string().nullable(),
});

const MaterialSegmentSchema = z.object({
  id: z.string(),
  index: z.number(),
  label: z.string(),
  text: z.string(),
  char_start: z.number(),
  char_end: z.number(),
  token_estimate: z.number(),
});

const MaterialParseQualitySchema = z.object({
  status: z.enum(['ready', 'partial', 'poor', 'empty']),
  score: z.number(),
  message: z.string(),
});

const MaterialDetailResponseSchema = MaterialResponseSchema.extend({
  content_text: z.string(),
  page_count: z.number().nullable(),
  segment_count: z.number(),
  segments: z.array(MaterialSegmentSchema),
  parse_quality: MaterialParseQualitySchema,
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

// @ts-expect-error - OpenAPI handler return type
materialsRoutes.openapi(listMaterialsRoute, async (c) => {
  const { projectId } = c.req.valid('param');
  const db = await getDB();
  const accessResult = await assertProjectAccess(c, db, projectId);
  if (accessResult instanceof Response) return accessResult;
  const materials = await findMaterialsByProject(db, projectId, { limit: 500 });
  return c.json({
    success: true as const,
    data: materials.map(toMaterialResponse),
  });
});

const getMaterialRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{projectId}/materials/{materialId}',
  tags: ['Materials'],
  summary: 'Get project material detail',
  description: 'Returns parsed material text and deterministic segments for the Material Reader.',
  request: {
    params: z.object({
      projectId: z.string(),
      materialId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Material detail',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(MaterialDetailResponseSchema),
        },
      },
    },
    404: {
      description: 'Material not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
materialsRoutes.openapi(getMaterialRoute, async (c) => {
  const { projectId, materialId } = c.req.valid('param');
  const db = await getDB();
  const material = await findMaterialById(db, materialId);

  if (!material || material.project_id !== projectId) {
    return c.json(
      {
        success: false as const,
        error: { code: 'MATERIAL_NOT_FOUND', message: 'Material not found' },
      },
      404
    );
  }
  const accessResult = await assertProjectAccess(c, db, projectId);
  if (accessResult instanceof Response) return accessResult;

  return c.json({
    success: true as const,
    data: toMaterialDetailResponse(material),
  });
});

const archiveMaterialRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{projectId}/materials/{materialId}',
  tags: ['Materials'],
  summary: 'Archive a project material',
  description:
    'Archives a material so it no longer appears as an available source candidate. Direct detail lookups remain available for audit trails.',
  request: {
    params: z.object({
      projectId: z.string(),
      materialId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Material archived',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(MaterialDetailResponseSchema),
        },
      },
    },
    404: {
      description: 'Material not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
materialsRoutes.openapi(archiveMaterialRoute, async (c) => {
  const { projectId, materialId } = c.req.valid('param');
  const db = await getDB();
  const material = await findMaterialById(db, materialId);

  if (!material || material.project_id !== projectId) {
    return c.json(
      {
        success: false as const,
        error: { code: 'MATERIAL_NOT_FOUND', message: 'Material not found' },
      },
      404
    );
  }
  const accessResult = await assertProjectAccess(c, db, projectId);
  if (accessResult instanceof Response) return accessResult;

  const archived = await archiveMaterial(db, materialId);
  if (!archived) {
    return c.json(
      {
        success: false as const,
        error: { code: 'MATERIAL_NOT_FOUND', message: 'Material not found' },
      },
      404
    );
  }

  return c.json({
    success: true as const,
    data: toMaterialDetailResponse(archived),
  });
});

const uploadDocumentMaterialRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/materials/document',
  tags: ['Materials'],
  summary: 'Upload a document as a source material',
  description:
    'Upload and store a PDF, DOCX, Markdown, HTML, text, XLSX, or CSV file as a raw material. Chat materials are limited to 5MB files and 20,000 parsed text characters.',
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
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

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

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseDocument(buffer, file.name, file.type);
    const parsedTextLength = parsed.raw_text.trim().length;
    if (parsedTextLength === 0) {
      throw new Error('No readable text was extracted from this file.');
    }
    if (parsedTextLength > MAX_MATERIAL_TEXT_CHARS) {
      throw new Error(
        'Parsed text is too long for chat context. This file produced more than 20,000 characters.'
      );
    }
    const title = parsed.metadata.title ?? file.name;
    const existing = await findMaterialByProjectHash(db, projectId, parsed.metadata.content_hash);
    if (existing) {
      const restored =
        typeof existing.archived_at === 'string'
          ? await restoreArchivedMaterial(db, existing.id)
          : existing;

      return c.json({
        success: true as const,
        data: toMaterialResponse(restored ?? existing),
      });
    }

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

const createUrlMaterialRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/materials/url',
  tags: ['Materials'],
  summary: 'Import a URL as a source material',
  description:
    'Fetch, parse, and store URL content as a reusable project material for Workspace source evidence.',
  request: {
    params: z.object({
      projectId: z.string(),
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            url: z.string().url(),
            title: z.string().trim().min(1).max(160).optional(),
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
      description: 'URL import failed',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
materialsRoutes.openapi(createUrlMaterialRoute, async (c) => {
  try {
    const { projectId } = c.req.valid('param');
    const { title: requestedTitle, url } = c.req.valid('json');
    const db = await getDB();
    const accessResult = await assertProjectAccess(c, db, projectId);
    if (accessResult instanceof Response) return accessResult;

    const parsed = await parseUrl(url);
    assertMaterialTextWithinLimits(parsed.raw_text);

    const existing = await findMaterialByProjectHash(db, projectId, parsed.metadata.content_hash);
    if (existing) {
      const restored =
        typeof existing.archived_at === 'string'
          ? await restoreArchivedMaterial(db, existing.id)
          : existing;

      return c.json({
        success: true as const,
        data: toMaterialResponse(restored ?? existing),
      });
    }

    const material = await createMaterial(db, {
      project_id: projectId,
      source_type: 'url',
      title: requestedTitle ?? parsed.metadata.title ?? new URL(url).hostname,
      filename: undefined,
      mime_type: 'text/markdown',
      content_text: parsed.raw_text,
      content_hash: parsed.metadata.content_hash,
      metadata: {
        ...parsed.metadata,
        source_url: url,
      } as Record<string, unknown>,
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
          code: 'MATERIAL_URL_IMPORT_FAILED',
          message: err instanceof Error ? err.message : 'URL material import failed',
        },
      },
      400
    );
  }
});

const reparseMaterialRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{projectId}/materials/{materialId}/reparse',
  tags: ['Materials'],
  summary: 'Refresh a material parse preview',
  description:
    'Refreshes URL materials from their source URL. Uploaded documents are re-segmented from stored parsed text because raw upload bytes are not persisted.',
  request: {
    params: z.object({
      projectId: z.string(),
      materialId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Material parse refreshed',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(MaterialDetailResponseSchema),
        },
      },
    },
    404: {
      description: 'Material not found',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
    409: {
      description: 'Refreshed content duplicates another material',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

// @ts-expect-error - OpenAPI handler return type
materialsRoutes.openapi(reparseMaterialRoute, async (c) => {
  const { projectId, materialId } = c.req.valid('param');
  const db = await getDB();
  const material = await findMaterialById(db, materialId);

  if (!material || material.project_id !== projectId) {
    return c.json(
      {
        success: false as const,
        error: { code: 'MATERIAL_NOT_FOUND', message: 'Material not found' },
      },
      404
    );
  }
  const accessResult = await assertProjectAccess(c, db, projectId);
  if (accessResult instanceof Response) return accessResult;

  if (material.source_type !== 'url') {
    const refreshed = await resegmentStoredMaterial(db, material);
    return c.json({
      success: true as const,
      data: toMaterialDetailResponse(refreshed),
    });
  }

  const sourceUrl = stringMetadata(material.metadata.source_url);
  if (!sourceUrl) {
    const refreshed = await resegmentStoredMaterial(db, material);
    return c.json({
      success: true as const,
      data: toMaterialDetailResponse(refreshed),
    });
  }

  try {
    const parsed = await parseUrl(sourceUrl);
    assertMaterialTextWithinLimits(parsed.raw_text);
    const duplicate = await findMaterialByProjectHash(db, projectId, parsed.metadata.content_hash);
    if (duplicate && duplicate.id !== material.id) {
      return c.json(
        {
          success: false as const,
          error: {
            code: 'MATERIAL_DUPLICATE',
            message: 'The refreshed URL content matches another project material.',
          },
        },
        409
      );
    }

    const updated = await updateMaterialContent(db, material.id, {
      title: parsed.metadata.title ?? material.title ?? new URL(sourceUrl).hostname,
      filename: material.filename ?? null,
      mime_type: 'text/markdown',
      content_text: parsed.raw_text,
      content_hash: parsed.metadata.content_hash,
      metadata: {
        ...parsed.metadata,
        source_url: sourceUrl,
        reparsed_at: new Date().toISOString(),
        reparse_mode: 'url_refresh',
      } as Record<string, unknown>,
      token_estimate: estimateTokens(parsed.raw_text),
    });

    return c.json({
      success: true as const,
      data: toMaterialDetailResponse(updated ?? material),
    });
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'MATERIAL_REPARSE_FAILED',
          message: err instanceof Error ? err.message : 'Material reparse failed',
        },
      },
      400
    );
  }
});

async function resegmentStoredMaterial(db: AnyDB, material: Material): Promise<Material> {
  const updated = await updateMaterialContent(db, material.id, {
    title: material.title ?? null,
    filename: material.filename ?? null,
    mime_type: material.mime_type ?? null,
    content_text: material.content_text,
    content_hash: material.content_hash,
    metadata: {
      ...material.metadata,
      reparsed_at: new Date().toISOString(),
      reparse_mode: 'stored_text_segments',
    },
    token_estimate: estimateTokens(material.content_text),
  });

  return updated ?? material;
}

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
    archived_at: material.archived_at ?? null,
    created_by: material.created_by ?? null,
  };
}

function toMaterialDetailResponse(material: Material) {
  const segments = segmentMaterialText(material);
  const pageCount = numberMetadata(material.metadata.page_count);

  return {
    ...toMaterialResponse(material),
    content_text: material.content_text,
    page_count: pageCount,
    segment_count: segments.length,
    segments,
    parse_quality: parseQuality(material),
  };
}

function segmentMaterialText(material: Material) {
  const text = material.content_text.trim();
  if (!text) return [];

  const blocks = text
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const sourceBlocks = blocks.length > 0 ? blocks : [text];
  const grouped: Array<{ text: string; char_start: number; char_end: number }> = [];
  let currentText = '';
  let currentStart = -1;
  let currentEnd = -1;
  let cursor = 0;

  for (const block of sourceBlocks) {
    const blockStart = Math.max(0, material.content_text.indexOf(block, cursor));
    const blockEnd = blockStart + block.length;
    cursor = blockEnd;

    if (!currentText) {
      currentText = block;
      currentStart = blockStart;
      currentEnd = blockEnd;
      continue;
    }

    if (currentText.length + block.length + 2 > SEGMENT_MAX_CHARS) {
      grouped.push({ text: currentText, char_start: currentStart, char_end: currentEnd });
      currentText = block;
      currentStart = blockStart;
      currentEnd = blockEnd;
      continue;
    }

    currentText = `${currentText}\n\n${block}`;
    currentEnd = blockEnd;
  }

  if (currentText) {
    grouped.push({ text: currentText, char_start: currentStart, char_end: currentEnd });
  }

  return grouped.map((segment, index) => ({
    id: `${material.id}:seg_${String(index + 1).padStart(3, '0')}`,
    index: index + 1,
    label: `Section ${index + 1}`,
    text: segment.text,
    char_start: segment.char_start,
    char_end: segment.char_end,
    token_estimate: estimateTokens(segment.text),
  }));
}

function parseQuality(material: Material) {
  if (!material.content_text.trim()) {
    return {
      status: 'empty' as const,
      score: 0,
      message: 'No parsed text was extracted from this material.',
    };
  }

  const quality = material.metadata.extraction_quality;
  if (quality === 'poor') {
    return {
      status: 'poor' as const,
      score: 0.25,
      message: 'Parsed text is sparse. Inspect the source before relying on it.',
    };
  }
  if (quality === 'partial') {
    return {
      status: 'partial' as const,
      score: 0.55,
      message: 'Parsed text is partial. Original layout is not shown here.',
    };
  }

  return {
    status: 'ready' as const,
    score: 0.84,
    message: 'Parsed text is available. Original layout is not preserved in this MVP.',
  };
}

function numberMetadata(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringMetadata(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function assertMaterialTextWithinLimits(text: string): void {
  const parsedTextLength = text.trim().length;
  if (parsedTextLength === 0) {
    throw new Error('No readable text was extracted from this material.');
  }
  if (parsedTextLength > MAX_MATERIAL_TEXT_CHARS) {
    throw new Error(
      'Parsed text is too long for chat context. This material produced more than 20,000 characters.'
    );
  }
}

function excerpt(text: string): string {
  if (text.length <= EXCERPT_CHARS) return text;
  return `${text.slice(0, EXCERPT_CHARS)}...`;
}
