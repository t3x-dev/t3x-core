/**
 * Project schemas for API validation and OpenAPI spec
 *
 * IMPORTANT: Use z from @hono/zod-openapi to ensure compatibility with OpenAPI routes.
 * Do NOT import from 'zod' directly as it may resolve to a different version.
 */
import { z } from '@hono/zod-openapi';
import {
  RepositoryProfilePatchSchema,
  RepositoryProfileSchema,
  RepositoryTagsSchema,
} from '@t3x-dev/api-client';
import { ExtractionStyleSchema } from './contracts';

// Metadata schema - use z.any() to avoid Zod v4 compatibility issues with z.record(z.unknown())
const MetadataSchema = z.record(z.string(), z.any()).nullable();
const MetadataInputSchema = z
  .record(z.string(), z.any())
  .refine(
    (value) => !Object.hasOwn(value, 'repository_profile'),
    'repository_profile is reserved; use the project profile fields instead.'
  )
  .describe(
    'Project metadata. Updates merge supplied top-level keys. repository_profile is reserved and must not be supplied here.'
  );

// Provider config schema — JSON object with role overrides
const ProviderConfigSchema = z
  .object({
    roles: z.array(
      z.object({
        role: z.string(),
        provider_ids: z.array(z.string()),
      })
    ),
  })
  .nullable();

export const ProjectVisibilitySchema = z.enum(['private', 'unlisted', 'public']);

// Project entity
export const ProjectSchema = z.object({
  repository_profile: RepositoryProfileSchema.optional(),
  can_edit: z.boolean().optional(),
  deleted_at: z.string().datetime().nullable().optional(),
  can_restore: z.boolean().optional(),
  can_permanently_delete: z.boolean().optional(),
  project_id: z.string(),
  name: z.string(),
  namespace: z.string().nullable().optional(),
  canonical_path: z.string().nullable().optional(),
  path_status: z.enum(['ready', 'pending_migration']).optional(),
  visibility: ProjectVisibilitySchema,
  created_at: z.string().datetime(),
  metadata: MetadataSchema,
  provider_config: ProviderConfigSchema.optional(),
  default_provider: z.string().nullable().optional(),
  default_model: z.string().nullable().optional(),
  extraction_style: ExtractionStyleSchema.nullable().optional(),
});

// Project with stats
export const ProjectWithStatsSchema = ProjectSchema.extend({
  conversations_count: z.number().int(),
  turns_count: z.number().int(),
  commits_count: z.number().int(),
  branches_count: z.number().int(),
  drafts_count: z.number().int(),
  outputs_count: z.number().int(),
});

// Create project request
export const CreateProjectSchema = z.object({
  initialize_readme: z
    .boolean()
    .describe(
      'Default false. Initialize a repository README from the confirmed name and metadata.description in the project creation transaction; no AI or business Commit.'
    )
    .optional(),
  tags: RepositoryTagsSchema.optional(),
  name: z.string().max(4096),
  metadata: MetadataInputSchema.optional(),
  namespace: z.string().min(2).max(39).optional(),
  // Omitted preserves the existing empty-project workflow.
  starter: z.literal('prd-v1').optional(),
});

// Update project request
export const UpdateProjectSchema = z
  .object({
    repository_profile: RepositoryProfilePatchSchema.optional(),
    name: z.string().max(4096).optional(),
    metadata: MetadataInputSchema.optional(),
    provider_config: ProviderConfigSchema.optional(),
    default_provider: z.string().nullable().optional(),
    default_model: z.string().nullable().optional(),
    extraction_style: ExtractionStyleSchema.nullable().optional(),
  })
  .strict();

// Project with counts (for list view — lighter than full stats)
export const ProjectWithCountsSchema = ProjectSchema.extend({
  conversations_count: z.number().int(),
  commits_count: z.number().int(),
  branches_count: z.number().int(),
  outputs_count: z.number().int(),
});

// List projects response
export const ListProjectsResponseSchema = z.object({
  status: z.literal('deleted').optional(),
  projects: z.array(ProjectWithCountsSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
