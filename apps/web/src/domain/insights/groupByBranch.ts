import type { SemanticEntry } from '@/types/semantic';

export interface InsightsCommitLike {
  hash: string;
  branch?: string | null;
  committed_at: string;
  message?: string | null;
  project_id: string;
  author?: { type?: string; name?: string };
  content?: { trees?: unknown[] };
}

export interface InsightsLedgerInput {
  commit: InsightsCommitLike;
  entry: SemanticEntry;
  projectName: string;
}

export interface LedgerTimeBucket {
  id: 'today' | 'yesterday' | 'previous-7-days' | 'earlier';
  label: 'Today' | 'Yesterday' | 'Previous 7 days' | 'Earlier';
  order: number;
}

export interface LedgerCommit {
  author: string;
  branch: string;
  committed_at: string;
  entry: SemanticEntry;
  hash: string;
  message: string;
  treeCount: number;
}

export interface LedgerBucket {
  commits: LedgerCommit[];
  id: LedgerTimeBucket['id'];
  label: LedgerTimeBucket['label'];
}

export interface LedgerBranchGroup {
  branch: string;
  buckets: LedgerBucket[];
  commitCount: number;
  latestAt: string;
}

export interface LedgerProjectGroup {
  branchCount: number;
  branches: LedgerBranchGroup[];
  commitCount: number;
  latestAt: string;
  projectId: string;
  projectName: string;
}

export interface InsightsLedger {
  projects: LedgerProjectGroup[];
  totals: {
    branches: number;
    commits: number;
    projects: number;
  };
}

const EARLIER_BUCKET: LedgerTimeBucket = { id: 'earlier', label: 'Earlier', order: 3 };

export function shortCommitHash(hash: string) {
  return hash.startsWith('sha256:') ? hash.slice(7, 15) : hash.slice(0, 8);
}

export function commitEntryId(hash: string) {
  return hash.startsWith('sha256:') ? hash.slice(7, 19) : hash.slice(0, 12);
}

function dayIndex(date: Date) {
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000
  );
}

export function getLedgerTimeBucket(value: string, now = new Date()): LedgerTimeBucket {
  const nowDay = dayIndex(now);
  const valueDay = dayIndex(new Date(value));

  if (nowDay === null || valueDay === null) {
    return EARLIER_BUCKET;
  }

  const diffDays = Math.max(0, nowDay - valueDay);
  if (diffDays === 0) {
    return { id: 'today', label: 'Today', order: 0 };
  }
  if (diffDays === 1) {
    return { id: 'yesterday', label: 'Yesterday', order: 1 };
  }
  if (diffDays <= 7) {
    return { id: 'previous-7-days', label: 'Previous 7 days', order: 2 };
  }
  return EARLIER_BUCKET;
}

function timeValue(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareNewest(a: { latestAt: string }, b: { latestAt: string }) {
  return timeValue(b.latestAt) - timeValue(a.latestAt);
}

function commitToLedgerCommit({ commit, entry }: InsightsLedgerInput): LedgerCommit {
  return {
    author: commit.author?.name || commit.author?.type || 'unknown',
    branch: commit.branch || 'main',
    committed_at: commit.committed_at,
    entry,
    hash: commit.hash,
    message: commit.message || entry.title,
    treeCount: commit.content?.trees?.length ?? entry.evidenceCount,
  };
}

export function buildInsightsLedger(
  input: InsightsLedgerInput[],
  options: { now?: Date } = {}
): InsightsLedger {
  const now = options.now ?? new Date();
  const projects = new Map<string, { projectName: string; commits: LedgerCommit[] }>();

  for (const item of input) {
    const project = projects.get(item.commit.project_id) ?? {
      projectName: item.projectName,
      commits: [],
    };
    project.commits.push(commitToLedgerCommit(item));
    projects.set(item.commit.project_id, project);
  }

  const projectGroups: LedgerProjectGroup[] = Array.from(projects.entries()).map(
    ([projectId, project]) => {
      const branches = new Map<string, LedgerCommit[]>();
      for (const commit of project.commits) {
        const list = branches.get(commit.branch) ?? [];
        list.push(commit);
        branches.set(commit.branch, list);
      }

      const branchGroups: LedgerBranchGroup[] = Array.from(branches.entries()).map(
        ([branch, commits]) => {
          const buckets = new Map<LedgerTimeBucket['id'], LedgerBucket & { order: number }>();
          const sortedCommits = [...commits].sort(
            (a, b) => timeValue(b.committed_at) - timeValue(a.committed_at)
          );
          for (const commit of sortedCommits) {
            const bucketMeta = getLedgerTimeBucket(commit.committed_at, now);
            const bucket = buckets.get(bucketMeta.id) ?? {
              commits: [],
              id: bucketMeta.id,
              label: bucketMeta.label,
              order: bucketMeta.order,
            };
            bucket.commits.push(commit);
            buckets.set(bucketMeta.id, bucket);
          }

          return {
            branch,
            buckets: Array.from(buckets.values())
              .sort((a, b) => a.order - b.order)
              .map(({ order: _order, ...bucket }) => bucket),
            commitCount: commits.length,
            latestAt: sortedCommits[0]?.committed_at ?? '',
          };
        }
      );

      branchGroups.sort((a, b) => {
        if (a.branch === 'main') return -1;
        if (b.branch === 'main') return 1;
        return compareNewest(a, b) || a.branch.localeCompare(b.branch);
      });

      const latestAt = project.commits
        .map((commit) => commit.committed_at)
        .sort((a, b) => timeValue(b) - timeValue(a))[0];

      return {
        branchCount: branchGroups.length,
        branches: branchGroups,
        commitCount: project.commits.length,
        latestAt,
        projectId,
        projectName: project.projectName,
      };
    }
  );

  projectGroups.sort((a, b) => compareNewest(a, b) || a.projectName.localeCompare(b.projectName));

  return {
    projects: projectGroups,
    totals: {
      branches: projectGroups.reduce((sum, project) => sum + project.branchCount, 0),
      commits: input.length,
      projects: projectGroups.length,
    },
  };
}
