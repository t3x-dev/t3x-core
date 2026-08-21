'use client';

import { ArrowLeft, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
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
                {projection?.title ?? 'Workspace change review'}
              </h1>
              <Badge variant="commit-subtle">Immutable snapshot</Badge>
              {projection ? <Badge variant="outline">{projection.status}</Badge> : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Changes is the review and decision surface backed by an immutable ReviewSnapshot.
              Workspace remains the editable draft and preparation surface.
            </p>
          </div>
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
        <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-[var(--accent-commit)]"
            />
            <div className="min-w-0 text-xs leading-5 text-[var(--text-secondary)]">
              <p className="font-semibold text-[var(--text-primary)]">
                ChangeProjection is not authoritative.
              </p>
              <p>
                It is a task-oriented view over snapshot facts: project, workspace, Transition,
                policy, review digest, object descriptors, checks, and action capability.
              </p>
            </div>
          </div>
        </section>

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
