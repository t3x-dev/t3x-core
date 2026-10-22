import { z } from 'zod';
import { SchemaCatalogItemSchema } from './schema-catalog.js';

/** Public directory projection. Never includes arbitrary repository metadata or State. */
export const PublicProjectSchema = z
  .object({
    projectId: z.string(),
    name: z.string(),
    namespace: z.string().nullable(),
    description: z.string(),
    tags: z.array(z.string()),
    createdAt: z.string(),
    repositoryPath: z.string().nullable(),
  })
  .strict();
export const PublicProjectDetailSchema = PublicProjectSchema.extend({ readme: z.string() });
export const PublicProjectPageSchema = z.object({
  items: z.array(PublicProjectSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});
export const SchemaTargetSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  namespace: z.string().nullable(),
});
export const SchemaTargetPageSchema = z.object({
  items: z.array(SchemaTargetSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});
export const ExploreSchemaReleaseSchema = z.object({
  item: SchemaCatalogItemSchema,
  artifactHash: z.string(),
  readme: z.string().nullable(),
  manifest: z.record(z.string(), z.unknown()),
});
export type PublicProject = z.infer<typeof PublicProjectSchema>;
export type PublicProjectDetail = z.infer<typeof PublicProjectDetailSchema>;
