/**
 * Import Routes (OpenAPI)
 *
 * Import content from URLs, documents, and platform exports.
 *
 * POST /v1/import/cfpack           - Import a cfpack JSON archive
 * POST /v1/import/url/preview      - Preview URL content
 * POST /v1/import/url              - Import from URL
 * POST /v1/import/document/preview - Preview document content
 * POST /v1/import/document         - Import document
 * POST /v1/import/platform/preview - Preview platform export
 * POST /v1/import/platform         - Import from platform export
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { restoreFromCfpack } from '@t3x/storage/backup';
import { getDB } from '../lib/db';
import { zodErrorHook } from '../lib/errors';
import {
  checkDuplicate,
  computeContentHash,
  createTurnsFromMessages,
  createTurnsFromParagraphs,
  parseDocument,
  parsePlatformExport,
  parsePlatformExportFromBuffer,
  parseUrl,
} from '../lib/import';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

// Platform display labels for title prefix (RFC §6.C)
const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  slack: 'Slack',
  discord: 'Discord',
  feishu: '飞书',
};

function prefixPlatformTitle(platform: string, title: string): string {
  const label = PLATFORM_LABELS[platform] ?? platform;
  return `[${label}] ${title}`;
}

// SSE helper
function encodeSseEvent(payload: string): Uint8Array {
  return new TextEncoder().encode(`data: ${payload}\n\n`);
}

function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export const importRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Shared Schemas
// ============================================================

const ParagraphSchema = z.object({
  text: z.string(),
  type: z.enum(['heading', 'paragraph', 'list_item', 'code', 'table', 'blockquote']),
  level: z.number().optional(),
  index: z.number(),
});

const TurnProvenanceSchema = z.object({
  turn_hash: z.string(),
  paragraph_index: z.number(),
  element_type: z.enum(['heading', 'paragraph', 'list_item', 'code', 'table', 'blockquote', 'message']),
  page: z.number().optional(),
});

const ImportMetadataSchema = z.object({
  source_type: z.enum(['url', 'document', 'platform']),
  source_url: z.string().optional(),
  source_filename: z.string().optional(),
  platform: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  published_at: z.string().optional(),
  content_hash: z.string(),
  content_length: z.number(),
  content_truncated: z.boolean().optional(),
  extraction_quality: z.enum(['good', 'partial', 'poor']).optional(),
  page_count: z.number().optional(),
  imported_at: z.string(),
  turn_map: z.array(TurnProvenanceSchema).optional(),
});

const PreviewResponseSchema = z.object({
  paragraphs: z.array(ParagraphSchema),
  metadata: ImportMetadataSchema,
  estimated_turns: z.number(),
  duplicate_warning: z.string().optional(),
});

const ImportResultSchema = z.object({
  project_id: z.string(),
  conversation_id: z.string(),
  turns_imported: z.number(),
  metadata: ImportMetadataSchema,
  duplicate_warning: z.string().optional(),
});

// ============================================================
// POST /v1/import/cfpack — Import a cfpack archive (existing)
// ============================================================

const CfpackResultSchema = z.object({
  project_id: z.string(),
  conversations_imported: z.number(),
  turns_imported: z.number(),
});

const importCfpackRoute = createRoute({
  method: 'post',
  path: '/v1/import/cfpack',
  tags: ['Import'],
  summary: 'Import a cfpack archive',
  description: 'Import a cfpack JSON archive to create a new project with all its data.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            version: z.string(),
            project: z.object({
              project_id: z.string(),
              name: z.string(),
              created_at: z.string(),
            }),
            conversations: z.array(
              z.object({
                conversation_id: z.string(),
                project_id: z.string(),
                title: z.string().nullable(),
                created_at: z.string(),
              })
            ),
            turns: z.array(
              z.object({
                turn_hash: z.string(),
                parent_turn_hash: z.string().nullable(),
                conversation_id: z.string(),
                role: z.string(),
                content: z.string(),
                rings_json: z.string().nullable(),
                created_at: z.string(),
              })
            ),
            commits_v3: z.array(z.record(z.unknown())).optional().default([]),
            commits_v4: z.array(z.record(z.unknown())).optional().default([]),
            leaves: z.array(z.record(z.unknown())).optional().default([]),
            pins: z.array(z.record(z.unknown())).optional().default([]),
            meta: z.object({
              exported_at: z.string(),
              exported_by: z.string(),
              format_version: z.string(),
            }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Import successful',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(CfpackResultSchema),
        },
      },
    },
    400: {
      description: 'Invalid cfpack data',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

importRoutes.openapi(importCfpackRoute, async (c) => {
  const cfpack = c.req.valid('json');
  const db = await getDB();

  try {
    const result = await restoreFromCfpack(db, cfpack);
    return c.json({ success: true as const, data: result }, 200);
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'IMPORT_FAILED',
          message: err instanceof Error ? err.message : 'Import failed',
        },
      },
      400
    );
  }
});

// ============================================================
// POST /v1/import/url/preview — Preview URL content
// ============================================================

const urlPreviewRoute = createRoute({
  method: 'post',
  path: '/v1/import/url/preview',
  tags: ['Import'],
  summary: 'Preview URL content before import',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            url: z.string().url(),
            project_id: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'URL preview',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PreviewResponseSchema),
        },
      },
    },
    400: {
      description: 'Invalid URL or fetch error',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

importRoutes.openapi(urlPreviewRoute, async (c) => {
  const { url, project_id } = c.req.valid('json');

  try {
    const result = await parseUrl(url);

    let duplicateWarning: string | undefined;
    if (project_id) {
      const db = await getDB();
      duplicateWarning = await checkDuplicate(db, project_id, result.metadata.content_hash, url);
    }

    return c.json({
      success: true as const,
      data: {
        paragraphs: result.paragraphs,
        metadata: result.metadata,
        estimated_turns: result.paragraphs.filter((p) => p.text.trim()).length,
        ...(duplicateWarning && { duplicate_warning: duplicateWarning }),
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'URL_PARSE_FAILED',
          message: err instanceof Error ? err.message : 'Failed to parse URL',
        },
      },
      400
    );
  }
});

// ============================================================
// POST /v1/import/url — Import from URL
// ============================================================

const urlImportRoute = createRoute({
  method: 'post',
  path: '/v1/import/url',
  tags: ['Import'],
  summary: 'Import content from a URL',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            url: z.string().url(),
            project_id: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Import successful',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ImportResultSchema),
        },
      },
    },
    400: {
      description: 'Import failed',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

importRoutes.openapi(urlImportRoute, async (c) => {
  const { url, project_id } = c.req.valid('json');

  try {
    const db = await getDB();
    const result = await parseUrl(url);

    const duplicateWarning = await checkDuplicate(
      db,
      project_id,
      result.metadata.content_hash,
      url
    );

    const { conversationId, turnsCreated } = await createTurnsFromParagraphs(
      db,
      project_id,
      result.paragraphs,
      result.metadata
    );

    return c.json({
      success: true as const,
      data: {
        project_id,
        conversation_id: conversationId,
        turns_imported: turnsCreated,
        metadata: result.metadata,
        ...(duplicateWarning && { duplicate_warning: duplicateWarning }),
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'IMPORT_FAILED',
          message: err instanceof Error ? err.message : 'Import failed',
        },
      },
      400
    );
  }
});

// ============================================================
// POST /v1/import/document/preview — Preview document content
// ============================================================

const documentPreviewRoute = createRoute({
  method: 'post',
  path: '/v1/import/document/preview',
  tags: ['Import'],
  summary: 'Preview document content before import',
  description: 'Upload a PDF, DOCX, Markdown, or text file for preview.',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.any(),
            project_id: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Document preview',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(PreviewResponseSchema),
        },
      },
    },
    400: {
      description: 'Parse error',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

importRoutes.openapi(documentPreviewRoute, async (c) => {
  try {
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
    const result = await parseDocument(buffer, file.name, file.type);

    let duplicateWarning: string | undefined;
    const projectId = body.project_id as string | undefined;
    if (projectId) {
      const db = await getDB();
      duplicateWarning = await checkDuplicate(db, projectId, result.metadata.content_hash);
    }

    return c.json({
      success: true as const,
      data: {
        paragraphs: result.paragraphs,
        metadata: result.metadata,
        estimated_turns: result.paragraphs.filter((p) => p.text.trim()).length,
        ...(duplicateWarning && { duplicate_warning: duplicateWarning }),
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'DOCUMENT_PARSE_FAILED',
          message: err instanceof Error ? err.message : 'Failed to parse document',
        },
      },
      400
    );
  }
});

// ============================================================
// POST /v1/import/document — Import document
// ============================================================

const documentImportRoute = createRoute({
  method: 'post',
  path: '/v1/import/document',
  tags: ['Import'],
  summary: 'Import a document file',
  description: 'Upload and import a PDF, DOCX, Markdown, or text file.',
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            file: z.any(),
            project_id: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Import successful',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(ImportResultSchema),
        },
      },
    },
    400: {
      description: 'Import failed',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

importRoutes.openapi(documentImportRoute, async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    const projectId = body.project_id as string;

    if (!file || !(file instanceof File)) {
      return c.json(
        {
          success: false as const,
          error: { code: 'NO_FILE', message: 'No file uploaded' },
        },
        400
      );
    }

    if (!projectId) {
      return c.json(
        {
          success: false as const,
          error: { code: 'MISSING_PROJECT_ID', message: 'project_id is required' },
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
    const result = await parseDocument(buffer, file.name, file.type);

    const duplicateWarning = await checkDuplicate(db, projectId, result.metadata.content_hash);

    const { conversationId, turnsCreated } = await createTurnsFromParagraphs(
      db,
      projectId,
      result.paragraphs,
      result.metadata
    );

    return c.json({
      success: true as const,
      data: {
        project_id: projectId,
        conversation_id: conversationId,
        turns_imported: turnsCreated,
        metadata: result.metadata,
        ...(duplicateWarning && { duplicate_warning: duplicateWarning }),
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'IMPORT_FAILED',
          message: err instanceof Error ? err.message : 'Import failed',
        },
      },
      400
    );
  }
});

// ============================================================
// POST /v1/import/platform/preview — Preview platform export
// ============================================================

const platformPreviewRoute = createRoute({
  method: 'post',
  path: '/v1/import/platform/preview',
  tags: ['Import'],
  summary: 'Preview platform conversation export',
  description:
    'Parse ChatGPT, Claude.ai, Gemini, Discord, or Feishu export files (JSON). Also supports Slack workspace export (ZIP).',
  request: {
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
      description: 'Platform preview',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              platform: z.string(),
              conversations: z.array(
                z.object({
                  id: z.string(),
                  title: z.string(),
                  message_count: z.number(),
                  created_at: z.string().optional(),
                })
              ),
            })
          ),
        },
      },
    },
    400: {
      description: 'Parse error',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

importRoutes.openapi(platformPreviewRoute, async (c) => {
  try {
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

    // Detect ZIP vs JSON by file extension or content
    const isZip =
      file.name?.endsWith('.zip') ||
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed';

    let result;
    if (isZip) {
      const buffer = new Uint8Array(await file.arrayBuffer());
      result = parsePlatformExportFromBuffer(buffer);
    } else {
      const jsonString = await file.text();
      result = parsePlatformExport(jsonString);
    }

    return c.json({
      success: true as const,
      data: {
        platform: result.platform,
        conversations: result.conversations.map((conv) => ({
          id: conv.id,
          title: conv.title,
          message_count: conv.messages.length,
          created_at: conv.created_at,
        })),
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'PLATFORM_PARSE_FAILED',
          message: err instanceof Error ? err.message : 'Failed to parse platform export',
        },
      },
      400
    );
  }
});

// ============================================================
// POST /v1/import/platform — Import platform conversations
// ============================================================

const platformImportRoute = createRoute({
  method: 'post',
  path: '/v1/import/platform',
  tags: ['Import'],
  summary: 'Import conversations from platform export',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            project_id: z.string(),
            platform_data: z.string(), // JSON string of platform export
            conversation_ids: z.array(z.string()).optional(), // Select specific conversations
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Import successful',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.object({
              project_id: z.string(),
              imported: z.array(
                z.object({
                  source_id: z.string(),
                  conversation_id: z.string(),
                  turns_imported: z.number(),
                  title: z.string(),
                })
              ),
              total_conversations: z.number(),
              total_turns: z.number(),
            })
          ),
        },
      },
    },
    400: {
      description: 'Import failed',
      content: {
        'application/json': { schema: ErrorResponseSchema },
      },
    },
  },
});

importRoutes.openapi(platformImportRoute, async (c) => {
  const { project_id, platform_data, conversation_ids } = c.req.valid('json');

  try {
    const db = await getDB();
    const parsed = parsePlatformExport(platform_data);

    // Filter to selected conversations if specified
    const toImport = conversation_ids
      ? parsed.conversations.filter((conv) => conversation_ids.includes(conv.id))
      : parsed.conversations;

    const imported: Array<{
      source_id: string;
      conversation_id: string;
      turns_imported: number;
      title: string;
    }> = [];

    let totalTurns = 0;

    for (const conv of toImport) {
      const contentHash = computeContentHash(conv.messages.map((m) => m.content).join('\n'));
      const prefixedTitle = prefixPlatformTitle(parsed.platform, conv.title);

      const metadata = {
        source_type: 'platform' as const,
        platform: parsed.platform,
        title: prefixedTitle,
        content_hash: contentHash,
        content_length: conv.messages.reduce((acc, m) => acc + m.content.length, 0),
        imported_at: new Date().toISOString(),
      };

      const { conversationId, turnsCreated } = await createTurnsFromMessages(
        db,
        project_id,
        conv.messages,
        prefixedTitle,
        metadata
      );

      imported.push({
        source_id: conv.id,
        conversation_id: conversationId,
        turns_imported: turnsCreated,
        title: prefixedTitle,
      });

      totalTurns += turnsCreated;
    }

    return c.json({
      success: true as const,
      data: {
        project_id,
        imported,
        total_conversations: imported.length,
        total_turns: totalTurns,
      },
    });
  } catch (err) {
    return c.json(
      {
        success: false as const,
        error: {
          code: 'IMPORT_FAILED',
          message: err instanceof Error ? err.message : 'Import failed',
        },
      },
      400
    );
  }
});

// ============================================================
// SSE Streaming Import Endpoints (for large imports ≥ 50 turns)
// ============================================================
// These endpoints are plain Hono routes (not OpenAPI) because
// SSE responses don't map cleanly to OpenAPI JSON schemas.

/**
 * POST /v1/import/url/stream — Stream URL import with progress
 */
