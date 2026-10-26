import { z } from 'zod';

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const StudioSourceSchema = z.object({
  projectId: z.string().min(1).nullable(),
  canonicalName: z.string().min(1).max(240),
  version: z.string().min(1).max(80),
  artifactVersionId: z.string(),
  hash: digest,
});

export const SchemaSourceCommitSchema = z
  .object({
    projectId: z.string().min(1),
    commitDigest: digest,
    schemaHash: digest,
    sourcePath: z.string().min(1).max(2000),
  })
  .strict();
export const SchemaNodeProvenanceSchema = z
  .object({
    version: z.literal(1),
    byPath: z.record(
      z.string(),
      z
        .array(
          z
            .object({
              // Null until the committed definition has a Release. Never embed a Release's own hash.
              source: StudioSourceSchema.nullable(),
              commitRef: SchemaSourceCommitSchema,
            })
            .strict()
        )
        .max(32)
    ),
  })
  .strict();
export type SchemaSourceCommit = z.infer<typeof SchemaSourceCommitSchema>;
export type SchemaNodeProvenance = z.infer<typeof SchemaNodeProvenanceSchema>;
