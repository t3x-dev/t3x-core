import type { ReviewSnapshotV1 } from '@t3x-dev/api-client';
import { ArrowRight } from 'lucide-react';
import { workspaceReviewHref } from '@/domain/workspaces/reviewNavigation';

export function ChangeDecisionHandoff({
  reviewSnapshot,
  compact = false,
}: {
  reviewSnapshot: ReviewSnapshotV1 | null;
  compact?: boolean;
}) {
  const href = reviewSnapshot
    ? workspaceReviewHref(reviewSnapshot.projectId, reviewSnapshot.workspaceId, {
        snapshotId: reviewSnapshot.snapshotId,
        branch: reviewSnapshot.review.precondition.refName,
      })
    : null;

  return (
    <aside
      aria-label="Review snapshot handoff"
      className="flex flex-col gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Decide in Review</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          {compact
            ? 'Review the checks and decide whether to commit this revision.'
            : 'A fixed snapshot is ready. Open Workspace Review to approve and commit or reject this revision. Detailed evidence is available in Checks.'}
        </p>
      </div>
      {href ? (
        <a
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--accent-commit)] px-3 text-xs font-semibold text-[var(--on-accent)] transition-colors hover:brightness-105"
          style={{ color: 'var(--on-accent)' }}
          href={href}
        >
          Open Review
          <ArrowRight aria-hidden="true" className="size-4" />
        </a>
      ) : (
        <p className="rounded-md bg-[var(--surface-panel)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          Refresh the review if the ReviewSnapshot link is not available yet.
        </p>
      )}
    </aside>
  );
}
