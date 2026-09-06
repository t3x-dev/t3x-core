import { z } from 'zod';

export const SchemaReleasePresentationReferenceSchema = z
  .object({
    projectId: z.string().min(1),
    commitDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    presentationDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    coverPath: z.string().min(1).max(200).optional(),
  })
  .strict();
export type SchemaReleasePresentationReference = z.infer<
  typeof SchemaReleasePresentationReferenceSchema
>;

/** Registry metadata is mutable; release identity and content hash are immutable. */
export const SchemaCatalogItemSchema = z.object({
  identity: z.object({
    artifactId: z.string(),
    canonicalName: z.string(),
    displayName: z.string().nullable(),
    description: z.string().nullable(),
    tags: z.array(z.string()),
    family: z.string(),
    publisher: z.string(),
    ownerProjectId: z.string().nullable(),
    visibility: z.enum(['official', 'community', 'team', 'private']),
    metadataRevision: z.number().int(),
  }),
  release: z.object({
    artifactVersionId: z.string(),
    version: z.string(),
    hash: z.string(),
    kind: z.enum(['core', 'module', 'schema']),
    status: z.enum(['active', 'published']),
    publishedAt: z.string(),
  }),
  presentationRef: SchemaReleasePresentationReferenceSchema.nullable().default(null),
  contentKind: z.literal('definition'),
  definition: z.object({
    pathCount: z.number().int(),
    nodes: z.array(z.object({ path: z.string(), slots: z.array(z.string()) })).default([]),
    provides: z.array(z.string()),
    requires: z.array(z.string()),
  }),
  // These are serialization formats, never a claim about an external runner.
  formats: z.array(z.enum(['json', 'yaml'])),
  validation: z.literal('not-run'),
  license: z.string().nullable(),
});
export const SchemaCatalogPageSchema = z.object({
  items: z.array(SchemaCatalogItemSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});
export type SchemaCatalogItem = z.infer<typeof SchemaCatalogItemSchema>;
export type SchemaCatalogPage = z.infer<typeof SchemaCatalogPageSchema>;

/** Editorial labels only: aliases do not select renderers, validators or adapters. */
export const SchemaCatalogCollectionsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      tags: z.array(z.string()),
    })
  ),
});
