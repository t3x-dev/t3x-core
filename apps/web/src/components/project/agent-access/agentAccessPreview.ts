export const scenarios = {
  personal: 'Personal repository',
  protected: 'Independent review required',
  empty: 'Empty repository',
  offline: 'Client not connected',
  readonly: 'Read-only MCP service',
  policy: 'Existing grant missing a branch policy',
  completed: 'First commit returned',
} as const;

export type Scenario = keyof typeof scenarios;
export type Mode = 'commit' | 'prepare' | 'read';
export type Preview = {
  scenario: Scenario;
  stage: 'confirm' | 'active' | 'revoked';
  mode: Mode;
  branchOnly: boolean;
  days: string;
  expiresAt?: number;
};

export const initial: Preview = {
  scenario: 'personal',
  stage: 'confirm',
  mode: 'commit',
  branchOnly: false,
  days: '7',
};

// Each tab simulates one Codex delegation per repository. No credentials are stored.
const key = (repository: string) => `t3x.agent-access-demo.v1:${repository}`;
const memory = new Map<string, string>();

export function readDemoAccess(repository: string, branch: string, scenario?: Scenario): Preview {
  if (!repository || typeof window === 'undefined') return { ...initial };
  let raw: string | null;
  try {
    raw = memory.get(repository) ?? window.sessionStorage.getItem(key(repository));
  } catch {
    raw = memory.get(repository) ?? null;
  }
  if (!raw) {
    if (scenario === 'policy') {
      // This fixture starts where the UAT stopped, with a valid grant and a saved draft.
      const existing: Preview = {
        ...initial,
        scenario,
        stage: 'active',
        expiresAt: Date.now() + Number(initial.days) * 86_400_000,
      };
      writeDemoAccess(repository, branch, existing);
      return existing;
    }
    return { ...initial };
  }
  try {
    const { branch: grantedBranch, grant } = JSON.parse(raw);
    if (
      typeof grantedBranch !== 'string' ||
      !grant ||
      !Object.hasOwn(scenarios, grant.scenario) ||
      !['confirm', 'active', 'revoked'].includes(grant.stage) ||
      !['read', 'prepare', 'commit'].includes(grant.mode) ||
      !['1', '7', '30'].includes(grant.days) ||
      typeof grant.branchOnly !== 'boolean' ||
      (grant.branchOnly && grantedBranch !== branch)
    )
      return { ...initial };
    if (
      grant.stage === 'active' &&
      (!Number.isFinite(grant.expiresAt) || grant.expiresAt <= Date.now())
    ) {
      return { ...grant, stage: 'confirm', expiresAt: undefined };
    }
    return grant;
  } catch {
    return { ...initial };
  }
}

export function writeDemoAccess(repository: string, branch: string, grant: Preview): void {
  if (!repository || typeof window === 'undefined') return;
  const saved =
    grant.stage === 'active' && grant.expiresAt === undefined
      ? { ...grant, expiresAt: Date.now() + Number(grant.days) * 86_400_000 }
      : grant;
  const record = JSON.stringify({ branch, grant: saved });
  try {
    window.sessionStorage.setItem(key(repository), record);
    memory.delete(repository);
  } catch {
    memory.set(repository, record);
  }
}
