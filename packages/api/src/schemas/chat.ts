import { z } from '@hono/zod-openapi';

export const GenerationRequestBodySchema = z.object({
  messages: z.array(z.unknown()).min(1).max(100),
  provider: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  project_id: z.string().optional(),
  web_search: z.boolean().optional(),
  thinking: z.boolean().optional(),
});

export const GenerationResponseDataSchema = z.object({
  content: z.string(),
  model: z.string(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .optional(),
  finish_reason: z.string().optional(),
});

export const GenerationProvidersResponseDataSchema = z.object({
  providers: z.array(z.string()),
  default: z.string(),
});

/** @deprecated Compatibility name for the existing /v1/chat wire route. */
export const ChatRequestBodySchema = GenerationRequestBodySchema;
/** @deprecated Compatibility name for the existing /v1/chat wire route. */
export const ChatResponseDataSchema = GenerationResponseDataSchema;
/** @deprecated Use GenerationProvidersResponseDataSchema. */
export const ProvidersResponseDataSchema = GenerationProvidersResponseDataSchema;
