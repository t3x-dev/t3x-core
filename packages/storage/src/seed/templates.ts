/**
 * Seed Builtin Templates
 *
 * Imports DEFAULT_TEMPLATES from @t3x/core and seeds them into the database.
 * Idempotent: uses INSERT ... ON CONFLICT DO NOTHING.
 */

import { getAllDefaultTemplates } from '@t3x/core';
import type { AnyDB } from '../adapters';
import { templates } from '../schema';

/** Category mapping: leaf type → template category */
const CATEGORY_MAP: Record<string, string> = {
  tweet: 'social',
  weibo: 'social',
  wechat: 'social',
  slack: 'business',
  email: 'business',
  article: 'creative',
};

/**
 * Seed all builtin templates into the database.
 *
 * Idempotent: existing templates with matching IDs are left untouched.
 */
export async function seedBuiltinTemplates(db: AnyDB): Promise<void> {
  const defaults = getAllDefaultTemplates();
  const now = new Date();

  for (const tmpl of defaults) {
    const templateId = `tmpl_builtin_${tmpl.type}`;
    const category = CATEGORY_MAP[tmpl.type] ?? 'creative';

    await db
      .insert(templates)
      .values({
        templateId,
        title: tmpl.name,
        description: tmpl.description,
        category,
        leafType: tmpl.type,
        systemPrompt: tmpl.systemPrompt,
        userPrompt: tmpl.userPrompt,
        variables: tmpl.variables.map(
          (v: { name: string; description: string; required: boolean; defaultValue?: string }) => ({
            name: v.name,
            description: v.description,
            required: v.required,
            ...(v.defaultValue !== undefined ? { defaultValue: v.defaultValue } : {}),
          })
        ),
        tags: [tmpl.type, category],
        isBuiltin: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: templates.templateId });
  }
}
