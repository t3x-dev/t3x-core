import { describe, expect, it } from 'vitest';
import { buildInvitationUrl, invitationTokenFromHash } from '@/domain/collaboration/invitationLink';

const TOKEN = `t3xi_v1_${'a'.repeat(43)}`;

describe('collaboration invitation links', () => {
  it('keeps the one-time token in the URL fragment', () => {
    expect(buildInvitationUrl('https://app.t3x.dev', TOKEN)).toBe(
      `https://app.t3x.dev/invite#token=${TOKEN}`
    );
  });

  it('extracts only a valid invitation token', () => {
    expect(invitationTokenFromHash(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(invitationTokenFromHash('#token=invalid')).toBeNull();
    expect(invitationTokenFromHash('')).toBeNull();
  });
});
