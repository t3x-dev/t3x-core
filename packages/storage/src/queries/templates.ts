/**
 * Templates Queries
 *
 * CRUD operations for reusable prompt templates.
 */
import { and, desc, eq, ilike, inArray, lt, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { type Template, templates } from '../schema';
import { type CursorPage, decodeCursor, toCursorPage } from './pagination';

// ============================================================
// Types
// ============================================================

export interface CreateTemplateInput {
  template_id: string;
  title: string;
  description: string;
  category: string;
  leaf_type: string;
  system_prompt: string;
  user_prompt: string;
  variables: Array<{
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
  }>;
  tags?: string[];
  is_builtin?: boolean;
  default_constraints?: Array<{
    type: 'require' | 'exclude';
    match_mode: 'exact' | 'semantic';
    value: string;
  }>;
  semantic_threshold?: { require: number; exclude: number };
}

export interface ListTemplatesOptions {
  category?: string;
  leaf_type?: string;
  leaf_types?: readonly string[];
  search?: string;
  limit?: number;
  offset?: number;
  /** Opaque cursor for keyset pagination. Empty string = first page in cursor mode. */
  cursor?: string;
}

// ============================================================
// CRUD
// ============================================================

/**
 * Insert a new template.
 */
export async function createTemplate(db: AnyDB, input: CreateTemplateInput) {
  const now = new Date();
  const [row] = await db
    .insert(templates)
    .values({
      templateId: input.template_id,
      title: input.title,
      description: input.description,
      category: input.category,
      leafType: input.leaf_type,
      systemPrompt: input.system_prompt,
      userPrompt: input.user_prompt,
      variables: input.variables,
      tags: input.tags ?? [],
      isBuiltin: input.is_builtin ?? false,
      defaultConstraints: input.default_constraints ?? [],
      semanticThreshold: input.semantic_threshold ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

/**
 * Find a template by ID.
 */
export async function findTemplateById(db: AnyDB, templateId: string) {
  const [row] = await db
    .select()
    .from(templates)
    .where(eq(templates.templateId, templateId))
    .limit(1);
  return row ?? null;
}

/**
 * List templates with optional filtering.
 */
export async function listTemplates(
  db: AnyDB,
  opts: ListTemplatesOptions & { cursor: string }
): Promise<CursorPage<Template>>;
export async function listTemplates(
  db: AnyDB,
  opts?: Omit<ListTemplatesOptions, 'cursor'>
): Promise<Template[]>;
export async function listTemplates(
  db: AnyDB,
  opts: ListTemplatesOptions = {}
): Promise<Template[] | CursorPage<Template>> {
  const limit = opts.limit ?? 100;

  const conditions = [];

  if (opts.category) {
    conditions.push(eq(templates.category, opts.category));
  }
  if (opts.leaf_type) {
    conditions.push(eq(templates.leafType, opts.leaf_type));
  }
  if (opts.leaf_types && opts.leaf_types.length > 0) {
    conditions.push(inArray(templates.leafType, [...opts.leaf_types]));
  }
  if (opts.search) {
    const escaped = opts.search.replace(/[%_\\]/g, '\\$&');
    const pattern = `%${escaped}%`;
    conditions.push(or(ilike(templates.title, pattern), ilike(templates.description, pattern)));
  }

  if (opts.cursor !== undefined) {
    // Cursor pagination mode
    if (opts.cursor !== '') {
      const { t, k } = decodeCursor(opts.cursor);
      const cursorDate = new Date(t);
      // Keyset: (created_at < t) OR (created_at = t AND template_id < k)
      conditions.push(
        or(
          lt(templates.createdAt, cursorDate),
          and(eq(templates.createdAt, cursorDate), lt(templates.templateId, k))
        )!
      );
    }

    const rows = await db
      .select()
      .from(templates)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(templates.createdAt), desc(templates.templateId))
      .limit(limit + 1);

    return toCursorPage(rows, limit, (t) => ({
      t: t.createdAt.toISOString(),
      k: t.templateId,
    }));
  }

  // Legacy offset/limit mode
  const offset = opts.offset ?? 0;
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(templates)
    .where(where)
    .orderBy(desc(templates.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Delete a template by ID. Returns true if a row was deleted.
 */
export async function deleteTemplate(db: AnyDB, templateId: string): Promise<boolean> {
  const result = await db.delete(templates).where(eq(templates.templateId, templateId)).returning();
  return result.length > 0;
}
