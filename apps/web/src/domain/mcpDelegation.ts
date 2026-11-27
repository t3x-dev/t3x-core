export const delegationModes = {
  read: 'Read only',
  prepare: 'Prepare changes for human review',
  commit: 'Submit eligible changes',
} as const;
export type DelegationMode = keyof typeof delegationModes;
export type DelegationDays = 1 | 7 | 30;

export const authorizationPage = '/settings/agent-access/authorize';
export const connectAgentPage = '/settings/agent-access';

export function isAgentEntry(pathname: string) {
  return pathname === authorizationPage || pathname === connectAgentPage;
}

/** Display suffix for matching two saved selections of the same repository and branch. */
export function selectionLabel(id: string) {
  return id.slice(-8);
}

export type AttemptStatus =
  | 'pending'
  | 'approved'
  | 'cancelled'
  | 'expired'
  | 'token_issued'
  | 'spent_without_token'
  | 'code_expired'
  | 'closed';

export interface DelegationConsent {
  status: AttemptStatus;
  previewVersion: string | null;
  account: { id: string; name: string };
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
  mode: DelegationMode;
  days: DelegationDays;
  branchOnly: boolean;
  priorGrant: { id: string; clientName: string } | null;
  preselections: { id: string; projectId: string; repository: string; branch: string }[];
}

export interface ConnectionChoices {
  clients: { id: string; name: string }[];
  repositories: { id: string; name: string }[];
}

export interface SavedSelection {
  id: string;
  expiresAt: string;
  launchUrl: string | null;
  resourceUrl?: string;
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
  previewVersion: string;
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
