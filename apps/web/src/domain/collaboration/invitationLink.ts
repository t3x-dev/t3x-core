import { CollaborationInvitationTokenSchema } from '@t3x-dev/api-client';

export const PENDING_INVITATION_TOKEN_KEY = 't3x.pending-invitation-token';

export function invitationTokenFromHash(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment) return null;

  const token = new URLSearchParams(fragment).get('token');
  const parsed = CollaborationInvitationTokenSchema.safeParse(token);
  return parsed.success ? parsed.data : null;
}

export function buildInvitationUrl(origin: string, token: string): string {
  const parsedToken = CollaborationInvitationTokenSchema.parse(token);
  const url = new URL('/invite', origin);
  url.hash = new URLSearchParams({ token: parsedToken }).toString();
  return url.toString();
}
