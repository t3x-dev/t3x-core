import { z } from '@hono/zod-openapi';

export const ProviderRoleSchema = z.enum(['generation', 'embedding', 'merge']);

export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: ProviderRoleSchema,
  configured: z.boolean(),
  roles: z.array(ProviderRoleSchema),
  required_env_keys: z.array(z.string()),
  default_model: z.string().nullable(),
  available_models: z.array(z.string()).nullable(),
});

export const ProviderListSchema = z.array(ProviderSchema);

export const RoleAssignmentSchema = z.object({
  role: ProviderRoleSchema,
  provider_ids: z.array(z.string()),
});

export const RoleAssignmentListSchema = z.array(RoleAssignmentSchema);

export const RoleAssignmentWriteSchema = z.object({
  roles: RoleAssignmentListSchema,
});

export const TestResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  latency_ms: z.number().optional(),
});

export const ProviderTestParamSchema = z.object({
  id: z.string(),
});

export const LocalProviderIdSchema = z.enum(['anthropic', 'openai', 'google']);

export const LocalProviderStatusSchema = z.object({
  provider: LocalProviderIdSchema,
  configured: z.boolean(),
  default_model: z.string().nullable(),
  last_test_status: z.enum(['ok', 'error']).nullable(),
  last_tested_at: z.string().nullable(),
  last_test_error: z.string().nullable(),
  api_key_source: z.enum(['database', 'environment', 'none']),
  api_key_preview: z.string().nullable(),
  stored: z.boolean(),
});

export const LocalProviderWriteSchema = z.object({
  api_key: z.string().trim().min(1),
  default_model: z.string().nullable().optional(),
});

export const LocalProviderParamSchema = z.object({
  id: z.string(),
});

export const ProviderConfigSchema = z.object({
  roles: z.array(RoleAssignmentSchema),
});

export const TaskModelDefaultSchema = z.object({
  primary_model: z.string(),
  fallback_model: z.string().nullable(),
});

export const ModelAccessConfigSchema = z.object({
  enabled_models: z.array(z.string()),
  default_model: z.string().nullable(),
  task_defaults: z.object({
    compose: TaskModelDefaultSchema,
    extraction: TaskModelDefaultSchema,
    validation: TaskModelDefaultSchema,
  }),
});
