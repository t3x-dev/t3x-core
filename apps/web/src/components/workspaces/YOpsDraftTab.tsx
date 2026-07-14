import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  GitCommitHorizontal,
  Loader2,
  Play,
  ScrollText,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWorkspaceCommit } from '@/hooks/workspaces/useWorkspaceCommit';
import { useWorkspaceYOps } from '@/hooks/workspaces/useWorkspaceYOps';
import type {
  WorkspaceCandidate,
  WorkspaceSchemaFieldStatus,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type { WorkspaceYOp, WorkspaceYOpsTreeNode } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';
import { ChangeReviewDock } from './ChangeReviewDock';

export type WorkspaceYOpsFlowView = 'ops' | 'validation' | 'preview' | 'commit';

export function YOpsDraftTab({
  candidate,
  flowError,
  onCommitted,
  onSendToYOps,
  sendingToYOps,
  view = 'ops',
  yopsDraftSent,
}: {
  candidate: WorkspaceCandidate;
  flowError?: string;
  onCommitted?: (commitHash: string) => void;
  onSendToYOps?: () => Promise<void> | void;
  sendingToYOps?: boolean;
  view?: WorkspaceYOpsFlowView;
  yopsDraftSent?: boolean;
}) {
  const draft = candidate.yopsDraft;
  const [status, setStatus] = useState<
    'idle' | 'generating' | 'generated' | 'applying' | 'applied' | 'committing' | 'committed'
  >(candidate.lastCommitHash ? 'committed' : 'idle');
  const [generatedYOps, setGeneratedYOps] = useState<WorkspaceYOp[] | null>(null);
  const [baselineTrees, setBaselineTrees] = useState<WorkspaceYOpsTreeNode[] | null>(null);
  const [validatedPreviewTrees, setValidatedPreviewTrees] = useState<
    WorkspaceYOpsTreeNode[] | null
  >(null);
  const [validationPassed, setValidationPassed] = useState(false);
  const [materializedTrees, setMaterializedTrees] = useState<WorkspaceYOpsTreeNode[] | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [committedHash, setCommittedHash] = useState(candidate.lastCommitHash ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [targetBranch, setTargetBranch] = useState(getInitialTargetBranch(candidate));

  const commitCandidate = useMemo(
    () => ({ ...candidate, targetBranch }),
    [candidate, targetBranch]
  );
  const { commit } = useWorkspaceCommit(commitCandidate);
  const { rootKey, validate } = useWorkspaceYOps(candidate);
  const branchOptions = useMemo(() => getCommitBranchOptions(candidate), [candidate]);
  const yopsLines = generatedYOps
    ? buildYOpsCommandLines(generatedYOps)
    : buildYOpsScriptLines(draft.operations, rootKey);
  const changedPaths = useMemo(
    () =>
      new Set(
        generatedYOps
          ? generatedYOps.map(yopPreviewPath)
          : draft.operations.map((op) => operationPreviewPath(op, rootKey))
      ),
    [draft.operations, generatedYOps, rootKey]
  );
  const treeLines = materializedTrees ? buildTreeNodeLines(materializedTrees, changedPaths) : [];
  const pendingCount = Math.max(draft.operations.length - appliedCount, 0);
  const isBusy = status === 'generating' || status === 'applying' || status === 'committing';
  const validationPrerequisitesMet =
    candidate.schemaReview.gaps.length === 0 &&
    candidate.schemaReview.verdict === 'ready' &&
    candidate.sourceBundle.length > 0;
  const canValidateProposal =
    draft.operations.length > 0 && !isBusy && !committedHash && validationPrerequisitesMet;
  const canApplyYOps = Boolean(generatedYOps) && status !== 'idle' && !isBusy && !committedHash;
  const statusText = getYOpsStatusText(status);
  const visibleErrorMessage = errorMessage ?? flowError ?? null;
  const validationBlocked = !validationPrerequisitesMet || Boolean(visibleErrorMessage);
  const canCommit =
    appliedCount > 0 &&
    Boolean(materializedTrees) &&
    validationPassed &&
    !isBusy &&
    !committedHash &&
    !validationBlocked;
  const proposalMode = formatProposalMode(draft.proposalMode ?? 'fixture');
  const extractYOpsTitle = getExtractYOpsTitle({
    committedHash,
    isBusy,
    operationCount: draft.operations.length,
    validationBlocked,
  });
  const applyYOpsTitle = getApplyYOpsTitle({
    committedHash,
    generated: Boolean(generatedYOps),
    isBusy,
  });
  const commitTitle = getCommitTitle({
    appliedCount,
    committedHash,
    isBusy,
    targetBranch,
    validationReady: validationPassed && !validationBlocked,
  });

  useEffect(() => {
    if (!candidate.lastCommitHash) return;
    setCommittedHash(candidate.lastCommitHash);
    setStatus('committed');
  }, [candidate.lastCommitHash]);

  useEffect(() => {
    setTargetBranch(getInitialTargetBranch(candidate));
  }, [candidate.id, candidate.targetBranch]);

  async function handleGenerate() {
    setStatus('generating');
    setErrorMessage(null);
    try {
      const result = await validate();
      setGeneratedYOps(result.yops);
      setBaselineTrees(result.baselineTrees);
      setValidatedPreviewTrees(result.previewTrees ?? null);
      setValidationPassed(result.ok);
      setAppliedCount(0);
      setMaterializedTrees(null);
      if (!result.ok) {
        setStatus('idle');
        setErrorMessage(
          `${result.error?.code ?? 'YOPS_INVALID'}: ${result.error?.message ?? 'YOps validation failed'}`
        );
        return;
      }
      setStatus('generated');
    } catch (error) {
      setValidationPassed(false);
      setStatus('idle');
      setErrorMessage(error instanceof Error ? error.message : 'YOps generation failed');
    }
  }

  async function handleApply() {
    setStatus('applying');
    setErrorMessage(null);
    try {
      const result = await validate();
      setGeneratedYOps(result.yops);
      setBaselineTrees(result.baselineTrees);
      setValidatedPreviewTrees(result.previewTrees ?? null);
      setValidationPassed(result.ok);
      if (!result.ok || !result.previewTrees) {
        setStatus('generated');
        setErrorMessage(
          `${result.error?.code ?? 'YOPS_INVALID'}: ${result.error?.message ?? 'YOps validation failed'}`
        );
        return;
      }
      setMaterializedTrees(result.previewTrees);
      setAppliedCount(result.applied);
      setStatus('applied');
    } catch (error) {
      setValidationPassed(false);
      setStatus(generatedYOps ? 'generated' : 'idle');
      setErrorMessage(error instanceof Error ? error.message : 'YOps apply failed');
    }
  }

  async function handleCommit() {
    if (!materializedTrees || !canCommit) return;
    setStatus('committing');
    setErrorMessage(null);

    try {
      const hash = await commit(materializedTrees);
      setCommittedHash(hash);
      setStatus('committed');
      onCommitted?.(hash);
    } catch (error) {
      setStatus('applied');
      setErrorMessage(error instanceof Error ? error.message : 'Workspace commit failed');
    }
  }

  return (
    <div className="flex min-h-[620px] flex-col overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--workspace-panel)]">
      <header className="flex min-h-10 items-center gap-3 border-b border-[var(--stroke-divider)] px-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {getYOpsViewTitle(view)}
          </h3>
          <p className="truncate text-xs text-[var(--text-tertiary)]">
            {getYOpsViewDescription(view)}
          </p>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Badge
            className="border-[var(--accent-extract)]/30 bg-[var(--accent-extract)]/10 text-[var(--accent-extract)]"
            variant="outline"
          >
            {proposalMode}
          </Badge>
          <Badge variant="commit-subtle">Materialized {appliedCount}</Badge>
          <Badge variant="pending-subtle">Pending {pendingCount}</Badge>
          {yopsDraftSent ? <Badge variant="pending-subtle">Proposal ready</Badge> : null}
          {committedHash ? <Badge variant="commit">{shortHash(committedHash)}</Badge> : null}
          <span className="max-w-[180px] truncate text-[10px] font-medium text-[var(--text-tertiary)]">
            {statusText}
          </span>
        </div>
      </header>

      {visibleErrorMessage ? (
        <div
          className="flex items-start gap-2 border-b border-[var(--stroke-divider)] bg-[var(--diff-modified-bg)] px-3 py-2 text-xs text-[var(--text-secondary)]"
          role="alert"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]"
          />
          <span className="min-w-0 break-words">{visibleErrorMessage}</span>
        </div>
      ) : null}

      {view === 'ops' ? (
        <OpsReviewView
          draftOperations={draft.operations}
          onSendToYOps={onSendToYOps}
          proposalMode={proposalMode}
          sendingToYOps={Boolean(sendingToYOps)}
          yopsDraftSent={Boolean(yopsDraftSent)}
          yopsLines={yopsLines}
        />
      ) : null}

      {view === 'validation' ? (
        <ValidationReviewView
          applyYOpsTitle={applyYOpsTitle}
          canApplyYOps={canApplyYOps}
          canValidateProposal={canValidateProposal}
          candidate={candidate}
          extractYOpsTitle={extractYOpsTitle}
          generatedYOpsCount={generatedYOps?.length ?? 0}
          onApply={handleApply}
          onValidate={handleGenerate}
          status={status}
          visibleErrorMessage={visibleErrorMessage}
        />
      ) : null}

      {view === 'preview' ? (
        <PreviewReviewView
          appliedCount={appliedCount}
          baselineTrees={baselineTrees}
          candidate={candidate}
          committedHash={committedHash}
          generatedYOpsCount={generatedYOps?.length ?? draft.operations.length}
          yopsExtracted={Boolean(generatedYOps)}
          materializedTrees={materializedTrees}
          treeLines={treeLines}
          validatedPreviewTrees={validatedPreviewTrees}
          validationPassed={validationPassed}
          visibleErrorMessage={visibleErrorMessage}
        />
      ) : null}

      {view === 'commit' ? (
        <CommitReviewView
          appliedCount={appliedCount}
          branchOptions={branchOptions}
          candidate={candidate}
          canCommit={canCommit}
          commitTitle={commitTitle}
          committedHash={committedHash}
          isBusy={isBusy}
          onCommit={handleCommit}
          onTargetBranchChange={setTargetBranch}
          status={status}
          targetBranch={targetBranch}
          validationReady={validationPassed && !validationBlocked}
        />
      ) : null}
    </div>
  );
}

function OpsReviewView({
  draftOperations,
  onSendToYOps,
  proposalMode,
  sendingToYOps,
  yopsDraftSent,
  yopsLines,
}: {
  draftOperations: WorkspaceYOpsDraftOperation[];
  onSendToYOps?: () => Promise<void> | void;
  proposalMode: string;
  sendingToYOps: boolean;
  yopsDraftSent: boolean;
  yopsLines: string[];
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section
        aria-label="YOps proposal"
        className="flex min-h-[360px] min-w-0 flex-col border-b border-[var(--stroke-divider)] lg:border-r lg:border-b-0"
      >
        <PaneHeader
          icon={<ScrollText aria-hidden="true" className="size-4 text-[var(--accent-extract)]" />}
          label="YOps proposal"
          meta={`${draftOperations.length} ops`}
        />
        <CodePane lines={yopsLines} />
      </section>

      <aside aria-label="Ops cards" className="flex min-h-[360px] min-w-0 flex-col">
        <PaneHeader
          icon={<ScrollText aria-hidden="true" className="size-4 text-[var(--accent-extract)]" />}
          label="Ops cards"
          meta={proposalMode}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
          {draftOperations.length > 0 ? (
            draftOperations.map((operation) => (
              <article
                className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
                key={operation.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{operation.op}</Badge>
                  <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                    {operation.path}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                  {operation.summary}
                </p>
                {operation.reason ? (
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                    {operation.reason}
                  </p>
                ) : null}
              </article>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-6 text-center text-sm text-[var(--text-secondary)]">
              No proposed YOps operations yet.
            </div>
          )}
        </div>
        {onSendToYOps ? (
          <footer className="border-t border-[var(--stroke-divider)] p-3">
            <Button
              className="w-full bg-[var(--accent-extract)] text-[var(--on-accent)] hover:bg-[var(--accent-extract)]/90"
              disabled={sendingToYOps}
              onClick={onSendToYOps}
              type="button"
            >
              {sendingToYOps
                ? 'Generating proposal...'
                : yopsDraftSent
                  ? 'Regenerate YOps proposal'
                  : 'Generate YOps proposal'}
            </Button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

function ValidationReviewView({
  applyYOpsTitle,
  canApplyYOps,
  canValidateProposal,
  candidate,
  extractYOpsTitle,
  generatedYOpsCount,
  onApply,
  onValidate,
  status,
  visibleErrorMessage,
}: {
  applyYOpsTitle: string;
  canApplyYOps: boolean;
  canValidateProposal: boolean;
  candidate: WorkspaceCandidate;
  extractYOpsTitle: string;
  generatedYOpsCount: number;
  onApply: () => void;
  onValidate: () => void;
  status: 'idle' | 'generating' | 'generated' | 'applying' | 'applied' | 'committing' | 'committed';
  visibleErrorMessage: string | null;
}) {
  const blockingIssues = [
    ...candidate.schemaReview.gaps.map((gap) => ({ label: 'Schema review gap', message: gap })),
    ...(visibleErrorMessage ? [{ label: 'Flow error', message: visibleErrorMessage }] : []),
  ];
  const passedCount =
    (candidate.sourceBundle.length > 0 ? 1 : 0) +
    (candidate.schemaReview.verdict === 'ready' ? 1 : 0) +
    (candidate.yopsDraft.operations.length > 0 ? 1 : 0) +
    (generatedYOpsCount > 0 || status === 'applied' || status === 'committed' ? 1 : 0);

  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section
        aria-label="Validation gates"
        className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
      >
        <div className="grid gap-2 sm:grid-cols-4">
          <ValidationMetric
            label="Blocking"
            tone={blockingIssues.length > 0 ? 'warning' : 'success'}
            value={`${blockingIssues.length}`}
          />
          <ValidationMetric label="Passed" tone="success" value={`${passedCount}`} />
          <ValidationMetric
            label="Review"
            tone={candidate.schemaReview.verdict === 'ready' ? 'success' : 'warning'}
            value={candidate.schemaReview.verdict === 'ready' ? '0' : '1'}
          />
          <ValidationMetric
            label="Info"
            tone="neutral"
            value={`${candidate.sourceBundle.length}`}
          />
        </div>

        <div className="mt-3 grid gap-2">
          <GateRow
            label="Schema gate"
            passed={
              candidate.schemaReview.verdict === 'ready' && candidate.schemaReview.gaps.length === 0
            }
          />
          <GateRow label="Evidence gate" passed={candidate.sourceBundle.length > 0} />
          <GateRow label="Replay gate" passed={candidate.yopsDraft.operations.length > 0} />
          <GateRow
            label="YOps validation"
            passed={generatedYOpsCount > 0 || status === 'applied' || status === 'committed'}
          />
        </div>

        <div className="mt-4 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Schema review</h4>
          <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
            {candidate.schemaCandidate.summary}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
            {candidate.schemaReview.summary}
          </p>
        </div>

        <div className="mt-4">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Blocking issues</h4>
          {blockingIssues.length > 0 ? (
            <div className="mt-2 divide-y divide-[var(--stroke-divider)] rounded-md border border-[var(--stroke-divider)]">
              {blockingIssues.map((issue) => (
                <article className="grid gap-1 px-3 py-2" key={`${issue.label}-${issue.message}`}>
                  <div className="text-xs font-semibold text-[var(--status-warning)]">
                    {issue.label}
                  </div>
                  <p className="text-sm text-[var(--text-primary)]">{issue.message}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-dashed border-[var(--stroke-divider)] p-4 text-sm text-[var(--text-secondary)]">
              No blocking issues detected.
            </div>
          )}
        </div>
      </section>

      <aside
        aria-label="Validation actions"
        className="flex flex-col gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3"
      >
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">What to do next?</h4>
          <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--text-secondary)]">
            <li>Resolve blocking issues before a normal commit.</li>
            <li>Validate the Ops proposal, then apply it for Preview.</li>
          </ul>
        </div>
        <Button
          disabled={!canValidateProposal}
          onClick={onValidate}
          size="sm"
          title={extractYOpsTitle}
          type="button"
          variant="canvas-outline"
        >
          {status === 'generating' ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Play aria-hidden="true" className="size-4" />
          )}
          Validate proposal
        </Button>
        <Button
          disabled={!canApplyYOps}
          onClick={onApply}
          size="sm"
          title={applyYOpsTitle}
          type="button"
          variant="commit"
        >
          {status === 'applying' ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="size-4" />
          )}
          Apply YOps
        </Button>
      </aside>
    </div>
  );
}

function PreviewReviewView({
  appliedCount,
  baselineTrees,
  candidate,
  committedHash,
  generatedYOpsCount,
  materializedTrees,
  treeLines,
  validatedPreviewTrees,
  validationPassed,
  visibleErrorMessage,
  yopsExtracted,
}: {
  appliedCount: number;
  baselineTrees: WorkspaceYOpsTreeNode[] | null;
  candidate: WorkspaceCandidate;
  committedHash: string | null;
  generatedYOpsCount: number;
  materializedTrees: WorkspaceYOpsTreeNode[] | null;
  treeLines: YamlTreeLine[];
  validatedPreviewTrees: WorkspaceYOpsTreeNode[] | null;
  validationPassed: boolean;
  visibleErrorMessage: string | null;
  yopsExtracted: boolean;
}) {
  const previewAvailable =
    validationPassed &&
    candidate.schemaReview.verdict === 'ready' &&
    candidate.schemaReview.gaps.length === 0 &&
    candidate.sourceBundle.length > 0 &&
    !visibleErrorMessage;

  if (!previewAvailable) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
        <section
          aria-label="Preview unavailable"
          className="max-w-lg rounded-md border border-dashed border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-6 text-center"
        >
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Complete Validation before reviewing the preview
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Resolve validation items, then validate the YOps proposal to open the pre-commit diff.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <ChangeReviewDock
        candidate={candidate}
        flowState={{
          appliedCount,
          baselineTrees,
          commitHash: committedHash ?? undefined,
          error: visibleErrorMessage ?? undefined,
          previewReady: Boolean(materializedTrees),
          previewTrees: validatedPreviewTrees,
          validationPassed,
          yopsDraftId: candidate.yopsDraft.id,
        }}
      />
      <section
        aria-label="YOps YAML tree"
        className="flex min-h-[360px] shrink-0 flex-col overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
      >
        <PaneHeader
          icon={<Braces aria-hidden="true" className="size-4 text-[var(--accent-commit)]" />}
          label="Rendered PRD YAML"
          meta={materializedTrees ? `${appliedCount} applied` : 'Waiting for validation'}
        />
        {materializedTrees ? (
          <TreePane lines={treeLines} />
        ) : (
          <YOpsTreePendingState operationCount={generatedYOpsCount} yopsExtracted={yopsExtracted} />
        )}
        <footer className="flex min-h-10 items-center gap-3 border-t border-[var(--stroke-divider)] px-3">
          <TreeLegend />
          <span className="ml-auto font-mono text-[10px] text-[var(--text-tertiary)]">
            {appliedCount} applied
          </span>
        </footer>
      </section>
    </div>
  );
}

function CommitReviewView({
  appliedCount,
  branchOptions,
  candidate,
  canCommit,
  commitTitle,
  committedHash,
  isBusy,
  onCommit,
  onTargetBranchChange,
  status,
  targetBranch,
  validationReady,
}: {
  appliedCount: number;
  branchOptions: string[];
  candidate: WorkspaceCandidate;
  canCommit: boolean;
  commitTitle: string;
  committedHash: string | null;
  isBusy: boolean;
  onCommit: () => void;
  onTargetBranchChange: (branch: string) => void;
  status: 'idle' | 'generating' | 'generated' | 'applying' | 'applied' | 'committing' | 'committed';
  targetBranch: string;
  validationReady: boolean;
}) {
  return (
    <div className="grid min-h-0 flex-1 gap-3 overflow-auto p-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section
        aria-label="Commit readiness"
        className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3"
      >
        <div className="grid gap-2 sm:grid-cols-3">
          <ValidationMetric
            label="Materialized"
            tone={appliedCount > 0 ? 'success' : 'warning'}
            value={`${appliedCount}`}
          />
          <ValidationMetric
            label="Validation"
            tone={validationReady ? 'success' : 'warning'}
            value={validationReady ? 'Passed' : 'Required'}
          />
          <ValidationMetric
            label="Commit"
            tone={committedHash ? 'success' : canCommit ? 'success' : 'warning'}
            value={committedHash ? 'Done' : canCommit ? 'Ready' : 'Return'}
          />
        </div>
        <dl className="mt-3 grid gap-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 text-xs">
          <div className="min-w-0">
            <dt className="text-[var(--text-tertiary)]">Commit result</dt>
            <dd className="mt-0.5 truncate font-semibold text-[var(--text-primary)]">
              {committedHash ?? 'Pending'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[var(--text-tertiary)]">Target branch</dt>
            <dd className="mt-0.5 truncate font-semibold text-[var(--text-primary)]">
              {targetBranch}
            </dd>
          </div>
        </dl>
        {!validationReady && !committedHash ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            Complete Validation before returning here to commit.
          </p>
        ) : null}
      </section>

      <aside
        aria-label="Commit controls"
        className="flex flex-col gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3"
      >
        <label
          className="grid gap-1 text-xs font-semibold text-[var(--text-secondary)]"
          htmlFor={`commit-target-branch-${candidate.id}`}
        >
          Commit target branch
          <select
            aria-label="Commit target branch"
            className="h-9 rounded-md border border-[var(--stroke-divider)] bg-[var(--workspace-panel)] px-2 text-xs font-medium text-[var(--text-secondary)] shadow-sm outline-none transition-colors hover:border-[var(--stroke-strong)] focus:border-[var(--accent-commit)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy || Boolean(committedHash)}
            id={`commit-target-branch-${candidate.id}`}
            onChange={(event) => onTargetBranchChange(event.target.value)}
            value={targetBranch}
          >
            {branchOptions.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!canCommit}
          onClick={onCommit}
          size="sm"
          title={commitTitle}
          type="button"
          variant="commit"
        >
          <GitCommitHorizontal aria-hidden="true" className="size-4" />
          {committedHash
            ? 'Committed'
            : status === 'committing'
              ? 'Committing'
              : `Commit · ${targetBranch}`}
        </Button>
      </aside>
    </div>
  );
}

function ValidationMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'neutral' | 'success' | 'warning';
  value: string;
}) {
  return (
    <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
      <div className="text-[11px] font-semibold uppercase text-[var(--text-tertiary)]">{label}</div>
      <div
        className={cn(
          'mt-1 text-lg font-bold',
          tone === 'success'
            ? 'text-[var(--status-success)]'
            : tone === 'warning'
              ? 'text-[var(--status-warning)]'
              : 'text-[var(--text-primary)]'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function GateRow({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2 text-sm">
      <span className="font-medium text-[var(--text-primary)]">{label}</span>
      <Badge variant={passed ? 'success' : 'warning'}>{passed ? 'PASS' : 'REVIEW'}</Badge>
    </div>
  );
}

function getExtractYOpsTitle({
  committedHash,
  isBusy,
  operationCount,
  validationBlocked,
}: {
  committedHash: string | null;
  isBusy: boolean;
  operationCount: number;
  validationBlocked: boolean;
}): string {
  if (committedHash) return 'This workspace is already committed.';
  if (isBusy) return 'A workspace operation is already in progress.';
  if (operationCount === 0) return 'No proposed YOps operations are available yet.';
  if (validationBlocked) return 'Resolve the Validation items before validating this proposal.';
  return 'Validate the proposed YOps before applying it.';
}

function getApplyYOpsTitle({
  committedHash,
  generated,
  isBusy,
}: {
  committedHash: string | null;
  generated: boolean;
  isBusy: boolean;
}): string {
  if (committedHash) return 'This workspace is already committed.';
  if (isBusy) return 'A workspace operation is already in progress.';
  if (!generated) return 'Extract YOps before applying the YAML preview.';
  return 'Apply validated YOps into a YAML preview.';
}

function getCommitTitle({
  appliedCount,
  committedHash,
  isBusy,
  targetBranch,
  validationReady,
}: {
  appliedCount: number;
  committedHash: string | null;
  isBusy: boolean;
  targetBranch: string;
  validationReady: boolean;
}): string {
  if (committedHash) return 'Workspace result is already committed.';
  if (isBusy) return 'A workspace operation is already in progress.';
  if (appliedCount === 0) return 'Apply YOps before committing the workspace result.';
  if (!validationReady) return 'Complete Validation before committing.';
  return `Commit the materialized YAML result to ${targetBranch}.`;
}

function getYOpsViewTitle(view: WorkspaceYOpsFlowView): string {
  if (view === 'validation') return 'Validation';
  if (view === 'preview') return 'Preview';
  if (view === 'commit') return 'Commit';
  return 'Ops';
}

function getYOpsViewDescription(view: WorkspaceYOpsFlowView): string {
  if (view === 'validation') return 'Check Ops against schema, evidence, replay, and readiness.';
  if (view === 'preview') return 'Review the materialized YAML before commit.';
  if (view === 'commit') return 'Commit the validated workspace result.';
  return 'Review proposed YOps operations and node-level changes.';
}

function getInitialTargetBranch(candidate: WorkspaceCandidate): string {
  return normalizeBranchName(candidate.targetBranch) ?? 'main';
}

function getCommitBranchOptions(candidate: WorkspaceCandidate): string[] {
  const options = new Set<string>(['main']);
  const targetBranch = normalizeBranchName(candidate.targetBranch);
  if (targetBranch) options.add(targetBranch);
  return Array.from(options);
}

function normalizeBranchName(branch: string | null | undefined): string | null {
  const trimmed = branch?.trim();
  return trimmed ? trimmed : null;
}

function PaneHeader({ icon, label, meta }: { icon: ReactNode; label: string; meta: string }) {
  return (
    <div className="flex h-9 items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--editor-gutter)] px-3">
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </span>
      <span className="ml-auto truncate font-mono text-[10px] text-[var(--text-tertiary)]">
        {meta}
      </span>
    </div>
  );
}

function CodePane({ lines }: { lines: string[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--editor-bg)]">
      <div className="grid min-w-[520px] grid-cols-[36px_minmax(0,1fr)] font-mono text-[12px] leading-[19px]">
        {lines.map((line, index) => (
          <div className="contents" key={`${index}-${line}`}>
            <div className="select-none border-r border-[var(--stroke-divider)] bg-[var(--workspace-panel)] pr-2 text-right text-[var(--text-tertiary)]">
              {index + 1}
            </div>
            <pre className="whitespace-pre-wrap px-3 text-[var(--text-primary)]">{line || ' '}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreePane({ lines }: { lines: YamlTreeLine[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--editor-bg)] py-2">
      <div className="min-w-[520px] font-mono text-[12px] leading-[20px]">
        {lines.map((line) => (
          <div className={treeLineClassName(line.status)} key={line.id}>
            <span
              aria-hidden="true"
              className="inline-block select-none text-[var(--text-quaternary)]"
              style={{ width: `${line.indent * 1.25}rem` }}
            />
            <span className="text-[var(--yaml-key)]">{line.key}</span>
            {line.value ? (
              <>
                <span className="text-[var(--yaml-punctuation)]">: </span>
                <span className="text-[var(--yaml-string)]">{line.value}</span>
              </>
            ) : (
              <span className="text-[var(--yaml-punctuation)]">:</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function YOpsTreePendingState({
  operationCount,
  yopsExtracted,
}: {
  operationCount: number;
  yopsExtracted: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--editor-bg)] px-6 py-10">
      <div className="max-w-[320px] text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-panel)] text-[var(--text-tertiary)]">
          <Braces aria-hidden="true" className="size-5" />
        </div>
        <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
          No materialized YAML yet
        </p>
        <p className="mt-1 text-xs font-medium leading-5 text-[var(--text-secondary)]">
          {operationCount === 0
            ? 'Add source evidence and generate a YOps proposal before validating or applying.'
            : yopsExtracted
              ? `${operationCount} YOps ready. Apply them to preview the materialized tree.`
              : 'Validate the YOps proposal first, then apply it to preview the materialized tree.'}
        </p>
      </div>
    </div>
  );
}

function TreeLegend() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[8px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)]">
      <LegendItem className="bg-[var(--status-info)]" label="Human" />
      <LegendItem className="bg-[var(--status-success)]" label="New" />
      <LegendItem className="bg-[var(--status-warning)]" label="Changed" />
      <LegendItem className="bg-[var(--status-error)]" label="Removed" />
      <LegendItem className="bg-[var(--text-quaternary)]" label="Inherited" />
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', className)} />
      {label}
    </span>
  );
}

function getYOpsStatusText(
  status: 'idle' | 'generating' | 'generated' | 'applying' | 'applied' | 'committing' | 'committed'
) {
  if (status === 'generating') return 'Running deterministic validation';
  if (status === 'generated') return 'Proposal validated';
  if (status === 'applying') return 'Applying preview';
  if (status === 'applied') return 'Preview materialized';
  if (status === 'committing') return 'Creating commit';
  if (status === 'committed') return 'Committed to state';
  return 'Deterministic validator ready';
}

function formatProposalMode(mode: string): string {
  if (mode === 'llm') return 'LLM proposal';
  if (mode === 'deterministic_scaffold') return 'Deterministic scaffold';
  return 'Fixture proposal';
}

function buildYOpsScriptLines(
  operations: WorkspaceYOpsDraftOperation[],
  rootKey: string
): string[] {
  if (operations.length === 0) {
    return [
      'No proposed YOps operations yet.',
      'Add source evidence and generate a YOps proposal before validating.',
    ];
  }

  const lines = ['yops:'];
  for (const operation of operations) {
    const opName = operation.op === 'add' ? 'append' : operation.op;
    lines.push(`  - ${opName}:`);
    lines.push(`      path: ${operationPreviewPath(operation, rootKey)}`);
    if (operation.afterValue) lines.push(`      value: ${quoteYamlValue(operation.afterValue)}`);
    if (operation.reason) lines.push(`      reason: ${quoteYamlValue(operation.reason)}`);
    if (operation.sourceRefs?.length) {
      lines.push('      source_refs:');
      for (const ref of operation.sourceRefs) lines.push(`        - ${quoteYamlValue(ref)}`);
    }
  }
  return lines;
}

function buildYOpsCommandLines(yops: WorkspaceYOp[]): string[] {
  if (yops.length === 0) return ['yops:'];

  const lines = ['yops:'];
  for (const op of yops) {
    const [opName, payload] = Object.entries(op)[0] as [
      keyof WorkspaceYOp,
      { path: string; value?: unknown },
    ];
    lines.push(`  - ${opName}:`);
    lines.push(`      path: ${payload.path}`);
    if ('value' in payload) lines.push(`      value: ${quoteYamlUnknown(payload.value)}`);
  }
  return lines;
}

function quoteYamlValue(value: string): string {
  return JSON.stringify(value);
}

function quoteYamlUnknown(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
}

function shortHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 11)}...`;
}

interface YamlTreeLine {
  id: string;
  indent: number;
  key: string;
  value?: string;
  status?: WorkspaceSchemaFieldStatus | 'changed';
}

function buildTreeNodeLines(
  trees: WorkspaceYOpsTreeNode[],
  changedPaths: Set<string>
): YamlTreeLine[] {
  return trees.flatMap((tree) => treeNodeToLines(tree, 0, tree.key, changedPaths));
}

function treeNodeToLines(
  node: WorkspaceYOpsTreeNode,
  indent: number,
  path: string,
  changedPaths: Set<string>
): YamlTreeLine[] {
  const lines: YamlTreeLine[] = [
    {
      id: path,
      indent,
      key: node.key,
      status: lineTouchedByYOps(path, changedPaths) ? 'changed' : undefined,
    },
  ];

  for (const [slotKey, slotValue] of Object.entries(node.slots)) {
    const slotPath = `${path}/${slotKey}`;
    lines.push({
      id: slotPath,
      indent: indent + 1,
      key: slotKey,
      value: formatTreeValue(slotValue),
      status: lineTouchedByYOps(slotPath, changedPaths) ? 'changed' : undefined,
    });
  }

  for (const child of node.children) {
    lines.push(...treeNodeToLines(child, indent + 1, `${path}/${child.key}`, changedPaths));
  }

  return lines;
}

function lineTouchedByYOps(path: string, changedPaths: Set<string>) {
  for (const changedPath of changedPaths) {
    if (changedPath === path || changedPath.startsWith(`${path}/`)) return true;
  }
  return false;
}

function formatTreeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function operationPreviewPath(operation: WorkspaceYOpsDraftOperation, rootKey: string) {
  const path = operation.path.replace(/\/-$/, '');
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
    );

  if (segments[0] === rootKey) return segments.join('/');
  return [rootKey, ...segments].join('/');
}

function yopPreviewPath(yop: WorkspaceYOp) {
  const payload = Object.values(yop)[0] as { path?: string };
  return payload.path ?? '';
}

function treeLineClassName(status: YamlTreeLine['status']) {
  const base = 'relative px-3';
  if (status === 'covered') return `${base} bg-[var(--diff-added-bg)]`;
  if (status === 'changed') return `${base} bg-[var(--diff-modified-bg)]`;
  if (status === 'missing' || status === 'needs_confirmation') {
    return `${base} bg-[var(--diff-modified-bg)]`;
  }
  if (status === 'type_mismatch') return `${base} bg-[var(--diff-removed-bg)]`;
  return base;
}
