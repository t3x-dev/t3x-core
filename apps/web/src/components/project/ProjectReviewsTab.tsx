import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  GitMerge,
  GitPullRequestArrow,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
  evidence: string;
  blocker?: string;
  impact: string;
  actionLabel: string;
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
    evidence: '4 included sources, 1 extracted candidate tree, 2 suggested YOps.',
    blocker: 'Confirm /audience/primary before handoff.',
    impact: 'Updates reviewer audience and preserves non-goal constraints.',
    actionLabel: 'Open workspace review',
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
    evidence: 'Schema candidate passed syntax checks, but migration coverage is incomplete.',
    blocker: '3 existing nodes need migration.',
    impact: 'Blocks promotion of PRD Schema v3 as the project default.',
    actionLabel: 'Review schema impact',
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
    evidence: 'YOps validation passed, no schema gaps, diff is ready for commit.',
    impact: 'Commits release-note cleanup into main with provenance retained.',
    actionLabel: 'Review merge',
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
            Project-level decision queue for workspace candidates, schema upgrades, and merge
            reviews.
          </p>
        </div>

        <div className="grid gap-3">
          {REVIEW_ROWS.map((review) => (
            <article
              className="min-w-0 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4"
              key={review.id}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-start">
                <div className="min-w-0">
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

                  <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                    <ReviewMeta label="Base" value={review.baseCommit} mono />
                    <ReviewMeta label="Branch" value={review.targetBranch} mono />
                    <ReviewMeta label="Schema" value={review.schemaVersion} />
                  </dl>
                </div>

                <div className="flex flex-col gap-3 lg:items-end">
                  <ReviewDecision review={review} />
                  <Button
                    aria-label={`${review.actionLabel}: ${review.title}`}
                    className="w-full lg:w-auto"
                    size="sm"
                    type="button"
                    variant={review.status === 'ready' ? 'commit' : 'canvas-outline'}
                  >
                    {review.actionLabel}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
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
    <div className="min-w-0">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd
        className={
          mono
            ? 'mt-1 truncate font-mono text-[var(--text-primary)]'
            : 'mt-1 truncate text-[var(--text-primary)]'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function ReviewDecision({ review }: { review: ProjectReviewRow }) {
  const hasBlocker = Boolean(review.blocker);

  return (
    <div className="w-full border-t border-[var(--stroke-divider)] pt-3 lg:w-[180px] lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
      <div className="flex items-center gap-2">
        {hasBlocker ? (
          <AlertTriangle aria-hidden="true" className="h-4 w-4 text-[var(--status-warning)]" />
        ) : (
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[var(--status-success)]" />
        )}
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          Decision
        </p>
      </div>

      <p className="mt-2 text-sm font-semibold leading-5 text-[var(--text-primary)]">
        {hasBlocker ? review.blocker : 'Ready for decision'}
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{review.impact}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">{review.evidence}</p>
    </div>
  );
}
