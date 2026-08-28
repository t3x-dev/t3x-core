import { z } from '@hono/zod-openapi';

export const NamespaceSlugSchema = z
  .string()
  .min(2)
  .max(39)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const NamespaceSchema = z.object({
  namespace_id: z.string(),
  slug: NamespaceSlugSchema,
  kind: z.enum(['personal', 'organization']),
  display_name: z.string(),
  created_at: z.string().datetime(),
});

export const CreateNamespaceSchema = z.object({
  slug: NamespaceSlugSchema,
});
