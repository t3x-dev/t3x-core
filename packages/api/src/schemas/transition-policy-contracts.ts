import { z } from '@hono/zod-openapi';
import { API_KEY_PRINCIPAL_KINDS } from '@t3x-dev/core';

export const TransitionPolicyBindingRequest = z
  .object({
    ref_name: z.string().min(1),
    uri: z.string().min(1),
    policy: z.unknown(),
  })
  .strict()
  .openapi('TransitionPolicyBindingRequest');

export const TransitionPolicyBindingResponse = z
  .object({
    project_id: z.string(),
    ref_name: z.string(),
    policy: z.unknown(),
    resource: z.object({
      uri: z.string(),
      media_type: z.literal('application/vnd.t3x.acceptance-policy+json'),
      digest: z.string(),
    }),
    updated_by: z.object({
      kind: z.enum(API_KEY_PRINCIPAL_KINDS),
      id: z.string(),
    }),
    updated_at: z.string(),
  })
  .openapi('TransitionPolicyBindingResponse');

export const TransitionPolicyBindingQuery = z.object({ ref_name: z.string().min(1) }).strict();
