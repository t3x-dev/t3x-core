import type { MergeDecision } from '@t3x-dev/core';
import { z } from 'zod';
import {
  SchemaContentMigrationCommandSchema,
  SchemaJsonValueSchema,
  StudioSampleValueSchema,
} from './schema-studio';

/** Application-only merge work. This is not a protocol or native merge-driver contract. */
export const MergeSchemaResolutionSchema = z
  .object({
    choices: z
      .record(
        z.string().min(1).max(1000),
        z.union([
          z.literal('source'),
          z.literal('target'),
          z.object({ value: SchemaJsonValueSchema }).strict(),
          z.object({ remove: z.literal(true) }).strict(),
        ])
      )
      .refine((choices) => Object.keys(choices).length <= 200),
    commands: z.array(SchemaContentMigrationCommandSchema).max(200),
  })
  .strict()
  .superRefine((value, context) => {
    if (!StudioSampleValueSchema.safeParse({ resolution: value }).success)
      context.addIssue({
        code: 'custom',
        message: 'Merge edits exceed the supported JSON structure limit.',
      });
  });

export type MergeSchemaResolution = z.infer<typeof MergeSchemaResolutionSchema>;
export type MergeWorkspaceDecision = MergeDecision & { schemaResolution?: MergeSchemaResolution };
