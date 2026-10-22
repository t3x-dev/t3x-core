import { z } from 'zod';
import {
  SchemaEvolutionImpactSchema,
  StudioSchemaEditLocalContributionSchema,
} from './schema-studio';

export const AssistantSchemaSettingsInputSchema = z
  .object({
    action: z.enum([
      'add_node',
      'add_slot',
      'edit_node',
      'edit_slot',
      'remove_node',
      'remove_slot',
      'rename_node',
      'rename_slot',
      'add_relation',
      'edit_relation',
      'remove_relation',
      'add_rule',
      'edit_rule',
      'remove_rule',
      'move_node',
      'move_slot',
    ]),
    /** Parent node path; empty for a root Node. Slot always needs a parent. */
    nodePath: z.string().max(1000),
    name: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(100),
    definition: StudioSchemaEditLocalContributionSchema,
    definitionMode: z.enum(['patch', 'replace']).optional(),
    required: z.boolean().optional(),
    newName: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .max(100)
      .optional(),
    targetNodePath: z.string().max(1000).optional(),
    unsetAttributes: z
      .array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/))
      .max(40)
      .optional(),
    intent: z.string().trim().min(1).max(2000),
  })
  .strict();
const AssistantSchemaSettingsCardViewSchema = z.object({
  settingsId: z.string(),
  revision: z.number().int().positive(),
  status: z.enum(['queued', 'pending', 'confirmed', 'generated', 'applied', 'cancelled']),
  conversationId: z.string(),
  workspaceRevision: z.number().int().positive(),
  schemaHash: z.string(),
  settings: AssistantSchemaSettingsInputSchema,
  currentDefinition: z.record(z.string(), z.unknown()).optional(),
  referenceRelations: z.record(z.string(), z.unknown()).optional(),
  impact: SchemaEvolutionImpactSchema.optional(),
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
export const AssistantSchemaSettingsViewSchema = AssistantSchemaSettingsCardViewSchema.extend({
  /** Independently confirmed changes. A child waits for its parent Node. */
  cards: z.array(AssistantSchemaSettingsCardViewSchema).max(100).optional(),
});
export type AssistantSchemaSettingsInput = z.infer<typeof AssistantSchemaSettingsInputSchema>;
export type AssistantSchemaSettingsView = z.infer<typeof AssistantSchemaSettingsViewSchema>;
