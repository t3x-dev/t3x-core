/**
 * Project schemas for API validation and OpenAPI spec
 */
import { z } from '@hono/zod-openapi';

// Project entity
export const ProjectSchema = z.object({
  project_id: z.string(),
  name: z.string(),
  created_at: z.string().datetime(),
  metadata: z.record(z.unknown()).nullable(),
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
  metadata: z.record(z.unknown()).optional(),
});

// Update project request
export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// List projects response
export const ListProjectsResponseSchema = z.object({
  projects: z.array(ProjectSchema),
  limit: z.number().int(),
  offset: z.number().int(),
});
