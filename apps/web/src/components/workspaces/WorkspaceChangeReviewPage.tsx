'use client';

import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWorkspaceReviewSnapshot } from '@/hooks/workspaces/useWorkspaceReviewSnapshot';
import { TransitionDecisionControls } from './TransitionDecisionControls';
import { TransitionReviewPanel } from './TransitionReviewPanel';

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
  const workspaceHref = workspaceReviewHref(normalizedProjectId, normalizedWorkspaceId);
  const projection = state.data?.change_projection ?? null;
  const snapshot = state.data?.snapshot ?? null;
  const commit = snapshot?.objects?.commit?.digest;
  const stateHref = commit
    ? `/project/${encodePathSegment(normalizedProjectId)}?${new URLSearchParams({ commit, view: 'overview' }).toString()}`
    : null;

  useEffect(() => {
    if (snapshot && snapshot.snapshotId !== normalizedSnapshotId) {
      router.replace(
        `/project/${encodePathSegment(normalizedProjectId)}/changes/${encodePathSegment(normalizedWorkspaceId)}/${encodePathSegment(snapshot.snapshotId)}`
      );
    }
  }, [snapshot, normalizedSnapshotId, normalizedProjectId, normalizedWorkspaceId, router]);

  return (
    <main className="min-h-screen bg-[var(--workspace-bg)] text-[var(--text-primary)]">
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
              {projection ? <Badge variant="outline">{projection.status}</Badge> : null}
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

        <TransitionReviewPanel
          changeProjection={projection}
          error={null}
          loading={state.loading}
          reviewSnapshot={snapshot}
          view={snapshot?.transition ?? null}
        />

        {snapshot?.transition ? (
          <TransitionDecisionControls
            busy={state.deciding}
            onDecide={(outcome, reason) => void decide(outcome, reason)}
            onOverrideReasonChange={setOverrideReason}
            overrideReason={overrideReason}
            view={snapshot.transition}
          />
        ) : null}
      </div>
    </main>
  );
}

function workspaceReviewHref(projectId: string, workspaceId: string): string {
  const params = new URLSearchParams({
    tab: 'workspaces',
    workspace: safeDecodeURIComponent(workspaceId),
  });
  return `/project/${encodePathSegment(projectId)}/workspaces?${params.toString()}`;
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
