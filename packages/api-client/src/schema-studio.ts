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
