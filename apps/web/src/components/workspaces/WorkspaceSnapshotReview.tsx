'use client';

import type { TransitionViewV1 } from '@t3x-dev/core';
import { Box, GitBranch, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { checksHref } from '@/domain/project/checks';
import { getProjectIdHistoryPath, getProjectIdRepoPath } from '@/domain/project/repoPath';
import { workspaceCommitBlocker } from '@/domain/workspaces/changeDecision';
import { fieldChangeCount, fieldChangeGroups } from '@/domain/workspaces/changeFields';
import { workspaceReviewHref } from '@/domain/workspaces/reviewNavigation';
import { useReviewedFieldChanges } from '@/hooks/workspaces/useReviewedFieldChanges';
import { useWorkspaceReviewSnapshot } from '@/hooks/workspaces/useWorkspaceReviewSnapshot';
import { ChangeDecisionPanel } from './ChangeDecisionPanel';
import { ChangeReviewChanges } from './ChangeReviewChanges';
import { WorkspaceSchemaReviewPanel } from './WorkspaceSchemaReviewPanel';
import stageStyles from './WorkspaceStageHeader.module.css';
import { WorkspaceStageNavigation } from './WorkspaceStageNavigation';

export function WorkspaceSnapshotReview({
  projectId,
  snapshotId,
  workspaceId,
}: {
  projectId: string;
  snapshotId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const pane = useSearchParams().get('reviewPane');
  const { decide, load, overrideReason, setOverrideReason, state } = useWorkspaceReviewSnapshot(
    projectId,
    workspaceId,
    snapshotId
  );
  const snapshot = state.data?.snapshot ?? null;
  const view = snapshot?.transition?.mode === 'transition' ? snapshot.transition : null;
  const schemaReview = state.data?.schema_review;
  const liveFieldGroups = useReviewedFieldChanges(
    projectId,
    workspaceId,
    view && !schemaReview ? snapshot?.review.precondition.workspaceRevision : undefined
  );
  const fieldGroups = schemaReview
    ? fieldChangeGroups(schemaReview.baseContent, schemaReview.draftContent)
    : liveFieldGroups;
  const commit = snapshot?.objects?.commit?.digest;
  const branch = snapshot?.review.precondition.refName;
  const activeSnapshotId = snapshot?.snapshotId ?? snapshotId;
  const workspaceHref = workspaceReviewHref(projectId, workspaceId, { branch, pane });
  const reviewHref = workspaceReviewHref(projectId, workspaceId, {
    branch,
    pane,
    snapshotId: activeSnapshotId,
  });
  const composeHref = workspaceReviewHref(projectId, workspaceId, { branch, mode: 'compose' });
  const historyHref = getProjectIdHistoryPath(projectId, { branch, commit, returnTo: reviewHref });
  const stateHref =
    commit && branch
      ? `${getProjectIdRepoPath(projectId)}?${new URLSearchParams({ branch, commit, view: 'overview' }).toString()}`
      : null;

  useEffect(() => {
    if (snapshot && snapshot.snapshotId !== snapshotId) {
      router.replace(reviewHref, { scroll: false });
    }
  }, [snapshot, snapshotId, reviewHref, router]);

  return (
    <main className="h-full overflow-y-auto bg-[var(--workspace-bg)] text-[var(--text-primary)]">
      <div className={stageStyles.header}>
        <div className={stageStyles.identity}>
          <Box aria-hidden="true" />
          <span title={workspaceId}>Workspace</span>
        </div>
        {branch ? (
          <span className="inline-flex items-center gap-1 text-xs font-mono">
            <GitBranch className="size-3.5" aria-hidden="true" />
            {branch}
          </span>
        ) : null}
        <WorkspaceStageNavigation
          mode="review"
          onModeChange={(mode) => {
            if (mode === 'compose') router.push(composeHref);
          }}
        />
        <div className={stageStyles.meta}>
          <Link className={stageStyles.chatToggle} href={workspaceHref}>
            Current draft
          </Link>
        </div>
      </div>
      <header className="border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold text-[var(--text-primary)]">
                Review
              </h1>
              <Badge variant="commit-subtle">
                {snapshot
                  ? `Snapshot r${snapshot.review.precondition.workspaceRevision}`
                  : 'Fixed snapshot'}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              {commit
                ? 'This revision is saved. Open State to inspect or export it.'
                : view?.decision?.observation === 'supplied' && view.decision.outcome === 'rejected'
                  ? 'This revision was rejected. The decision is recorded and the branch was not changed.'
                  : 'Review this fixed revision, then approve and commit or reject it here. Run contains the detailed evidence.'}
            </p>
          </div>
          {stateHref ? (
            <Button asChild size="sm">
              <Link href={stateHref}>View State & export</Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href={historyHref}>{commit ? 'View commit in History' : 'View History'}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link
              href={checksHref(projectId, {
                recordId: `review:${activeSnapshotId}`,
                returnTo: reviewHref,
              })}
            >
              View run
            </Link>
          </Button>
          <Button
            disabled={state.loading || state.deciding}
            onClick={() => void load()}
            size="sm"
            type="button"
            variant="outline"
          >
            {state.loading ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 p-4">
        {snapshot ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-secondary)]">
            <span title={activeSnapshotId}>Snapshot {activeSnapshotId}</span>
            <Link
              className="underline"
              href={checksHref(projectId, { workspace: workspaceId, returnTo: reviewHref })}
            >
              Workspace check history
            </Link>
            {commit ? (
              <Link
                className="underline"
                href={workspaceReviewHref(projectId, workspaceId, {
                  branch,
                  tool: 'delivery',
                  returnTo: reviewHref,
                })}
              >
                Open Delivery
              </Link>
            ) : null}
          </div>
        ) : null}
        {state.error ? (
          <section
            aria-label="Change review unavailable"
            className="rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] p-4"
            role="alert"
          >
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Change review unavailable
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{state.error}</p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              If the Draft or branch has changed,{' '}
              <Link className="underline" href={workspaceHref}>
                open the current draft and prepare a new review
              </Link>
              . This snapshot stays available in Run.
            </p>
          </section>
        ) : null}

        {view ? (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_auto_1fr]">
            <div className="min-w-0 lg:col-start-1">
              <ChangeSummary
                branch={branch ?? null}
                fieldCount={fieldGroups ? fieldChangeCount(fieldGroups) : null}
                title={fieldGroups?.[0]?.label ?? null}
                view={view}
              />
            </div>
            <div className="min-w-0 lg:col-start-1">
              <WorkspaceSchemaReviewPanel
                review={state.data?.schema_review}
                historical={Boolean(commit)}
              />
              <ChangeReviewChanges groups={fieldGroups} operations={view.change.operations} />
            </div>
            <div className="lg:sticky lg:top-4 lg:col-start-2 lg:row-span-3 lg:row-start-1">
              <ChangeDecisionPanel
                branch={branch ?? null}
                busy={state.deciding || state.loading}
                onDecide={(outcome, reason) => void decide(outcome, reason)}
                onOverrideReasonChange={setOverrideReason}
                overrideReason={overrideReason}
                view={view}
                commitBlocker={workspaceCommitBlocker(state.data?.schema_review, view)}
                checksHref={checksHref(projectId, {
                  recordId: `review:${activeSnapshotId}`,
                  returnTo: reviewHref,
                })}
              />
            </div>
          </div>
        ) : state.loading ? (
          <section
            aria-label="Loading change review"
            className="flex min-h-28 items-center justify-center rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-sm text-[var(--text-secondary)]"
          >
            <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
            Loading change review
          </section>
        ) : null}
      </div>
    </main>
  );
}

function ChangeSummary({
  branch,
  fieldCount,
  title,
  view,
}: {
  branch: string | null;
  fieldCount: number | null;
  title: string | null;
  view: TransitionViewV1;
}) {
  const operationCount = view.change.operations.length;
  const claims = [
    { label: 'Purpose', claim: view.claims.intent },
    { label: 'Reason', claim: view.claims.rationale },
  ].flatMap(({ label, claim }) =>
    claim.mode !== 'unspecified' && claim.value ? [{ label, value: claim.value }] : []
  );
  return (
    <section
      aria-label="Change summary"
      className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3"
    >
      {title ? (
        <h2 className="text-lg font-semibold leading-7 text-[var(--text-primary)]">{title}</h2>
      ) : null}
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
        {fieldCount !== null ? `${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'} · ` : ''}
        {operationCount} {operationCount === 1 ? 'operation' : 'operations'}
        {branch ? (
          <>
            {' '}
            into{' '}
            <span className="font-mono font-semibold text-[var(--text-primary)]">{branch}</span>
          </>
        ) : null}
      </p>
      {claims.length > 0 ? (
        <dl className="mt-3 grid gap-2 border-t border-[var(--stroke-divider)] pt-3 text-xs sm:grid-cols-[80px_minmax(0,1fr)]">
          {claims.map(({ label, value }) => (
            <div className="contents" key={label}>
              <dt className="font-semibold text-[var(--text-tertiary)]">{label}</dt>
              <dd className="leading-5 text-[var(--text-primary)]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
