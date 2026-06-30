import { FileCheck2, GitMerge, GitPullRequestArrow, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type ProjectReviewKind = 'workspace_candidate' | 'schema_upgrade' | 'merge_review';

interface ProjectReviewRow {
  id: string;
  title: string;
  kind: ProjectReviewKind;
  status: 'ready' | 'reviewing' | 'blocked';
  baseCommit: string;
  targetBranch: string;
  schemaVersion: string;
  summary: string;
  impact?: string;
}

const REVIEW_KIND_LABELS: Record<ProjectReviewKind, string> = {
  workspace_candidate: 'Workspace candidate review',
  schema_upgrade: 'Schema upgrade review',
  merge_review: 'Merge review',
};

const REVIEW_STATUS_BADGES: Record<ProjectReviewRow['status'], 'branch' | 'pending' | 'warning'> = {
  ready: 'branch',
  reviewing: 'pending',
  blocked: 'warning',
};

const REVIEW_ROWS: ProjectReviewRow[] = [
  {
    id: 'review_prd_candidate',
    title: 'PRD audience handoff',
    kind: 'workspace_candidate',
    status: 'reviewing',
    baseCommit: 'sha:6de18a0',
    targetBranch: 'main',
    schemaVersion: 'PRD Schema v2',
    summary: 'Candidate state changes from chat and document sources before YOps apply.',
  },
  {
    id: 'review_schema_upgrade',
    title: 'PRD Schema v3 rollout',
    kind: 'schema_upgrade',
    status: 'blocked',
    baseCommit: 'sha:6de18a0',
    targetBranch: 'schema/prd-v3',
    schemaVersion: 'PRD Schema v2 -> v3',
    summary: 'Review draft schema impact before setting the next project default.',
    impact: 'Impact: 3 existing nodes need migration.',
  },
  {
    id: 'review_merge_release',
    title: 'Release note cleanup merge',
    kind: 'merge_review',
    status: 'ready',
    baseCommit: 'sha:12cc0d4',
    targetBranch: 'main',
    schemaVersion: 'Release Note Schema v1',
    summary: 'Merge review with deterministic YOps check ready for final commit.',
  },
];

export function ProjectReviewsTab() {
  return (
    <section className="h-full overflow-auto p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <FileCheck2 aria-hidden="true" className="h-4 w-4 text-[var(--status-info)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Project reviews</h2>
          </div>
          <p className="text-sm leading-5 text-[var(--text-secondary)]">
            Review queues stay project-scoped and separate workspace candidates, schema upgrades,
            and merge decisions.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {REVIEW_ROWS.map((review) => (
            <article
              className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4"
              key={review.id}
            >
              <div className="flex items-start gap-3">
                <ReviewIcon kind={review.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {review.title}
                    </h3>
                    <Badge variant={REVIEW_STATUS_BADGES[review.status]}>{review.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">
                    {REVIEW_KIND_LABELS[review.kind]}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">
                {review.summary}
              </p>

              <dl className="mt-3 grid gap-2 text-xs">
                <ReviewMeta label="Base commit" value={review.baseCommit} mono />
                <ReviewMeta label="Target branch" value={review.targetBranch} mono />
                <ReviewMeta label="Schema" value={review.schemaVersion} />
              </dl>

              {review.impact ? (
                <p className="mt-3 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-3 py-2 text-xs leading-5 text-[var(--status-warning)]">
                  {review.impact}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReviewIcon({ kind }: { kind: ProjectReviewKind }) {
  const iconClass = 'h-4 w-4';
  const className =
    'mt-0.5 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-2 text-[var(--text-secondary)]';

  if (kind === 'schema_upgrade') {
    return (
      <span className={className}>
        <ShieldAlert aria-hidden="true" className={iconClass} />
      </span>
    );
  }

  if (kind === 'merge_review') {
    return (
      <span className={className}>
        <GitMerge aria-hidden="true" className={iconClass} />
      </span>
    );
  }

  return (
    <span className={className}>
      <GitPullRequestArrow aria-hidden="true" className={iconClass} />
    </span>
  );
}

function ReviewMeta({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={
          mono
            ? 'truncate font-mono text-[var(--text-primary)]'
            : 'truncate text-[var(--text-primary)]'
        }
      >
        {value}
      </dd>
    </div>
  );
}
