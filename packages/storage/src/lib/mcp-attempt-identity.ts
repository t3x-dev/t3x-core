import { createHmac } from 'node:crypto';

export interface McpAttemptIdentity {
  issuer: string;
  resource: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
}

// Pre-v91 receipts did not retain their issuer. Preserve their closure across issuer changes.
export function attemptIdentity(
  identity: Omit<McpAttemptIdentity, 'issuer'>,
  issuer: string | null
) {
  return JSON.stringify([
    issuer,
    identity.resource,
    identity.clientId,
    identity.redirectUri,
    identity.challenge,
  ]);
}

export function attemptFingerprint(secret: string, identity: string) {
  return createHmac('sha256', Buffer.from(secret, 'hex')).update(identity).digest('base64url');
}
