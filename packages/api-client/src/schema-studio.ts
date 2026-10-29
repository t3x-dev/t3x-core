import { z } from 'zod';
import { SchemaNodeProvenanceSchema, StudioSourceSchema } from './schema-provenance';

export { StudioSourceSchema } from './schema-provenance';

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const recursiveJsonValue = z.json();
// Keep recursive JSON validation without exposing a lazy schema to OpenAPI 3 generators.
const schemaJsonValue = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.unknown()),
    z.record(z.string(), z.unknown()),
  ])
  .transform((value, context) => {
    const parsed = recursiveJsonValue.safeParse(value);
    if (!parsed.success) {
      context.addIssue({ code: 'custom', message: 'Expected a JSON value.' });
      return z.NEVER;
    }
    return parsed.data;
  });
export { schemaJsonValue as SchemaJsonValueSchema };
export const AddStudioCandidateSchema = z
  .object({
    sourceProjectId: z.string().min(1).optional(),
    canonicalName: z.string().min(1).max(240),
    version: z.string().min(1).max(80),
    expectedHash: digest.optional(),
  })
  .strict();
export const StudioCandidateSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  studioId: z.literal('main'),
  createdAt: z.string(),
  available: z.boolean(),
  source: StudioSourceSchema.nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  kind: z.enum(['core', 'module', 'schema']).nullable(),
  license: z.string().nullable(),
  reason: z.string().nullable(),
});
export const StudioCandidateListSchema = z.object({ items: z.array(StudioCandidateSchema) });
export type StudioCandidate = z.infer<typeof StudioCandidateSchema>;
export type AddStudioCandidate = z.infer<typeof AddStudioCandidateSchema>;

const ids = z
  .array(z.string().min(1))
  .min(1)
  .max(32)
  .refine((values) => new Set(values).size === values.length, 'Duplicate candidates');
/** Empty selection resolves the exact binding, or a local empty Base when unbound. */
const workspaceIds = z
  .array(z.string().min(1))
  .max(32)
  .refine((values) => new Set(values).size === values.length, 'Duplicate candidates');
/** Bounded JSON only: samples are preview input, never effects or execution requests. */
export const StudioSampleValueSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, ctx) => {
    const pending: Array<[unknown, number]> = [[value, 0]];
    let count = 0;
    while (pending.length) {
      const [item, depth] = pending.pop()!;
      if (++count > 10000 || depth > 24) {
        ctx.addIssue({ code: 'custom', message: 'Sample exceeds the preview structure limit.' });
        return;
      }
      if (item && typeof item === 'object')
        for (const child of Object.values(item)) pending.push([child, depth + 1]);
    }
    if (new TextEncoder().encode(JSON.stringify(value)).length > 65536)
      ctx.addIssue({ code: 'custom', message: 'Sample must be at most 64 KiB.' });
  });
export const StudioSampleSchema = z.object({
  id: z.string(),
  source: StudioSourceSchema.nullable(),
  value: z.record(z.string(), z.unknown()).nullable(),
  valid: z.boolean(),
  ready: z.boolean(),
  issues: z.array(z.object({ code: z.string(), path: z.string(), message: z.string() })),
});
export type StudioSample = z.infer<typeof StudioSampleSchema>;
export const StudioSchemaEditLocalContributionSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, ctx) => {
    const pending: Array<[unknown, number]> = [[value, 0]];
    let count = 0;
    while (pending.length) {
      const [item, depth] = pending.pop()!;
      if (++count > 25000 || depth > 32) {
        ctx.addIssue({
          code: 'custom',
          message: 'Schema contribution exceeds the supported structure limit.',
        });
        return;
      }
      if (item && typeof item === 'object')
        for (const child of Object.values(item)) pending.push([child, depth + 1]);
    }
    if (new TextEncoder().encode(JSON.stringify(value)).length > 1024 * 1024)
      ctx.addIssue({ code: 'custom', message: 'Schema contribution must be at most 1 MiB.' });
  });
