import type { TransitionScope } from '@t3x-dev/core';
import type { RequestPrincipal } from './request-principal';

export const CLOUD_IDENTITY_COMPATIBILITY = Object.freeze({
  cloudAdapterVersion: 1,
  coreIdentityVersion: 1,
  sessionPortVersion: 1,
});

export interface CloudIdentityCompatibility {
  cloudAdapterVersion?: number;
  coreIdentityVersion: number;
  sessionPortVersion: number;
}

export interface CloudSessionIdentity {
  id: string;
  userId: string;
  accountId: string;
  expiresAt: string;
  revokedAt: string | null;
  allowedScopes: readonly TransitionScope[];
}

export interface CloudSessionPort {
  resolve(sessionId: string): Promise<CloudSessionIdentity | null>;
}

export interface ResolveCloudSessionInput {
  sessionId: string;
  coreScopes: readonly TransitionScope[];
  ingress: Extract<RequestPrincipal['ingress'], 'http' | 'websocket'>;
  evaluatedAt: string;
}

export function assertCloudIdentityCompatibility(actual: CloudIdentityCompatibility): void {
  if (
    (actual.cloudAdapterVersion !== undefined &&
      actual.cloudAdapterVersion !== CLOUD_IDENTITY_COMPATIBILITY.cloudAdapterVersion) ||
    actual.coreIdentityVersion !== CLOUD_IDENTITY_COMPATIBILITY.coreIdentityVersion ||
    actual.sessionPortVersion !== CLOUD_IDENTITY_COMPATIBILITY.sessionPortVersion
  ) {
    throw new Error(
      `Incompatible Cloud identity adapter: expected Core identity ${CLOUD_IDENTITY_COMPATIBILITY.coreIdentityVersion} and Session port ${CLOUD_IDENTITY_COMPATIBILITY.sessionPortVersion}`
    );
  }
}

export async function resolveCloudSessionPrincipal(
  sessions: CloudSessionPort,
  input: ResolveCloudSessionInput
): Promise<RequestPrincipal | null> {
  const session = await sessions.resolve(input.sessionId);
  if (!session || session.id !== input.sessionId || session.revokedAt !== null) return null;
  const evaluatedAt = Date.parse(input.evaluatedAt);
  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(evaluatedAt) || !Number.isFinite(expiresAt) || expiresAt <= evaluatedAt) {
    return null;
  }
  const allowed = new Set(session.allowedScopes);
  const scopes = input.coreScopes.filter((scope) => allowed.has(scope));
  const principal: RequestPrincipal = {
    subject: { kind: 'human', principal_id: session.userId },
    actor: { kind: 'human', id: `user:${session.userId}` },
    delegator: null,
    workspaceOwner: { kind: 'human', principal_id: session.userId },
    userId: session.userId,
    accountId: session.accountId,
    sessionId: session.id,
    credential: {
      kind: 'deployment',
      id: session.id,
      projectId: null,
      namespaceId: null,
    },
    scopes,
    ingress: input.ingress,
  };
  return Object.freeze({
    ...principal,
    subject: Object.freeze(principal.subject),
    actor: Object.freeze(principal.actor),
    workspaceOwner: Object.freeze(principal.workspaceOwner!),
    credential: Object.freeze(principal.credential),
    scopes: Object.freeze([...principal.scopes]),
  });
}
