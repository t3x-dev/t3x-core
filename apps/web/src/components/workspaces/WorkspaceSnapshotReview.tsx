'use client';

import type { TransitionViewV1 } from '@t3x-dev/core';
import { Box, GitBranch, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { checksHref } from '@/domain/project/checks';
import { getProjectIdHistoryPath, getProjectIdRepoPath } from '@/domain/project/repoPath';
import { workspaceCommitBlocker } from '@/domain/workspaces/changeDecision';
import { fieldChangeCount, fieldChangeGroups } from '@/domain/workspaces/changeFields';
import { workspaceReviewHref } from '@/domain/workspaces/reviewNavigation';
import { useViewPreference } from '@/hooks/shared/useViewPreference';
import { useReviewedFieldChanges } from '@/hooks/workspaces/useReviewedFieldChanges';
import { useWorkspaceReviewSnapshot } from '@/hooks/workspaces/useWorkspaceReviewSnapshot';
import { ChangeDecisionPanel } from './ChangeDecisionPanel';
import { ChangeReviewChanges } from './ChangeReviewChanges';
import {
  WorkspaceReviewContentPreview,
  WorkspaceReviewSchemaView,
  WorkspaceReviewYaml,
} from './WorkspaceReviewDocuments';
import {
  useWorkspaceReviewSubject,
  WORKSPACE_REVIEW_VIEWS,
  WorkspaceReviewWorkbench,
  workspaceReviewPreferenceKey,
  workspaceReviewSubjectChanges,
} from './WorkspaceReviewWorkbench';
import { WorkspaceSchemaDiagnostics } from './WorkspaceSchemaDiagnostics';
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
  const rawPane = useSearchParams().get('reviewPane');
  const [preferredPane, rememberPane, paneReady] = useViewPreference(
    workspaceReviewPreferenceKey(projectId, workspaceId),
    WORKSPACE_REVIEW_VIEWS,
    'changes'
  );
  const pane = WORKSPACE_REVIEW_VIEWS.includes(rawPane as typeof preferredPane)
    ? (rawPane as typeof preferredPane)
    : preferredPane;
  const { decide, load, retryDecision, overrideReason, setOverrideReason, state } =
    useWorkspaceReviewSnapshot(projectId, workspaceId, snapshotId);
  const snapshot = state.data?.snapshot ?? null;
  const view = snapshot?.transition?.mode === 'transition' ? snapshot.transition : null;
  const schemaReview = state.data?.schema_review;
  const subjectChanges = workspaceReviewSubjectChanges(schemaReview);
  if (!schemaReview) {
    subjectChanges.content = Boolean(
      view?.change?.base?.digest &&
        view.change.result?.digest &&
        view.change.base.digest !== view.change.result.digest
    );
  }
  const [subject, setSubject] = useWorkspaceReviewSubject(projectId, workspaceId, subjectChanges);
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
    if (!paneReady) return;
    if (snapshot && snapshot.snapshotId !== snapshotId) {
      router.replace(reviewHref, { scroll: false });
    }
  }, [snapshot, snapshotId, reviewHref, router, paneReady]);

  const recoveryNotice = state.error ? (
    <section
      aria-label="Change review unavailable"
      className="rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] p-4"
      role="alert"
    >
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
        Change review unavailable
      </h2>
      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{state.error}</p>
      {state.recovery ? (
        <div className="mt-2 space-y-2 text-sm">
          <p>
            The original decision may already have been processed. Check its result or retry that
            same decision before taking another action.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={state.loading || state.deciding || !retryDecision}
            onClick={() => void retryDecision?.()}
          >
            Retry original decision
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          If the Draft or branch has changed,{' '}
          <Link className="underline" href={workspaceHref}>
            open the current draft and prepare a new review
          </Link>
          . This snapshot stays available in Run.
        </p>
      )}
    </section>
  ) : null;
  const decisionPanel = view ? (
    <ChangeDecisionPanel
      embedded
      contentValidation={schemaReview?.contentValidation}
      branch={branch ?? null}
      busy={
        state.deciding ||
        state.loading ||
        Boolean(state.recovery) ||
        Boolean(state.latestUnavailable)
      }
      onDecide={(outcome, reason) => void decide(outcome, reason)}
      onEdit={() => router.push(composeHref)}
      onOverrideReasonChange={setOverrideReason}
      overrideReason={overrideReason}
      view={view}
      commitBlocker={workspaceCommitBlocker(schemaReview, view)}
      checksHref={checksHref(projectId, {
        recordId: `review:${activeSnapshotId}`,
        returnTo: reviewHref,
      })}
    />
  ) : null;

  return (
    <main className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--workspace-bg)] text-[var(--text-primary)]">
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
      <WorkspaceReviewWorkbench
        title={
          <>
            Review ·{' '}
            {snapshot
              ? `Snapshot r${snapshot.review.precondition.workspaceRevision}`
              : 'Fixed snapshot'}
          </>
        }
        status={
          commit
            ? 'Committed. This snapshot stays available for reference.'
            : view?.decision?.observation === 'supplied' && view.decision.outcome === 'rejected'
              ? 'Rejected. The Draft is retained for editing; the branch was not changed.'
              : 'Fixed revision. Review Content and Schema, then approve and commit or reject.'
        }
        pane={pane}
        onPaneChange={(next) => {
          rememberPane(next);
          router.replace(
            workspaceReviewHref(projectId, workspaceId, {
              branch,
              pane: next,
              snapshotId: activeSnapshotId,
            }),
            { scroll: false }
          );
        }}
        subject={subject}
        subjectChanges={subjectChanges}
        onSubjectChange={setSubject}
        notice={recoveryNotice}
        actions={
          <>
            {stateHref ? (
              <Button asChild size="sm">
                <Link href={stateHref}>View State & export</Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={composeHref}>Edit in Compose</Link>
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
              )}{' '}
              Refresh
            </Button>
          </>
        }
        sidebar={
          <>
            {decisionPanel}
            <WorkspaceSchemaDiagnostics
              key={activeSnapshotId}
              projectId={projectId}
              workspaceId={workspaceId}
              frozen
              review={schemaReview}
            />
            {commit ? (
              <div className="mt-4 grid gap-2 text-xs">
                <Link className="underline" href={historyHref}>
                  View commit in History
                </Link>
              </div>
            ) : null}
          </>
        }
        details={
          snapshot ? (
            <>
              <dl>
                <dt>Snapshot</dt>
                <dd>{activeSnapshotId}</dd>
                {schemaReview ? (
                  <>
                    <dt>Base Schema</dt>
                    <dd>{schemaReview.base.schemaHash ?? schemaReview.base.status}</dd>
                    <dt>Reviewed Schema</dt>
                    <dd>{schemaReview.draft.schemaHash ?? schemaReview.draft.status}</dd>
                  </>
                ) : null}
                <dd>
                  <Link
                    href={checksHref(projectId, { workspace: workspaceId, returnTo: reviewHref })}
                  >
                    Workspace check history
                  </Link>
                </dd>
                {commit ? (
                  <dd>
                    <Link
                      href={workspaceReviewHref(projectId, workspaceId, {
                        branch,
                        tool: 'delivery',
                        returnTo: reviewHref,
                      })}
                    >
                      Open Delivery
                    </Link>
                  </dd>
                ) : null}
              </dl>
              {view ? (
                <ChangeSummary
                  branch={branch ?? null}
                  fieldCount={fieldGroups ? fieldChangeCount(fieldGroups) : null}
                  schemaChangeCount={schemaReview?.changes.length ?? 0}
                  title={fieldGroups?.[0]?.label ?? null}
                  view={view}
                />
              ) : null}
            </>
          ) : null
        }
      >
        {view ? (
          subject === 'schema' ? (
            <WorkspaceReviewSchemaView
              pane={pane}
              review={schemaReview}
              branch={branch ?? 'main'}
              frozen
            />
          ) : pane === 'rendered' ? (
            <WorkspaceReviewContentPreview value={schemaReview?.draftContent} frozen />
          ) : pane === 'yaml' ? (
            <WorkspaceReviewYaml
              base={schemaReview?.baseContent}
              result={schemaReview?.draftContent}
              branch={branch ?? 'main'}
              subject="Content"
              frozen
            />
          ) : (
            <ChangeReviewChanges
              groups={fieldGroups}
              operations={view.change.operations}
              operationsAsDetails
            />
          )
        ) : state.loading ? (
          <output className="text-sm">Loading change review</output>
        ) : null}
      </WorkspaceReviewWorkbench>
    </main>
  );
}

function ChangeSummary({
  branch,
  fieldCount,
  schemaChangeCount,
  title,
  view,
}: {
  branch: string | null;
  fieldCount: number | null;
  schemaChangeCount: number;
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
        {schemaChangeCount > 0 ? `${schemaChangeCount} Schema definition changes · ` : ''}
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