export const StudioSchemaEditCandidateRefSchema = z.object({
  candidateId: z.string().min(1),
  revision: z.number().int().positive(),
});
export const StudioCompositionSchema = z.record(
  z.string().min(1).max(300),
  z.string().min(1).max(300)
);
export const StudioCompositionConflictSchema = z.object({
  definitions: z.record(z.string(), z.unknown()).default({}),
  path: z.string(),
  candidates: z.array(z.string()),
  selected: z.string().nullable(),
});
export const StudioPreviewInputSchema = z
  .object({
    candidateIds: workspaceIds,
    workspaceId: z.string().min(1).optional(),
    compareToCandidateIds: ids.optional(),
    composition: StudioCompositionSchema.optional(),
    sample: StudioSampleValueSchema.optional(),
    localContribution: StudioSchemaEditLocalContributionSchema.optional(),
    schemaDefinition: StudioSchemaEditLocalContributionSchema.optional(),
    baseSchemaHash: digest.optional(),
    sourceMappings: z
      .array(
        z
          .object({
            path: z.array(z.string()).min(2).max(100),
            from: z.array(z.string()).min(2).max(100),
            source: z
              .object({ candidateId: z.string().min(1).max(300), schemaHash: digest })
              .strict()
              .optional(),
          })
          .strict()
      )
      .max(10000)
      .optional(),
    schemaEditCandidate: StudioSchemaEditCandidateRefSchema.optional(),
  })
  .strict()
  .refine((value) => value.candidateIds.length > 0 || !!value.workspaceId, {
    message: 'Select sources or provide a Workspace with an exact bound Schema.',
  })
  .refine(
    (value) => !(value.schemaEditCandidate && (value.localContribution || value.schemaDefinition)),
    {
      message: 'Preview either a saved Schema edit candidate or an unsaved local contribution.',
    }
  );
export const StudioApplyInputSchema = z
  .object({
    candidateIds: ids,
    workspaceId: z.string().min(1),
    ifRevision: z.number().int().nonnegative(),
    reviewHash: digest,
    schemaEditCandidate: StudioSchemaEditCandidateRefSchema.optional(),
  })
  .strict();
const change = z.object({
  kind: z.enum(['ADD', 'CHANGE', 'REMOVE']),
  path: z.string(),
  summary: z.string(),
});
export const SchemaEvolutionImpactSchema = z.object({
  status: z.enum(['safe', 'needs_input', 'needs_mapping', 'blocked']),
  canAdopt: z.boolean(),
  canPublish: z.boolean(),
  changes: z.array(change),
  items: z.array(
    z.object({
      kind: z.enum(['safe_addition', 'safe_change', 'needs_input', 'needs_mapping', 'blocked']),
      code: z.string(),
      path: z.string(),
      message: z.string(),
      affectedPaths: z.array(z.string()),
    })
  ),
  content: z.object({
    source: z.enum(['authoring_ledger', 'candidate_fields', 'empty', 'unavailable']),
    hash: digest.nullable(),
    valid: z.boolean().nullable(),
    ready: z.boolean().nullable(),
    issues: z.array(z.object({ code: z.string(), path: z.string(), message: z.string() })),
  }),
});
export type SchemaEvolutionImpact = z.infer<typeof SchemaEvolutionImpactSchema>;
const studioCheckIssue = z.object({
  code: z.string(),
  message: z.string(),
  blocking: z.boolean(),
  path: z.string().optional(),
});
export const StudioCheckLayerSchema = z.object({
  id: z.enum(['definition', 'composition', 'provenance', 'workspace', 'freshness']),
  label: z.string(),
  status: z.enum(['passed', 'failed', 'warning', 'not_run']),
  issues: z.array(studioCheckIssue),
  summary: z.string().optional(),
});
export const StudioPreviewSchema = z.object({
  composition: StudioCompositionSchema.optional(),
  compositionConflicts: z.array(StudioCompositionConflictSchema).default([]),
  impact: SchemaEvolutionImpactSchema.nullable().default(null),
  samples: z.array(StudioSampleSchema).default([]),
  localSample: StudioSampleSchema.nullable().default(null),
  selectionHash: digest,
  schemaHash: digest,
  reviewHash: digest,
  schema: z.record(z.string(), z.unknown()),
  report: z.object({
    valid: z.boolean(),
    issues: z.array(studioCheckIssue),
    layers: z.array(StudioCheckLayerSchema).default([]),
  }),
  renderPlan: z.array(z.record(z.string(), z.unknown())),
  origins: z.record(z.string(), z.unknown()),
  nodeProvenance: SchemaNodeProvenanceSchema.optional(),
  modules: z
    .array(z.object({ candidateId: z.string(), requiredBy: z.array(z.string()) }))
    .default([]),
  sources: z.array(StudioSourceSchema),
  adoption: z.object({ allowed: z.boolean(), reason: z.string().nullable() }),
  workspace: z
    .object({
      id: z.string(),
      revision: z.number(),
      binding: z.record(z.string(), z.unknown()).nullable(),
      /** Exact bound definition when the selected source versions match its provenance. */
      boundSchema: z.record(z.string(), z.unknown()).optional(),
      canBind: z.boolean().optional(),
      changes: z.array(change),
    })
    .nullable(),
  comparison: z.object({ schemaHash: digest, changes: z.array(change) }).nullable(),
  freshness: z.object({
    candidateId: z.string().nullable(),
    candidateRevision: z.number().int().positive().nullable(),
    candidateRequestDigest: digest.nullable(),
    workspaceRevision: z.number().int().nonnegative().nullable(),
    schemaHash: digest,
  }),
});
export type StudioPreview = z.infer<typeof StudioPreviewSchema>;
export type StudioPreviewInput = z.infer<typeof StudioPreviewInputSchema>;
export type StudioApplyInput = z.infer<typeof StudioApplyInputSchema>;

