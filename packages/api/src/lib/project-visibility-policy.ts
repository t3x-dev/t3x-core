import type {
  ChangeProjectVisibilityResult,
  ProjectVisibility,
  ProjectVisibilityActorKind,
} from '@t3x-dev/storage';

/** Versioned seam implemented by hosted compositions that enforce plan capacity. */
export const PROJECT_VISIBILITY_POLICY_VERSION = 1 as const;

export interface ProjectVisibilityPolicyInput {
  contractVersion: typeof PROJECT_VISIBILITY_POLICY_VERSION;
  projectId: string;
  namespaceId: string;
  fromVisibility: ProjectVisibility;
  toVisibility: ProjectVisibility;
  actor: { kind: ProjectVisibilityActorKind; id: string };
  publicationConfirmed: boolean;
}

export type ProjectVisibilityMutation = () => Promise<ChangeProjectVisibilityResult | null>;

/**
 * Host-owned orchestration seam for capacity reservation and publication policy.
 *
 * Implementations must invoke `mutate` at most once. Hosted implementations can
 * reserve capacity before it, release on mutation failure, and retain uncertain
 * reservations for reconciliation. The OSS default has no commercial limits.
 */
export interface ProjectVisibilityPolicy {
  execute(
    input: ProjectVisibilityPolicyInput,
    mutate: ProjectVisibilityMutation
  ): Promise<ChangeProjectVisibilityResult | null>;
}

export class ProjectVisibilityPolicyDeniedError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 403 | 409 | 429 = 403
  ) {
    super(message);
    this.name = 'ProjectVisibilityPolicyDeniedError';
  }
}

/** Self-hosted deployments retain unrestricted local policy while sharing the command contract. */
export const allowAllProjectVisibilityPolicy: ProjectVisibilityPolicy = Object.freeze({
  execute: (_input: ProjectVisibilityPolicyInput, mutate: ProjectVisibilityMutation) => mutate(),
});
