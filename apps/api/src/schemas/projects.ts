/**
 * Project schemas for API validation and OpenAPI spec
 *
 * IMPORTANT: Use z from @hono/zod-openapi to ensure compatibility with OpenAPI routes.
 * Do NOT import from 'zod' directly as it may resolve to a different version.
 */
import { z } from '@hono/zod-openapi';

// Metadata schema - use z.any() to avoid Zod v4 compatibility issues with z.record(z.unknown())
const MetadataSchema = z.record(z.string(), z.any()).nullable();

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

// Project entity
export const ProjectSchema = z.object({
  project_id: z.string(),
  name: z.string(),
  created_at: z.string().datetime(),
  metadata: MetadataSchema,
  provider_config: ProviderConfigSchema.optional(),
});

// Project with stats
export const ProjectWithStatsSchema = ProjectSchema.extend({
  conversations_count: z.number().int(),
  turns_count: z.number().int(),
  commits_count: z.number().int(),
  branches_count: z.number().int(),
  drafts_count: z.number().int(),
});

// Create project request
export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Update project request
export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  provider_config: ProviderConfigSchema.optional(),
});

// Project with counts (for list view — lighter than full stats)
export const ProjectWithCountsSchema = ProjectSchema.extend({
  conversations_count: z.number().int(),
  commits_count: z.number().int(),
  branches_count: z.number().int(),
});

// List projects response
export const ListProjectsResponseSchema = z.object({
  projects: z.array(ProjectWithCountsSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