importRoutes.post('/v1/import/url/stream', async (c) => {
  const body = await c.req.json<{ url: string; project_id: string }>();
  const { url, project_id } = body;

  if (!url || !project_id) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'url and project_id required' },
      },
      400
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const db = await getDB();

        controller.enqueue(
          encodeSseEvent(JSON.stringify({ type: 'status', message: 'Fetching URL...' }))
        );

        const result = await parseUrl(url);

        controller.enqueue(
          encodeSseEvent(JSON.stringify({ type: 'status', message: 'Creating conversation...' }))
        );

        const duplicateWarning = await checkDuplicate(
          db,
          project_id,
          result.metadata.content_hash,
          url
        );

        const { conversationId, turnsCreated } = await createTurnsFromParagraphs(
          db,
          project_id,
          result.paragraphs,
          result.metadata,
          (current, total) => {
            controller.enqueue(
              encodeSseEvent(JSON.stringify({ type: 'progress', current, total }))
            );
          }
        );

        controller.enqueue(
          encodeSseEvent(
            JSON.stringify({
              type: 'complete',
              project_id,
              conversation_id: conversationId,
              turns_imported: turnsCreated,
              metadata: result.metadata,
              ...(duplicateWarning && { duplicate_warning: duplicateWarning }),
            })
          )
        );
      } catch (err) {
        try {
          controller.enqueue(
            encodeSseEvent(
              JSON.stringify({
                type: 'error',
                message: err instanceof Error ? err.message : 'Import failed',
              })
            )
          );
        } catch {
          // Stream already closed/cancelled by client
        }
      } finally {
        try {
          controller.enqueue(encodeSseEvent('[DONE]'));
          controller.close();
        } catch {
          // Stream already closed/cancelled
        }
      }
    },
  });

  return sseResponse(stream);
});