/** Publish a saved, checked Studio candidate as a private immutable Schema, never a Module. */
export const StudioPublishInputSchema = z
  .object({
    visibility: z.literal('community'),
    candidateIds: ids,
    schemaEditCandidate: StudioSchemaEditCandidateRefSchema,
    ifRevision: z.number().int().positive(),
    reviewHash: digest,
    canonicalName: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .regex(/^[a-z0-9][a-z0-9._/-]*[a-z0-9]$/),
    version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/),
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(''),
    releaseNotes: z.string().trim().max(1000).default(''),
    license: z
      .enum(['Apache-2.0', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0'])
      .optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  })
  .strict();
export const StudioPublishResultSchema = z.object({
  source: StudioSourceSchema,
  schemaHash: digest,
  kind: z.literal('schema'),
  visibility: z.literal('community'),
});
export type StudioPublishInput = z.infer<typeof StudioPublishInputSchema>;
export type StudioPublishResult = z.infer<typeof StudioPublishResultSchema>;

export const WorkspaceSchemaPendingSchema = z
  .object({
    schema: z.literal('t3x.dev/workspace-schema-pending/v1'),
    pendingId: digest,
    workspaceId: z.string().min(1),
    targetBranch: z.string().min(1),
    baseWorkspaceRevision: z.number().int().positive(),
    workspaceRevision: z.number().int().positive(),
    reviewHash: digest,
    selectionHash: digest,
    schemaHash: digest,
    contentHash: digest.nullable(),
    bindingHash: digest,
    source: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('studio'),
          candidateIds: workspaceIds,
          schemaEditCandidate: StudioSchemaEditCandidateRefSchema.optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('composition'),
          compositionId: z.string().min(1),
          revision: z.number().int().positive(),
          compositionHash: digest,
        })
        .strict(),
    ]),
  })
  .strict();
