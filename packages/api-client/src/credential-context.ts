import { API_KEY_PRINCIPAL_KINDS, TRANSITION_SCOPES } from '@t3x-dev/core';
import { z } from 'zod';

export const CredentialContextSchema = z.object({
  actor_kind: z.enum(API_KEY_PRINCIPAL_KINDS),
  credential_kind: z.string().min(1),
  project_id: z.string().nullable(),
  namespace_id: z.string().nullable(),
  transition_scopes: z.array(z.enum(TRANSITION_SCOPES)),
});

export type CredentialContext = z.infer<typeof CredentialContextSchema>;
