'use client';

import type { TransitionViewV1 } from '@t3x-dev/core';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fieldChangeCount } from '@/domain/workspaces/changeFields';
import { useReviewedFieldChanges } from '@/hooks/workspaces/useReviewedFieldChanges';
import { useWorkspaceReviewSnapshot } from '@/hooks/workspaces/useWorkspaceReviewSnapshot';
import { ChangeDecisionPanel } from './ChangeDecisionPanel';
import { ChangeReviewChanges } from './ChangeReviewChanges';
import { TransitionAuditDetails } from './TransitionReviewPanel';

export function WorkspaceChangeReviewPage({
  projectId,
  snapshotId,
  workspaceId,
}: {
  projectId: string;
  snapshotId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const normalizedProjectId = safeDecodeURIComponent(projectId);
  const normalizedSnapshotId = safeDecodeURIComponent(snapshotId);
  const normalizedWorkspaceId = safeDecodeURIComponent(workspaceId);
  const { decide, load, overrideReason, setOverrideReason, state } = useWorkspaceReviewSnapshot(
    normalizedProjectId,
    normalizedWorkspaceId,
    normalizedSnapshotId
  );
  const projection = state.data?.change_projection ?? null;
  const snapshot = state.data?.snapshot ?? null;
  const view = snapshot?.transition?.mode === 'transition' ? snapshot.transition : null;
  const fieldGroups = useReviewedFieldChanges(
    normalizedProjectId,
    normalizedWorkspaceId,
    view ? snapshot?.review.precondition.workspaceRevision : undefined
  );
  const commit = snapshot?.objects?.commit?.digest;
  const branch = snapshot?.review.precondition.refName;
  const workspaceHref = workspaceReviewHref(normalizedProjectId, normalizedWorkspaceId, branch);
  const stateHref =
    commit && branch
      ? `/project/${encodePathSegment(normalizedProjectId)}?${new URLSearchParams({ branch, commit, view: 'overview' }).toString()}`
      : null;

  useEffect(() => {
    if (snapshot && snapshot.snapshotId !== normalizedSnapshotId) {
      router.replace(
        `/project/${encodePathSegment(normalizedProjectId)}/changes/${encodePathSegment(normalizedWorkspaceId)}/${encodePathSegment(snapshot.snapshotId)}`
      );
    }
  }, [snapshot, normalizedSnapshotId, normalizedProjectId, normalizedWorkspaceId, router]);

  return (
    <main className="min-h-full bg-[var(--workspace-bg)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-3">
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--stroke-strong)] hover:text-[var(--text-primary)]"
            href={workspaceHref}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Workspace
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold text-[var(--text-primary)]">
                {commit ? 'Saved change' : 'Review Workspace change'}
              </h1>
              <Badge variant="commit-subtle">Immutable snapshot</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              {commit
                ? 'This revision is saved. Open State to inspect or export it.'
                : 'Review the changes and checks before saving to the branch.'}
            </p>
          </div>
          {stateHref ? (
            <Button asChild size="sm">
              <Link href={stateHref}>View State & export</Link>
            </Button>
          ) : null}
          <Button
            disabled={state.loading}
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
            <div className="lg:sticky lg:top-4 lg:col-start-2 lg:row-span-3 lg:row-start-1">
              <ChangeDecisionPanel
                branch={branch ?? null}
                busy={state.deciding}
                onDecide={(outcome, reason) => void decide(outcome, reason)}
                onOverrideReasonChange={setOverrideReason}
                overrideReason={overrideReason}
                view={view}
              />
            </div>
            <div className="min-w-0 lg:col-start-1">
              <ChangeReviewChanges groups={fieldGroups} operations={view.change.operations} />
            </div>
            <TransitionAuditDetails
              changeProjection={projection}
              className="min-w-0 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3 lg:col-start-1"
              reviewSnapshot={snapshot}
              view={view}
            />
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

function workspaceReviewHref(projectId: string, workspaceId: string, branch?: string): string {
  const params = new URLSearchParams({
    tab: 'workspaces',
    workspace: safeDecodeURIComponent(workspaceId),
    workspaceMode: 'review',
  });
  if (branch) params.set('branch', branch);
  return `/project/${encodePathSegment(projectId)}?${params.toString()}`;
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
