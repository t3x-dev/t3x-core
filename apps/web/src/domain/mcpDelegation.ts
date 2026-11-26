export const delegationModes = {
  read: 'Read only',
  prepare: 'Prepare changes for human review',
  commit: 'Submit eligible changes',
} as const;
export type DelegationMode = keyof typeof delegationModes;
export type DelegationDays = 1 | 7 | 30;

export interface DelegationConsent {
  clientName: string;
  repositoryLocked: boolean;
  repositories: { id: string; name: string }[];
  selected: {
    id: string;
    name: string;
    branch: string;
    outcome: 'eligible' | 'protected' | 'policy' | 'read_only' | 'unknown' | 'draft_only';
    detail: string;
    readinessDetail?: string;
  } | null;
  scope: DelegationMode;
  task?: string;
}

export interface RepositoryDelegation {
  id: string;
  clientName: string;
  mode: DelegationMode;
  branch: string | null;
  expiresAt: string | null;
  revoked: boolean;
  needsPolicy?: boolean;
  legacy?: boolean;
}

export interface ConsentDecision {
  decision: 'approve' | 'cancel';
  projectId?: string;
  branch?: string;
  branchOnly: boolean;
  mode: DelegationMode;
  days: DelegationDays;
}

export interface DelegationUpdate {
  days: DelegationDays;
  mode: DelegationMode;
  branch: string | null;
}

export function permittedModes(scope: DelegationMode): DelegationMode[] {
  return scope === 'read'
    ? ['read']
    : scope === 'prepare'
      ? ['read', 'prepare']
      : ['read', 'prepare', 'commit'];
}
