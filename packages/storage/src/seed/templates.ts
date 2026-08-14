/**
 * Seed Builtin Templates
 *
 * Imports DEFAULT_TEMPLATES from @t3x-dev/core and seeds them into the database.
 * Idempotent: uses INSERT ... ON CONFLICT DO UPDATE for builtin templates.
 */

import { createHash } from 'node:crypto';
import { getAllDefaultTemplates } from '@t3x-dev/core';
import type { AnyDB } from '../adapters';
import { templateAuditLog, templates } from '../schema';

/** Category mapping: leaf type → template category */
const CATEGORY_MAP: Record<string, string> = {
  tweet: 'social',
  linkedin: 'social',
  reddit: 'social',
  threads: 'social',
  slack: 'business',
  email: 'business',
  article: 'creative',
};

/**
 * Seed all builtin templates into the database.
 *
 * Idempotent: builtin templates with matching IDs are refreshed from core defaults.
 */
export async function seedBuiltinTemplates(db: AnyDB): Promise<void> {
  const defaults = getAllDefaultTemplates();
  const now = new Date();

  for (const tmpl of defaults) {
    const templateId = `tmpl_builtin_${tmpl.type}`;
    const category = CATEGORY_MAP[tmpl.type] ?? 'creative';

    const provenance = {
      source: 'builtin' as const,
      actor_kind: 'system' as const,
      actor_id: 'builtin-seed',
    };
    const seedDigest = createHash('sha256')
      .update(
        JSON.stringify({
          type: tmpl.type,
          name: tmpl.name,
          description: tmpl.description,
          systemPrompt: tmpl.systemPrompt,
          userPrompt: tmpl.userPrompt,
          variables: tmpl.variables,
        })
      )
      .digest('hex');

    await db.transaction(async (tx) => {
      const [row] = await tx
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
            (v: {
              name: string;
              description: string;
              required: boolean;
              defaultValue?: string;
            }) => ({
              name: v.name,
              description: v.description,
              required: v.required,
              ...(v.defaultValue !== undefined ? { defaultValue: v.defaultValue } : {}),
            })
          ),
          tags: [tmpl.type, category],
          isBuiltin: true,
          ownerId: null,
          provenance,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: templates.templateId,
          set: {
            title: tmpl.name,
            description: tmpl.description,
            category,
            leafType: tmpl.type,
            systemPrompt: tmpl.systemPrompt,
            userPrompt: tmpl.userPrompt,
            variables: tmpl.variables.map(
              (v: {
                name: string;
                description: string;
                required: boolean;
                defaultValue?: string;
              }) => ({
                name: v.name,
                description: v.description,
                required: v.required,
                ...(v.defaultValue !== undefined ? { defaultValue: v.defaultValue } : {}),
              })
            ),
            tags: [tmpl.type, category],
            isBuiltin: true,
            ownerId: null,
            provenance,
            defaultConstraints: [],
            semanticThreshold: null,
            updatedAt: now,
          },
        })
        .returning();

      await tx
        .insert(templateAuditLog)
        .values({
          auditId: `tma_seed_${seedDigest}`,
          templateId,
          action: 'seed',
          actorKind: 'system',
          actorId: 'builtin-seed',
          ownerId: null,
          provenance,
          snapshot: row,
          createdAt: now,
        })
        .onConflictDoNothing();
    });
  }
}
