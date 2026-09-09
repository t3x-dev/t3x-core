import type { ProjectVisibility, ProjectVisibilityActorKind } from '@t3x-dev/storage';
import type { Context } from 'hono';
import { isAuthenticationDisabled } from './auth-config';
import { getProjectAccessPrincipal } from './project-access';

/** Versioned host seam for operations that can admit projects into a namespace. */
export const PROJECT_LIFECYCLE_POLICY_VERSION = 1 as const;

export type ProjectLifecycleOperation = 'create' | 'import' | 'restore' | 'transfer' | 'clone';

export interface ProjectLifecycleAdmission {
  projectId: string;
  /** Null means the project was not previously owned by a namespace. */
  fromNamespaceId: string | null;
  fromVisibility: ProjectVisibility | null;
  toVisibility: ProjectVisibility;
}

export interface ProjectLifecyclePolicyInput {
  contractVersion: typeof PROJECT_LIFECYCLE_POLICY_VERSION;
  operation: ProjectLifecycleOperation;
  namespaceId: string;
  projects: readonly ProjectLifecycleAdmission[];
  actor: { kind: ProjectVisibilityActorKind; id: string };
}

/**
 * Host-owned orchestration seam for namespace project admission.
 *
 * Implementations must invoke `mutate` at most once. A hosted implementation
 * may reserve all required slots before mutation, then commit, release, or mark
 * those reservations uncertain. The OSS default intentionally has no limits.
 */
export interface ProjectLifecyclePolicy {
  execute<T>(input: ProjectLifecyclePolicyInput, mutate: () => Promise<T>): Promise<T>;
}

export class ProjectLifecyclePolicyDeniedError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 403 | 409 | 429 = 403
  ) {
    super(message);
    this.name = 'ProjectLifecyclePolicyDeniedError';
  }
}

export const allowAllProjectLifecyclePolicy: ProjectLifecyclePolicy = Object.freeze({
  execute: <T>(_input: ProjectLifecyclePolicyInput, mutate: () => Promise<T>) => mutate(),
});

export function getProjectLifecyclePolicy(context: Context): ProjectLifecyclePolicy {
  return context.get('projectLifecyclePolicy') ?? allowAllProjectLifecyclePolicy;
}

export function resolveProjectLifecycleActor(
  context: Context
): { kind: ProjectVisibilityActorKind; id: string } | null {
  const principal = getProjectAccessPrincipal(context);
  if (!principal) {
    return isAuthenticationDisabled() ? { kind: 'local', id: 'auth-disabled' } : null;
  }
  const kind = principal.principalKind ?? 'human';
  const id = kind === 'human' ? principal.userId : principal.keyId;
  return id ? { kind, id } : null;
}