export const WorkspaceSchemaPendingViewSchema = z.object({
  status: z.enum(['none', 'pending_preparation', 'stale', 'unavailable']),
  pending: WorkspaceSchemaPendingSchema.nullable(),
  reason: z.string().nullable(),
  impact: SchemaEvolutionImpactSchema.nullable(),
});
export const StudioAdoptResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    workspaceRevision: z.number().int().positive(),
    outcome: z.literal('pending_preparation'),
    pending: WorkspaceSchemaPendingSchema,
  }),
  z.object({
    workspaceRevision: z.number().int().positive(),
    outcome: z.literal('bound'),
    binding: z.record(z.string(), z.unknown()),
  }),
]);
export type WorkspaceSchemaPending = z.infer<typeof WorkspaceSchemaPendingSchema>;
export type WorkspaceSchemaPendingView = z.infer<typeof WorkspaceSchemaPendingViewSchema>;

export const SchemaContentMigrationCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('set'), path: z.string().min(1), value: schemaJsonValue }).strict(),
  z.object({ kind: z.literal('append'), path: z.string().min(1), value: schemaJsonValue }).strict(),
  z.object({ kind: z.literal('remove'), path: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('move'), from: z.string().min(1), to: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal('rename_node'),
      path: z.string().min(1),
      toKey: z.string().regex(/^[a-z][a-z0-9_]*$/),
    })
    .strict(),
]);
export const SchemaPreparationTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pending'), pendingId: digest }).strict(),
  z
    .object({
      kind: z.literal('studio'),
      candidateIds: workspaceIds,
      reviewHash: digest,
      schemaEditCandidate: StudioSchemaEditCandidateRefSchema.optional(),
    })
    .strict(),
]);
export const SchemaPreparationInputSchema = z
  .object({
    target: SchemaPreparationTargetSchema,
    ifRevision: z.number().int().positive(),
    commands: z.array(SchemaContentMigrationCommandSchema).max(200),
    confirmedChanges: z.array(z.string().min(1)).max(200).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const check = StudioSampleValueSchema.safeParse({ commands: value.commands });
    if (!check.success)
      ctx.addIssue({
        code: 'custom',
        message: 'Migration inputs exceed the supported JSON structure limit.',
      });
  });
export const SchemaPreparationApplyInputSchema = SchemaPreparationInputSchema.safeExtend({
  previewHash: digest,
  requestId: z.string().min(1).max(200),
});
export const SchemaPreparationPreviewSchema = z.object({
  contentValidation: z.enum(['required', 'not_applicable']).optional(),
  previewHash: digest,
  workspaceRevision: z.number().int().positive(),
  compositionRevision: z.number().int().nonnegative(),
  refHead: digest.nullable(),
  schemaHash: digest,
  schema: z.record(z.string(), z.unknown()),
  rootKey: z.string(),
  before: schemaJsonValue,
  after: schemaJsonValue,
  operations: z.array(z.record(z.string(), z.unknown())),
  impact: SchemaEvolutionImpactSchema,
  valid: z.boolean(),
  ready: z.boolean(),
  canPrepare: z.boolean(),
  issues: z.array(z.object({ code: z.string(), path: z.string(), message: z.string() })),
});
export const SchemaPreparationResultSchema = z.object({
  outcome: z.enum(['prepared', 'reused']),
  workspaceRevision: z.number().int().positive(),
  compositionRevision: z.number().int().nonnegative(),
  schemaHash: digest,
});
export type SchemaContentMigrationCommand = z.infer<typeof SchemaContentMigrationCommandSchema>;
export type SchemaPreparationInput = z.infer<typeof SchemaPreparationInputSchema>;
export type SchemaPreparationApplyInput = z.infer<typeof SchemaPreparationApplyInputSchema>;
export type SchemaPreparationPreview = z.infer<typeof SchemaPreparationPreviewSchema>;
export type SchemaPreparationTarget = z.infer<typeof SchemaPreparationTargetSchema>;

export const WorkspaceSchemaDefinitionSnapshotSchema = z
  .object({
    status: z.enum(['bound', 'unbound', 'unknown']),
    schemaHash: digest.nullable(),
    definition: z.record(z.string(), z.unknown()).nullable(),
    bindings: z.array(z.record(z.string(), z.unknown())),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const valid =
      snapshot.status === 'bound'
        ? snapshot.schemaHash !== null && snapshot.definition !== null
        : snapshot.schemaHash === null &&
          snapshot.definition === null &&
          snapshot.bindings.length === 0;
    if (!valid)
      context.addIssue({
        code: 'custom',
        message: 'Schema snapshot status does not match its definition, hash and bindings.',
      });
  });
