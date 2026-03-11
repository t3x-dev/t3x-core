/**
 * Templates Routes with OpenAPI
 *
 * Endpoints:
 * - GET    /v1/templates            - List templates (with filtering)
 * - GET    /v1/templates/:id        - Get a template
 * - POST   /v1/templates            - Create a custom template
 * - DELETE /v1/templates/:id        - Delete a template (builtin → 403)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  createTemplate,
  deleteTemplate,
  findTemplateById,
  listTemplates,
} from '@t3x-dev/storage/pglite';
import { nanoid } from 'nanoid';
import { getDB } from '../lib/db';
import { errorResponse, zodErrorHook } from '../lib/errors';
import {
  CursorPageResponseSchema,
  ErrorResponseSchema,
  SuccessResponseSchema,
} from '../schemas/common';

// ============================================================
// Schemas
// ============================================================

const TemplateVariableSchema = z.object({
  name: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Variable name must match [a-zA-Z_][a-zA-Z0-9_]*'),
  description: z.string(),
  required: z.boolean(),
  defaultValue: z.string().optional(),
});

const DefaultConstraintSchema = z.object({
  type: z.enum(['require', 'exclude']),
  match_mode: z.enum(['exact', 'semantic']),
  value: z.string(),
});

const SemanticThresholdSchema = z.object({
  require: z.number().min(0).max(1),
  exclude: z.number().min(0).max(1),
});

const TemplateSchema = z.object({
  template_id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  leaf_type: z.string(),
  system_prompt: z.string(),
  user_prompt: z.string(),
  variables: z.array(TemplateVariableSchema),
  tags: z.array(z.string()),
  is_builtin: z.boolean(),
  default_constraints: z.array(DefaultConstraintSchema),
  semantic_threshold: SemanticThresholdSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const CreateTemplateRequest = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  category: z.enum(['social', 'business', 'technical', 'creative']),
  leaf_type: z.enum(['tweet', 'article', 'email', 'weibo', 'wechat', 'slack']),
  system_prompt: z.string().min(1).max(50000),
  user_prompt: z.string().min(1).max(50000),
  variables: z.array(TemplateVariableSchema).default([]),
  tags: z.array(z.string()).default([]),
  default_constraints: z.array(DefaultConstraintSchema).default([]),
  semantic_threshold: SemanticThresholdSchema.optional(),
});

const TemplateIdParam = z.object({
  id: z.string().min(1),
});

const ListTemplatesQuery = z.object({
  category: z.enum(['social', 'business', 'technical', 'creative']).optional(),
  leaf_type: z.enum(['tweet', 'article', 'email', 'weibo', 'wechat', 'slack']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
  cursor: z.string().optional(),
});

export const templatesRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

// ============================================================
// Helper: format DB row → API response
// ============================================================

function formatTemplate(row: {
  templateId: string;
  title: string;
  description: string;
  category: string;
  leafType: string;
  systemPrompt: string;
  userPrompt: string;
  variables: Array<{ name: string; description: string; required: boolean; defaultValue?: string }>;
  tags: string[];
  isBuiltin: boolean;
  defaultConstraints: Array<{
    type: 'require' | 'exclude';
    match_mode: 'exact' | 'semantic';
    value: string;
  }> | null;
  semanticThreshold: { require: number; exclude: number } | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    template_id: row.templateId,
    title: row.title,
    description: row.description,
    category: row.category,
    leaf_type: row.leafType,
    system_prompt: row.systemPrompt,
    user_prompt: row.userPrompt,
    variables: row.variables,
    tags: row.tags,
    is_builtin: row.isBuiltin,
    default_constraints: row.defaultConstraints ?? [],
    semantic_threshold: row.semanticThreshold ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// ============================================================
// GET /v1/templates — List templates
// ============================================================

const listTemplatesRoute = createRoute({
  method: 'get',
  path: '/v1/templates',
  tags: ['Templates'],
  summary: 'List templates with optional filtering',
  description:
    'Lists templates with optional filtering. ' +
    'Supports cursor-based pagination via optional `cursor` query parameter.',
  request: {
    query: ListTemplatesQuery,
  },
  responses: {
    200: {
      description: 'List of templates',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(
            z.union([CursorPageResponseSchema(TemplateSchema), z.array(TemplateSchema)])
          ),
        },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

templatesRoutes.openapi(listTemplatesRoute, async (c) => {
  const { category, leaf_type, search, limit, offset, cursor } = c.req.valid('query');

  try {
    const db = await getDB();

    // Cursor-based pagination mode
    if (cursor !== undefined) {
      const result = await listTemplates(db, { category, leaf_type, search, cursor, limit });
      return c.json({
        success: true as const,
        data: {
          items: result.items.map(formatTemplate),
          next_cursor: result.next_cursor,
          has_more: result.has_more,
        },
      });
    }

    // Legacy offset/limit mode
    const rows = await listTemplates(db, { category, leaf_type, search, limit, offset });
    return c.json({
      success: true as const,
      data: rows.map(formatTemplate),
    });
  } catch (err) {
    return errorResponse(
      c,
      'LIST_FAILED',
      err instanceof Error ? err.message : 'Failed to list templates'
    );
  }
});

// ============================================================
// GET /v1/templates/:id — Get a template
// ============================================================

const getTemplateRoute = createRoute({
  method: 'get',
  path: '/v1/templates/{id}',
  tags: ['Templates'],
  summary: 'Get a template by ID',
  request: {
    params: TemplateIdParam,
  },
  responses: {
    200: {
      description: 'Template found',
      content: {
        'application/json': { schema: SuccessResponseSchema(TemplateSchema) },
      },
    },
    404: {
      description: 'Template not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

templatesRoutes.openapi(getTemplateRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();
    const row = await findTemplateById(db, id);
    if (!row) {
      return errorResponse(c, 'NOT_FOUND', `Template not found: ${id}`);
    }
    return c.json({ success: true as const, data: formatTemplate(row) });
  } catch (err) {
    return errorResponse(
      c,
      'GET_FAILED',
      err instanceof Error ? err.message : 'Failed to get template'
    );
  }
});

// ============================================================
// POST /v1/templates — Create a custom template
// ============================================================

const createTemplateRoute = createRoute({
  method: 'post',
  path: '/v1/templates',
  tags: ['Templates'],
  summary: 'Create a custom template',
  request: {
    body: {
      content: {
        'application/json': { schema: CreateTemplateRequest },
      },
    },
  },
  responses: {
    201: {
      description: 'Template created',
      content: {
        'application/json': { schema: SuccessResponseSchema(TemplateSchema) },
      },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

templatesRoutes.openapi(createTemplateRoute, async (c) => {
  const body = c.req.valid('json');

  // Validate template block syntax (unclosed/unmatched conditional blocks)
  const blockErrors: string[] = [];
  for (const [label, text] of [
    ['system_prompt', body.system_prompt],
    ['user_prompt', body.user_prompt],
  ] as const) {
    const opens = (text.match(/\{\{#([a-zA-Z_]\w*)\}\}/g) || []).map((b) => b.slice(3, -2));
    const closes = (text.match(/\{\{\/([a-zA-Z_]\w*)\}\}/g) || []).map((b) => b.slice(3, -2));
    for (const name of opens) {
      if (!closes.includes(name)) blockErrors.push(`${label}: Unclosed block {{#${name}}}`);
    }
    for (const name of closes) {
      if (!opens.includes(name)) blockErrors.push(`${label}: Unmatched close {{/${name}}}`);
    }
  }
  if (blockErrors.length > 0) {
    return errorResponse(c, 'VALIDATION_FAILED', blockErrors.join('; '));
  }

  // Validate variables: all variables referenced in prompts should be declared
  const allPromptText = body.system_prompt + body.user_prompt;
  const referencedVars = new Set<string>();
  const varRegex = /\{\{#?([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(allPromptText)) !== null) {
    referencedVars.add(match[1]);
  }
  const declaredVarNames = new Set(body.variables.map((v) => v.name));
  const undeclared = [...referencedVars].filter((v) => !declaredVarNames.has(v));
  if (undeclared.length > 0) {
    return errorResponse(
      c,
      'VALIDATION_FAILED',
      `Variables referenced in prompts but not declared: ${undeclared.join(', ')}`
    );
  }

  try {
    const db = await getDB();
    const templateId = `tmpl_${nanoid(12)}`;

    const row = await createTemplate(db, {
      template_id: templateId,
      title: body.title,
      description: body.description,
      category: body.category,
      leaf_type: body.leaf_type,
      system_prompt: body.system_prompt,
      user_prompt: body.user_prompt,
      variables: body.variables,
      tags: body.tags,
      default_constraints: body.default_constraints,
      semantic_threshold: body.semantic_threshold,
    });

    return c.json({ success: true as const, data: formatTemplate(row) }, 201);
  } catch (err) {
    return errorResponse(
      c,
      'CREATE_FAILED',
      err instanceof Error ? err.message : 'Failed to create template'
    );
  }
});

// ============================================================
// DELETE /v1/templates/:id — Delete a template
// ============================================================

const deleteTemplateRoute = createRoute({
  method: 'delete',
  path: '/v1/templates/{id}',
  tags: ['Templates'],
  summary: 'Delete a template (builtin templates cannot be deleted)',
  request: {
    params: TemplateIdParam,
  },
  responses: {
    200: {
      description: 'Template deleted',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(z.object({ deleted: z.literal(true) })),
        },
      },
    },
    403: {
      description: 'Cannot delete builtin template',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Template not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

templatesRoutes.openapi(deleteTemplateRoute, async (c) => {
  const { id } = c.req.valid('param');

  try {
    const db = await getDB();

    // Check if template exists and is not builtin
    const existing = await findTemplateById(db, id);
    if (!existing) {
      return errorResponse(c, 'NOT_FOUND', `Template not found: ${id}`);
    }
    if (existing.isBuiltin) {
      return errorResponse(c, 'FORBIDDEN', 'Cannot delete builtin templates');
    }

    await deleteTemplate(db, id);
    return c.json({ success: true as const, data: { deleted: true as const } });
  } catch (err) {
    return errorResponse(
      c,
      'DELETE_FAILED',
      err instanceof Error ? err.message : 'Failed to delete template'
    );
  }
});
