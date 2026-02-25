/**
 * Templates Queries
 *
 * CRUD operations for reusable prompt templates.
 */
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import type { AnyDB } from '../adapters';
import { templates } from '../schema';

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
}

export interface ListTemplatesOptions {
  category?: string;
  leaf_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
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
export async function listTemplates(db: AnyDB, opts: ListTemplatesOptions = {}) {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  const conditions = [];

  if (opts.category) {
    conditions.push(eq(templates.category, opts.category));
  }
  if (opts.leaf_type) {
    conditions.push(eq(templates.leafType, opts.leaf_type));
  }
  if (opts.search) {
    const pattern = `%${opts.search}%`;
    conditions.push(or(ilike(templates.title, pattern), ilike(templates.description, pattern)));
  }

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
