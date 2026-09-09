import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const COLLABORATION_INVITATION_TOKEN_PREFIX = 't3xi_v1_' as const;
export const COLLABORATION_INVITATION_TOKEN_SECRET_BYTES = 32;

const TOKEN_SECRET_LENGTH = 43;
const TOKEN_PATTERN = new RegExp(
  `^${COLLABORATION_INVITATION_TOKEN_PREFIX}[A-Za-z0-9_-]{${TOKEN_SECRET_LENGTH}}$`
);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export type CollaborationInvitationToken =
  `${typeof COLLABORATION_INVITATION_TOKEN_PREFIX}${string}`;
export type CollaborationInvitationTokenHash = `sha256:${string}`;

export interface IssuedCollaborationInvitationToken {
  /** Return once to the caller. Never persist or log this value. */
  token: CollaborationInvitationToken;
  /** Persist this lookup value in collaboration_invitations.token_hash. */
  tokenHash: CollaborationInvitationTokenHash;
}

export function isCollaborationInvitationToken(
  value: string
): value is CollaborationInvitationToken {
  return TOKEN_PATTERN.test(value);
}

/** Return a deterministic lookup hash, or null without hashing malformed input. */
export function hashCollaborationInvitationToken(
  token: string
): CollaborationInvitationTokenHash | null {
  if (!isCollaborationInvitationToken(token)) return null;
  return `sha256:${createHash('sha256').update(token, 'utf8').digest('hex')}`;
}

/** Issue a 256-bit, versioned bearer token and its persistence-only hash. */
export function issueCollaborationInvitationToken(): IssuedCollaborationInvitationToken {
  const secret = randomBytes(COLLABORATION_INVITATION_TOKEN_SECRET_BYTES).toString('base64url');
  const token = `${COLLABORATION_INVITATION_TOKEN_PREFIX}${secret}` as CollaborationInvitationToken;
  const tokenHash = hashCollaborationInvitationToken(token);
  if (!tokenHash) throw new Error('Generated collaboration invitation token is invalid');
  return { token, tokenHash };
}

/** Timing-safe verification for adapters that already loaded a stored hash. */
export function verifyCollaborationInvitationToken(token: string, expectedHash: string): boolean {
  const actualHash = hashCollaborationInvitationToken(token);
  if (!actualHash || !HASH_PATTERN.test(expectedHash)) return false;
  const actualBytes = Buffer.from(actualHash.slice('sha256:'.length), 'hex');
  const expectedBytes = Buffer.from(expectedHash.slice('sha256:'.length), 'hex');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
