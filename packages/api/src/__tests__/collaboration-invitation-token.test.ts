import { describe, expect, it } from 'vitest';
import {
  COLLABORATION_INVITATION_TOKEN_PREFIX,
  COLLABORATION_INVITATION_TOKEN_SECRET_BYTES,
  hashCollaborationInvitationToken,
  isCollaborationInvitationToken,
  issueCollaborationInvitationToken,
  verifyCollaborationInvitationToken,
} from '../lib/collaboration-invitation-token';

describe('collaboration invitation tokens', () => {
  it('issues unique versioned 256-bit tokens and persistence-only hashes', () => {
    const issued = Array.from({ length: 64 }, () => issueCollaborationInvitationToken());
    expect(new Set(issued.map(({ token }) => token)).size).toBe(64);
    expect(COLLABORATION_INVITATION_TOKEN_SECRET_BYTES).toBe(32);

    for (const { token, tokenHash } of issued) {
      expect(token).toMatch(/^t3xi_v1_[A-Za-z0-9_-]{43}$/);
      expect(tokenHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(tokenHash).not.toContain(token);
      expect(hashCollaborationInvitationToken(token)).toBe(tokenHash);
    }
  });

  it('rejects malformed, truncated, padded, and future-version tokens', () => {
    const valid = issueCollaborationInvitationToken().token;
    const malformed = [
      '',
      valid.slice(0, -1),
      `${valid}=`,
      valid.replace(COLLABORATION_INVITATION_TOKEN_PREFIX, 't3xi_v2_'),
      `${COLLABORATION_INVITATION_TOKEN_PREFIX}${'a'.repeat(42)}!`,
    ];

    for (const candidate of malformed) {
      expect(isCollaborationInvitationToken(candidate)).toBe(false);
      expect(hashCollaborationInvitationToken(candidate)).toBeNull();
    }
  });

  it('verifies exact tokens without accepting malformed stored hashes', () => {
    const issued = issueCollaborationInvitationToken();
    const other = issueCollaborationInvitationToken();

    expect(verifyCollaborationInvitationToken(issued.token, issued.tokenHash)).toBe(true);
    expect(verifyCollaborationInvitationToken(other.token, issued.tokenHash)).toBe(false);
    expect(verifyCollaborationInvitationToken(issued.token, 'sha256:not-hex')).toBe(false);
    expect(verifyCollaborationInvitationToken(issued.token, issued.tokenHash.toUpperCase())).toBe(
      false
    );
  });
});
