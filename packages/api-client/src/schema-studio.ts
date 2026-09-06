import { z } from 'zod';

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const StudioSourceSchema = z.object({
  projectId: z.string().min(1).nullable(),
  canonicalName: z.string().min(1).max(240),
  version: z.string().min(1).max(80),
  artifactVersionId: z.string(),
  hash: digest,
});
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
export const StudioPreviewInputSchema = z
  .object({
    candidateIds: ids,
    workspaceId: z.string().min(1).optional(),
    compareToCandidateIds: ids.optional(),
    sample: StudioSampleValueSchema.optional(),
  })
  .strict();
export const StudioApplyInputSchema = z
  .object({
    candidateIds: ids,
    workspaceId: z.string().min(1),
    ifRevision: z.number().int().nonnegative(),
    reviewHash: digest,
  })
  .strict();
const change = z.object({
  kind: z.enum(['ADD', 'CHANGE', 'REMOVE']),
  path: z.string(),
  summary: z.string(),
});
export const StudioPreviewSchema = z.object({
  samples: z.array(StudioSampleSchema).default([]),
  localSample: StudioSampleSchema.nullable().default(null),
  selectionHash: digest,
  schemaHash: digest,
  reviewHash: digest,
  schema: z.record(z.string(), z.unknown()),
  report: z.object({
    valid: z.boolean(),
    issues: z.array(
      z.object({
        code: z.string(),
        message: z.string(),
        blocking: z.boolean(),
        path: z.string().optional(),
      })
    ),
  }),
  renderPlan: z.array(z.record(z.string(), z.unknown())),
  origins: z.record(z.string(), z.unknown()),
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
      changes: z.array(change),
    })
    .nullable(),
  comparison: z.object({ schemaHash: digest, changes: z.array(change) }).nullable(),
});
export type StudioPreview = z.infer<typeof StudioPreviewSchema>;
export type StudioPreviewInput = z.infer<typeof StudioPreviewInputSchema>;
export type StudioApplyInput = z.infer<typeof StudioApplyInputSchema>;
