import type { ReviewSnapshotV1 } from '@t3x-dev/api-client';
import { ArrowRight } from 'lucide-react';

export function ChangeDecisionHandoff({
  reviewSnapshot,
}: {
  reviewSnapshot: ReviewSnapshotV1 | null;
}) {
  const href = reviewSnapshot
    ? reviewSnapshotHref(
        reviewSnapshot.projectId,
        reviewSnapshot.workspaceId,
        reviewSnapshot.snapshotId
      )
    : null;

  return (
    <aside
      aria-label="Changes decision handoff"
      className="flex flex-col gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Decide in Changes</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          This Workspace has produced an immutable ReviewSnapshot. Accept, reject, override, and
          commit actions now live in Changes so Web has one review lifecycle.
        </p>
      </div>
      {href ? (
        <a
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[var(--accent-commit)] px-3 text-xs font-semibold text-[var(--on-accent)] transition-colors hover:brightness-105"
          href={href}
        >
          Open Changes
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

function reviewSnapshotHref(projectId: string, workspaceId: string, snapshotId: string): string {
  return `/project/${encodePathSegment(projectId)}/changes/${encodePathSegment(
    workspaceId
  )}/${encodePathSegment(snapshotId)}`;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(safeDecodeURIComponent(value));
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