/**
 * POST /v1/import/document/stream — Stream document import with progress
 */
importRoutes.post('/v1/import/document/stream', async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  const projectId = body.project_id as string;

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } }, 400);
  }
  if (!projectId) {
    return c.json(
      { success: false, error: { code: 'MISSING_PROJECT_ID', message: 'project_id is required' } },
      400
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return c.json(
      {
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `File too large (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
        },
      },
      400
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;
  const fileType = file.type;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const db = await getDB();

        controller.enqueue(
          encodeSseEvent(JSON.stringify({ type: 'status', message: 'Parsing document...' }))
        );

        const result = await parseDocument(buffer, fileName, fileType);

        controller.enqueue(
          encodeSseEvent(JSON.stringify({ type: 'status', message: 'Creating conversation...' }))
        );

        const duplicateWarning = await checkDuplicate(db, projectId, result.metadata.content_hash);

        const { conversationId, turnsCreated } = await createTurnsFromParagraphs(
          db,
          projectId,
          result.paragraphs,
          result.metadata,
          (current, total) => {
            controller.enqueue(
              encodeSseEvent(JSON.stringify({ type: 'progress', current, total }))
            );
          }
        );

        controller.enqueue(
          encodeSseEvent(
            JSON.stringify({
              type: 'complete',
              project_id: projectId,
              conversation_id: conversationId,
              turns_imported: turnsCreated,
              metadata: result.metadata,
              ...(duplicateWarning && { duplicate_warning: duplicateWarning }),
            })
          )
        );
      } catch (err) {
        try {
          controller.enqueue(
            encodeSseEvent(
              JSON.stringify({
                type: 'error',
                message: err instanceof Error ? err.message : 'Import failed',
              })
            )
          );
        } catch {
          // Stream already closed/cancelled by client
        }
      } finally {
        try {
          controller.enqueue(encodeSseEvent('[DONE]'));
          controller.close();
        } catch {
          // Stream already closed/cancelled
        }
      }
    },
  });

  return sseResponse(stream);
});

/**
 * POST /v1/import/platform/stream — Stream platform import with progress
 */
importRoutes.post('/v1/import/platform/stream', async (c) => {
  const body = await c.req.json<{
    project_id: string;
    platform_data: string;
    conversation_ids?: string[];
  }>();
  const { project_id, platform_data, conversation_ids } = body;

  if (!project_id || !platform_data) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'project_id and platform_data required' },
      },
      400
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const db = await getDB();

        controller.enqueue(
          encodeSseEvent(JSON.stringify({ type: 'status', message: 'Parsing export...' }))
        );

        const parsed = parsePlatformExport(platform_data);

        const toImport = conversation_ids
          ? parsed.conversations.filter((conv) => conversation_ids.includes(conv.id))
          : parsed.conversations;

        const imported: Array<{
          source_id: string;
          conversation_id: string;
          turns_imported: number;
          title: string;
        }> = [];

        let totalTurns = 0;
        const totalConversations = toImport.length;

        for (let i = 0; i < toImport.length; i++) {
          const conv = toImport[i];

          const prefixedTitle = prefixPlatformTitle(parsed.platform, conv.title);

          controller.enqueue(
            encodeSseEvent(
              JSON.stringify({
                type: 'progress',
                current: i + 1,
                total: totalConversations,
                message: `Importing "${prefixedTitle}"...`,
              })
            )
          );

          const contentHash = computeContentHash(conv.messages.map((m) => m.content).join('\n'));

          const metadata = {
            source_type: 'platform' as const,
            platform: parsed.platform,
            title: prefixedTitle,
            content_hash: contentHash,
            content_length: conv.messages.reduce((acc, m) => acc + m.content.length, 0),
            imported_at: new Date().toISOString(),
          };

          const { conversationId, turnsCreated } = await createTurnsFromMessages(
            db,
            project_id,
            conv.messages,
            prefixedTitle,
            metadata
          );

          imported.push({
            source_id: conv.id,
            conversation_id: conversationId,
            turns_imported: turnsCreated,
            title: prefixedTitle,
          });

          totalTurns += turnsCreated;
        }

        controller.enqueue(
          encodeSseEvent(
            JSON.stringify({
              type: 'complete',
              project_id,
              imported,
              total_conversations: imported.length,
              total_turns: totalTurns,
            })
          )
        );
      } catch (err) {
        try {
          controller.enqueue(
            encodeSseEvent(
              JSON.stringify({
                type: 'error',
                message: err instanceof Error ? err.message : 'Import failed',
              })
            )
          );
        } catch {
          // Stream already closed/cancelled by client
        }
      } finally {
        try {
          controller.enqueue(encodeSseEvent('[DONE]'));
          controller.close();
        } catch {
          // Stream already closed/cancelled
        }
      }
    },
  });

  return sseResponse(stream);
});
