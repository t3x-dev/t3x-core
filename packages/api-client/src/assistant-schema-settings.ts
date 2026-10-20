import { z } from 'zod';
import { StudioSchemaEditLocalContributionSchema } from './schema-studio';

export const AssistantSchemaSettingsInputSchema = z
  .object({
    action: z.enum(['add_node', 'add_slot']),
    /** Parent node path; empty for a root Node. Slot always needs a parent. */
    nodePath: z.string().max(1000),
    name: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(100),
    definition: StudioSchemaEditLocalContributionSchema,
    required: z.boolean().default(false),
    intent: z.string().trim().min(1).max(2000),
  })
  .strict();
export const AssistantSchemaSettingsViewSchema = z.object({
  settingsId: z.string(),
  revision: z.number().int().positive(),
  status: z.enum(['pending', 'confirmed', 'generated', 'applied', 'cancelled']),
  conversationId: z.string(),
  workspaceRevision: z.number().int().positive(),
  schemaHash: z.string(),
  settings: AssistantSchemaSettingsInputSchema,
  candidateId: z.string().optional(),
  candidateRevision: z.number().int().positive().optional(),
  application: z
    .object({
      workspaceRevision: z.number().int().positive(),
      ready: z.boolean(),
      issues: z.array(z.object({ code: z.string(), path: z.string(), message: z.string() })),
    })
    .optional(),
  createdAt: z.string().optional(),
  changes: z
    .array(
      z.object({ kind: z.enum(['ADD', 'CHANGE', 'REMOVE']), path: z.string(), summary: z.string() })
    )
    .optional(),
  studioConflict: z
    .object({ candidateId: z.string(), revision: z.number().int().positive() })
    .optional(),
  snapshot: z
    .object({
      compositionId: z.string(),
      compositionRevision: z.number().int().positive(),
      compositionHash: z.string(),
      schemaHash: z.string(),
    })
    .optional(),
});
export type AssistantSchemaSettingsInput = z.infer<typeof AssistantSchemaSettingsInputSchema>;
export type AssistantSchemaSettingsView = z.infer<typeof AssistantSchemaSettingsViewSchema>;