export const WorkspaceFullSchemaReviewSchema = z
  .object({
    schema: z.literal('t3x.application/workspace-schema-review/v1'),
    base: WorkspaceSchemaDefinitionSnapshotSchema,
    draft: WorkspaceSchemaDefinitionSnapshotSchema,
    changes: z.array(change),
    actionCount: z.number().int().nonnegative(),
    baseContent: schemaJsonValue,
    draftContent: schemaJsonValue,
    // Absent on historical reviews: never infer an exemption for an old snapshot.
    contentValidation: z.literal('not_applicable').optional(),
  })
  .strict();
export type WorkspaceSchemaDefinitionSnapshot = z.infer<
  typeof WorkspaceSchemaDefinitionSnapshotSchema
>;
export type WorkspaceFullSchemaReview = z.infer<typeof WorkspaceFullSchemaReviewSchema>;

export const StudioSchemaEditOriginChannelSchema = z.enum(['studio', 'assistant', 'import', 'api']);

export const SaveStudioSchemaEditCandidateInputSchema = z
  .object({
    composition: StudioCompositionSchema.optional(),
    rebase: z.boolean().optional(),
    workspaceId: z.string().min(1),
    candidateIds: workspaceIds,
    ifRevision: z.number().int().nonnegative(),
    retryKey: z.string().min(1).max(200),
    intent: z.string().min(1).max(2000),
    origin: StudioSchemaEditOriginChannelSchema,
    localContribution: StudioSchemaEditLocalContributionSchema,
    schemaDefinition: StudioSchemaEditLocalContributionSchema.optional(),
    baseSchemaHash: digest.optional(),
    sourceMappings: StudioPreviewInputSchema.shape.sourceMappings,
  })
  .strict();

export const StudioSchemaEditCandidateSchema = z.object({
  composition: StudioCompositionSchema.optional(),
  schema: z.literal('t3x.application/workspace-schema-edit-candidate/v1'),
  candidateId: z.string().min(1),
  workspaceId: z.string().min(1),
  revision: z.number().int().positive(),
  baseSources: z.array(StudioSourceSchema),
  localContribution: StudioSchemaEditLocalContributionSchema,
  /** Read-only exact editing Base, projected by the server; never persisted as client input. */
  baseDefinition: z.record(z.string(), z.unknown()).optional(),
  authoringDraft: z
    .object({
      schema: z.literal('t3x.application/workspace-schema-authoring-draft/v1'),
      revision: z.number().int().nonnegative(),
      base: z.record(z.string(), z.unknown()),
      effect: z.object({
        profile: z.literal('yops.ops.v1'),
        operations: z.array(z.record(z.string(), z.unknown())),
      }),
      resultSchemaHash: digest.optional(),
      sourceMappings: StudioPreviewInputSchema.shape.sourceMappings,
    })
    .optional(),
  intent: z.string().min(1),
  origin: z.object({
    channel: StudioSchemaEditOriginChannelSchema,
    actor: z.object({
      kind: z.enum(['human', 'agent', 'service', 'local']),
      id: z.string().min(1),
    }),
  }),
  retryKey: z.string().min(1),
  requestDigest: digest,
});

export const StudioSchemaEditCandidateSaveResultSchema = z.object({
  outcome: z.enum(['created', 'updated', 'reused']),
  workspaceRevision: z.number().int().positive(),
  candidate: StudioSchemaEditCandidateSchema,
});

export type SaveStudioSchemaEditCandidateInput = z.infer<
  typeof SaveStudioSchemaEditCandidateInputSchema
>;
export type StudioSchemaEditCandidate = z.infer<typeof StudioSchemaEditCandidateSchema>;
export type StudioSchemaEditCandidateSaveResult = z.infer<
  typeof StudioSchemaEditCandidateSaveResultSchema
>;
