import {
  AlertTriangle,
  ArrowRight,
  Braces,
  CheckCircle2,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  Network,
  Play,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useWorkspaceCommit } from '@/hooks/workspaces/useWorkspaceCommit';
import { useWorkspaceYOps } from '@/hooks/workspaces/useWorkspaceYOps';
import type {
  WorkspaceCandidate,
  WorkspaceSchemaFieldStatus,
  WorkspaceValidationOverride,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type { WorkspaceYOp, WorkspaceYOpsTreeNode } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';
import { ChangeReviewDock } from './ChangeReviewDock';
import { PrdPreviewView } from './PrdPreviewView';
import { ProposalReviewView, WorkspaceDiff } from './ProposalReviewView';

export type WorkspaceYOpsFlowView = 'ops' | 'validation' | 'preview' | 'commit';

export function YOpsDraftTab({
  candidate,
  continuationBusy,
  flowError,
  onApplied,
  onCommitted,
  onContinueFromCommit,
  onSendToYOps,
  onViewCommitInState,
  onViewChange,
  sendingToYOps,
  view = 'ops',
  yopsDraftSent,
}: {
  candidate: WorkspaceCandidate;
  continuationBusy?: boolean;
  flowError?: string;
  onApplied?: (remainingSchemaGapCount: number) => void;
  onCommitted?: (commitHash: string, branch: string) => void;
  onContinueFromCommit?: (
    commitHash: string,
    targetBranch: string,
    createBranchFrom?: string
  ) => Promise<void> | void;
  onSendToYOps?: () => Promise<void> | void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  onViewChange?: (view: WorkspaceYOpsFlowView) => void;
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
  const [materializedRelations, setMaterializedRelations] = useState<unknown[] | null>(null);
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
  const draftFingerprint = useMemo(
    () =>
      draft.operations
        .map((operation) =>
          [
            operation.id,
            operation.op,
            operation.path,
            operation.beforeValue ?? '',
            operation.afterValue ?? '',
          ].join('\u001f')
        )
        .join('\u001e'),
    [draft.operations]
  );
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
  const materializedCount = committedHash ? draft.operations.length : appliedCount;
  const pendingCount = Math.max(draft.operations.length - materializedCount, 0);
  const isBusy = status === 'generating' || status === 'applying' || status === 'committing';
  const unresolvedSchemaGaps = getUnresolvedSchemaGaps(
    candidate.schemaReview.gaps,
    materializedTrees,
    rootKey
  );
  const schemaReviewReady =
    candidate.schemaReview.verdict === 'ready' ||
    (candidate.schemaReview.gaps.length > 0 && unresolvedSchemaGaps.length === 0);
  const commitPrerequisitesMet =
    unresolvedSchemaGaps.length === 0 && schemaReviewReady && candidate.sourceBundle.length > 0;
  const visibleErrorMessage = errorMessage ?? flowError ?? null;
  const yopsValidationBlocked = Boolean(visibleErrorMessage);
  const canValidateProposal =
    draft.operations.length > 0 && !isBusy && !committedHash && !yopsValidationBlocked;
  const canApplyYOps = Boolean(generatedYOps) && status !== 'idle' && !isBusy && !committedHash;
  const statusText = getYOpsStatusText(status);
  const validationBlocked = !commitPrerequisitesMet || yopsValidationBlocked;
  const commitBlockers = getCommitBlockers({
    appliedCount,
    baseCommitHash: candidate.baseCommitHash,
    originalTargetBranch: candidate.targetBranch,
    hasMaterializedTrees: Boolean(materializedTrees),
    schemaGaps: unresolvedSchemaGaps,
    schemaVerdict: schemaReviewReady ? 'ready' : candidate.schemaReview.verdict,
    sourceBundleCount: candidate.sourceBundle.length,
    targetBranch,
    validationPassed,
    visibleErrorMessage,
  });
  const canCommit = commitBlockers.length === 0 && !isBusy && !committedHash;
  const schemaOverrideBlockers = commitBlockers.filter(isSchemaOverrideBlocker);
  const canOverrideCommit =
    schemaOverrideBlockers.length > 0 &&
    schemaOverrideBlockers.length === commitBlockers.length &&
    !isBusy &&
    !committedHash;
  const proposalMode = formatProposalMode(draft.proposalMode ?? 'fixture');
  const extractYOpsTitle = getExtractYOpsTitle({
    committedHash,
    flowBlocked: yopsValidationBlocked,
    isBusy,
    operationCount: draft.operations.length,
  });
  const applyYOpsTitle = getApplyYOpsTitle({
    committedHash,
    generated: Boolean(generatedYOps),
    isBusy,
  });
  const commitTitle = getCommitTitle({
    appliedCount,
    blockers: commitBlockers,
    committedHash,
    isBusy,
    targetBranch,
  });

  useEffect(() => {
    setGeneratedYOps(null);
    setBaselineTrees(null);
    setValidatedPreviewTrees(null);
    setValidationPassed(false);
    setMaterializedTrees(null);
    setMaterializedRelations(null);
    setAppliedCount(0);
    setCommittedHash(candidate.lastCommitHash ?? null);
    setStatus(candidate.lastCommitHash ? 'committed' : 'idle');
    setErrorMessage(null);
  }, [candidate.id, candidate.lastCommitHash, draft.id, draftFingerprint]);

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
      setMaterializedRelations(null);
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
      setMaterializedRelations(result.previewRelations ?? []);
      setAppliedCount(result.applied);
      setStatus('applied');
      onApplied?.(
        getUnresolvedSchemaGaps(candidate.schemaReview.gaps, result.previewTrees, rootKey).length
      );
    } catch (error) {
      setValidationPassed(false);
      setStatus(generatedYOps ? 'generated' : 'idle');
      setErrorMessage(error instanceof Error ? error.message : 'YOps apply failed');
    }
  }

  async function handleCommit(validationOverride?: WorkspaceValidationOverride) {
    const commitAllowed = validationOverride ? canOverrideCommit : canCommit;
    if (!materializedTrees || !materializedRelations || !commitAllowed) return;
    setStatus('committing');
    setErrorMessage(null);

    try {
      const hash = await commit(
        { trees: materializedTrees, relations: materializedRelations },
        validationOverride
      );
      setCommittedHash(hash);
      setStatus('committed');
      onCommitted?.(hash, targetBranch);
    } catch (error) {
      setStatus('applied');
      setErrorMessage(error instanceof Error ? error.message : 'Workspace commit failed');
    }
  }

  return (
    <div className="flex min-h-[620px] flex-col overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--workspace-panel)]">
      {view === 'preview' || view === 'commit' ? (
        <header className="flex min-h-[54px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-2.5">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {getYOpsViewTitle(view)}
            </h3>
            <p className="truncate text-xs text-[var(--text-tertiary)]">
              {getYOpsViewDescription(view)}
            </p>
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <Badge variant="commit-subtle">Materialized {materializedCount}</Badge>
            <Badge variant="pending-subtle">Pending {pendingCount}</Badge>
            {committedHash ? <Badge variant="commit">{shortHash(committedHash)}</Badge> : null}
            <span className="max-w-[180px] truncate text-[10px] font-medium text-[var(--text-tertiary)]">
              {statusText}
            </span>
          </div>
        </header>
      ) : null}

      {visibleErrorMessage && (view === 'preview' || view === 'commit') ? (
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
        <ProposalReviewView
          candidate={candidate}
          flowError={visibleErrorMessage}
          onContinueToValidation={() => onViewChange?.('validation')}
          onSendToYOps={onSendToYOps}
          proposalMode={proposalMode}
          sendingToYOps={Boolean(sendingToYOps)}
          statusText={statusText}
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
          onViewChange={onViewChange}
          status={status}
          visibleErrorMessage={visibleErrorMessage}
          yopsDraftSent={Boolean(yopsDraftSent)}
        />
      ) : null}

      {view === 'preview' ? (
        <PreviewReviewView
          appliedCount={appliedCount}
          baselineTrees={baselineTrees}
          candidate={candidate}
          canOverrideCommit={canOverrideCommit}
          commitBlockers={commitBlockers}
          committedHash={committedHash}
          generatedYOpsCount={generatedYOps?.length ?? draft.operations.length}
          yopsExtracted={Boolean(generatedYOps)}
          materializedTrees={materializedTrees}
          onContinueToCommit={() => onViewChange?.('commit')}
          schemaGapCount={unresolvedSchemaGaps.length}
          treeLines={treeLines}
          validatedPreviewTrees={validatedPreviewTrees}
          validationPassed={validationPassed}
          visibleErrorMessage={visibleErrorMessage}
        />
      ) : null}

      {view === 'commit' ? (
        <CommitReviewView
          appliedCount={materializedCount}
          branchOptions={branchOptions}
          candidate={candidate}
          canCommit={canCommit}
          canOverrideCommit={canOverrideCommit}
          commitBlockers={commitBlockers}
          commitTitle={commitTitle}
          committedHash={committedHash}
          continuationBusy={Boolean(continuationBusy)}
          isBusy={isBusy}
          onCommit={handleCommit}
          onOverrideCommit={() =>
            handleCommit({
              kind: 'schema_review',
              reason: 'User explicitly confirmed unresolved schema review gaps.',
              blockers: schemaOverrideBlockers,
            })
          }
          onContinueFromCommit={onContinueFromCommit}
          onTargetBranchChange={setTargetBranch}
          onViewCommitInState={onViewCommitInState}
          status={status}
          schemaOverrideBlockers={schemaOverrideBlockers}
          targetBranch={targetBranch}
          validationReady={Boolean(committedHash) || (validationPassed && !validationBlocked)}
        />
      ) : null}
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
  onViewChange,
  status,
  visibleErrorMessage,
  yopsDraftSent,
}: {
  applyYOpsTitle: string;
  canApplyYOps: boolean;
  canValidateProposal: boolean;
  candidate: WorkspaceCandidate;
  extractYOpsTitle: string;
  generatedYOpsCount: number;
  onApply: () => void;
  onValidate: () => void;
  onViewChange?: (view: WorkspaceYOpsFlowView) => void;
  status: 'idle' | 'generating' | 'generated' | 'applying' | 'applied' | 'committing' | 'committed';
  visibleErrorMessage: string | null;
  yopsDraftSent: boolean;
}) {
  const operations = candidate.yopsDraft.operations;
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(
    operations[0]?.id ?? null
  );
  const [diffOpen, setDiffOpen] = useState(false);
  const selectedOperation =
    operations.find((operation) => operation.id === selectedOperationId) ?? operations[0] ?? null;
  const validationRan = generatedYOpsCount > 0 || status === 'applied' || status === 'committed';
  const hasBlockingIssues = candidate.schemaReview.gaps.length > 0 || Boolean(visibleErrorMessage);
  const passedCount = validationRan && !hasBlockingIssues ? operations.length : 0;
  const statusLabel = hasBlockingIssues
    ? 'Review required'
    : validationRan
      ? 'Ready for Preview'
      : 'Ready to validate';

  useEffect(() => {
    setSelectedOperationId(operations[0]?.id ?? null);
  }, [candidate.id, candidate.yopsDraft.id, operations]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface-card)]">
      <header className="flex min-h-[72px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
            Validation
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Check the projected Proposal against YSchema before Preview.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className="hidden max-w-48 truncate text-[10px] font-medium text-[var(--text-tertiary)] lg:inline">
            {candidate.title}
          </span>
          <span className="hidden font-mono text-[10px] text-[var(--text-tertiary)] sm:inline">
            {candidate.schemaBindings[0]
              ? `${candidate.schemaBindings[0].schemaName} ${candidate.schemaBindings[0].version}`
              : 'No schema'}
          </span>
          <Badge variant={validationRan ? 'success' : 'pending-subtle'}>
            {getYOpsStatusText(status)}
          </Badge>
          {yopsDraftSent ? <Badge variant="pending-subtle">Proposal ready</Badge> : null}
          <Button
            onClick={() => onViewChange?.('ops')}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            Edit Proposal
          </Button>
          {!validationRan ? (
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
          ) : null}
          <Button
            aria-label="Apply YOps to Preview"
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
            Apply to Preview
          </Button>
        </div>
      </header>

      <section aria-label="Validation gates" className="min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-[54px] flex-wrap items-center justify-between gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2.5">
          <div>
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">{statusLabel}</h4>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
              The projected PRD meets the active YSchema when every change passes.
            </p>
          </div>
          <span
            className={cn(
              'text-xs font-semibold',
              hasBlockingIssues ? 'text-[var(--status-warning)]' : 'text-[var(--status-success)]'
            )}
          >
            {passedCount} changes passed · {candidate.schemaReview.gaps.length} issues
          </span>
        </div>

        {visibleErrorMessage ? (
          <div
            className="border-b border-[var(--status-warning)]/20 bg-[var(--status-warning-muted)] px-4 py-2 text-xs text-[var(--text-secondary)]"
            role="alert"
          >
            {visibleErrorMessage}
          </div>
        ) : null}

        {candidate.schemaReview.gaps.length > 0 ? (
          <div className="border-b border-[var(--status-warning)]/20 bg-[var(--status-warning-muted)] px-4 py-2 text-xs text-[var(--text-secondary)]">
            {candidate.schemaReview.gaps.join(' ')}
          </div>
        ) : null}

        <div className="min-w-[820px]">
          <div className="grid grid-cols-[52px_minmax(260px,1fr)_minmax(280px,1fr)_92px] border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            <span>#</span>
            <span>Change</span>
            <span>YSchema rule</span>
            <span className="text-right">Result</span>
          </div>

          {operations.map((operation, index) => {
            const selected = selectedOperation?.id === operation.id;
            const passed = validationRan && !hasBlockingIssues;
            const field = findSchemaFieldForOperation(candidate, operation);
            return (
              <div className="border-b border-[var(--stroke-divider)]" key={operation.id}>
                <button
                  aria-expanded={selected}
                  className={cn(
                    'grid min-h-[54px] w-full grid-cols-[52px_minmax(260px,1fr)_minmax(280px,1fr)_92px] items-center px-3 text-left transition-colors',
                    selected
                      ? 'border-l-2 border-l-[var(--accent-branch)] bg-[var(--diff-modified-bg)]'
                      : 'border-l-2 border-l-transparent hover:bg-[var(--hover-bg)]'
                  )}
                  onClick={() => setSelectedOperationId(selected ? null : operation.id)}
                  type="button"
                >
                  <span className="font-mono text-xs font-semibold text-[var(--text-tertiary)]">
                    P{String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 pr-3">
                    <Badge variant="outline">{operation.op.toUpperCase()}</Badge>
                    <strong className="truncate text-sm text-[var(--text-primary)]">
                      {operation.summary}
                    </strong>
                  </span>
                  <span className="font-mono text-[11px] leading-4 text-[var(--text-secondary)]">
                    {formatSchemaRule(field)}
                  </span>
                  <span className="justify-self-end">
                    <Badge
                      variant={
                        passed ? 'success' : hasBlockingIssues ? 'warning' : 'pending-subtle'
                      }
                    >
                      {passed ? 'PASS' : hasBlockingIssues ? 'REVIEW' : 'CHECK'}
                    </Badge>
                  </span>
                </button>

                {selected ? (
                  <div className="grid grid-cols-3 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)]">
                    <ValidationDetailCell label="1 · Projected value">
                      <p className="break-words font-mono text-xs leading-5 text-[var(--text-primary)]">
                        {operation.afterValue || 'Empty'}
                      </p>
                    </ValidationDetailCell>
                    <ValidationDetailCell label="2 · YSchema rule">
                      <p className="font-mono text-xs leading-5 text-[var(--text-primary)]">
                        {formatSchemaRule(field)}
                      </p>
                    </ValidationDetailCell>
                    <ValidationDetailCell label="3 · Observed">
                      <p className="text-xs leading-5 text-[var(--text-primary)]">
                        {getObservedEvidence(candidate, operation, field)}
                      </p>
                    </ValidationDetailCell>
                    <div className="col-span-3 flex items-center gap-3 border-t border-[var(--stroke-divider)] px-4 py-2 text-[10px] text-[var(--text-tertiary)]">
                      <span className="min-w-0 flex-1 truncate font-mono">{operation.path}</span>
                      <button
                        className="font-semibold text-[var(--accent-commit)] hover:underline"
                        onClick={() => onViewChange?.('ops')}
                        type="button"
                      >
                        Open Proposal {String(index + 1).padStart(2, '0')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {operations.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--text-secondary)]">
            No proposal changes are available to validate.
          </div>
        ) : null}
      </section>

      {selectedOperation ? (
        <WorkspaceDiff
          candidate={candidate}
          onOpenChange={() => setDiffOpen((current) => !current)}
          onSelectOperation={setSelectedOperationId}
          open={diffOpen}
          phase="validation"
          schemaPassed={validationRan && !hasBlockingIssues}
          selectedOperation={selectedOperation}
        />
      ) : null}
    </div>
  );
}

function ValidationDetailCell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="min-h-28 border-r border-[var(--stroke-divider)] p-4 last:border-r-0">
      <h5 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </h5>
      {children}
    </section>
  );
}

function findSchemaFieldForOperation(
  candidate: WorkspaceCandidate,
  operation: WorkspaceYOpsDraftOperation
) {
  const fields = flattenWorkspaceSchemaFields(candidate.schemaCandidate.fields);
  const normalizedOperationPath = operation.path.replace(/^\/+/, '').replaceAll('/', '.');
  return fields.find((field) => {
    const normalizedFieldPath = field.path.replace(/^\/+/, '').replaceAll('/', '.');
    return (
      normalizedOperationPath.endsWith(normalizedFieldPath) ||
      normalizedOperationPath.endsWith(`.${normalizedFieldPath.split('.').at(-1)}`)
    );
  });
}

function flattenWorkspaceSchemaFields(
  fields: WorkspaceCandidate['schemaCandidate']['fields']
): WorkspaceCandidate['schemaCandidate']['fields'] {
  return fields.flatMap((field) => [field, ...flattenWorkspaceSchemaFields(field.children ?? [])]);
}

function formatSchemaRule(
  field: WorkspaceCandidate['schemaCandidate']['fields'][number] | undefined
): string {
  if (!field) return 'required · structured value · evidence';
  return [field.required ? 'required' : 'optional', field.type, 'evidence'].join(' · ');
}

function getObservedEvidence(
  candidate: WorkspaceCandidate,
  operation: WorkspaceYOpsDraftOperation,
  field: WorkspaceCandidate['schemaCandidate']['fields'][number] | undefined
): string {
  if (field?.evidence) return field.evidence;
  const matchedSources = candidate.sourceBundle.filter((source) =>
    operation.sourceRefs?.includes(source.id)
  );
  if (matchedSources.length > 0) {
    return `${matchedSources.length} source ${matchedSources.length === 1 ? 'reference' : 'references'} accepted.`;
  }
  return 'No evidence reference observed.';
}

function PreviewReviewView({
  appliedCount,
  baselineTrees,
  candidate,
  canOverrideCommit,
  commitBlockers,
  committedHash,
  generatedYOpsCount,
  materializedTrees,
  onContinueToCommit,
  schemaGapCount,
  treeLines,
  validatedPreviewTrees,
  validationPassed,
  visibleErrorMessage,
  yopsExtracted,
}: {
  appliedCount: number;
  baselineTrees: WorkspaceYOpsTreeNode[] | null;
  candidate: WorkspaceCandidate;
  canOverrideCommit: boolean;
  commitBlockers: string[];
  committedHash: string | null;
  generatedYOpsCount: number;
  materializedTrees: WorkspaceYOpsTreeNode[] | null;
  onContinueToCommit: () => void;
  schemaGapCount: number;
  treeLines: YamlTreeLine[];
  validatedPreviewTrees: WorkspaceYOpsTreeNode[] | null;
  validationPassed: boolean;
  visibleErrorMessage: string | null;
  yopsExtracted: boolean;
}) {
  const previewAvailable = validationPassed && !visibleErrorMessage;

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
            Validate the YOps proposal to open the pre-commit diff.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <PrdPreviewView
        appliedCount={appliedCount}
        candidate={candidate}
        changesView={
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
        }
        commitReady={commitBlockers.length === 0}
        operationCount={generatedYOpsCount}
        previewReady={Boolean(materializedTrees)}
        previewTrees={materializedTrees ?? validatedPreviewTrees}
        schemaGapCount={schemaGapCount}
        validationPassed={validationPassed}
        yamlView={
          <RenderedYOpsTree
            appliedCount={appliedCount}
            generatedYOpsCount={generatedYOpsCount}
            materializedTrees={materializedTrees}
            treeLines={treeLines}
            yopsExtracted={yopsExtracted}
          />
        }
      />
      <section
        aria-label="Preview actions"
        className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            {commitBlockers.length === 0 ? 'Preview ready for commit' : 'Commit review required'}
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {commitBlockers.length === 0
              ? 'The inherited baseline and this iteration’s YOps are materialized together.'
              : canOverrideCommit
                ? `${commitBlockers.length} schema ${commitBlockers.length === 1 ? 'gap remains' : 'gaps remain'}. Resolve it or explicitly override it in Commit.`
                : `${commitBlockers.length} ${commitBlockers.length === 1 ? 'blocker remains' : 'blockers remain'} before this result can be committed.`}
          </p>
        </div>
        <Button onClick={onContinueToCommit} type="button" variant="commit">
          {commitBlockers.length === 0 ? (
            <ArrowRight aria-hidden="true" className="size-4" />
          ) : (
            <AlertTriangle aria-hidden="true" className="size-4" />
          )}
          {commitBlockers.length === 0 ? 'Continue to Commit' : 'Review Commit blockers'}
        </Button>
      </section>
    </div>
  );
}

function RenderedYOpsTree({
  appliedCount,
  generatedYOpsCount,
  materializedTrees,
  treeLines,
  yopsExtracted,
}: {
  appliedCount: number;
  generatedYOpsCount: number;
  materializedTrees: WorkspaceYOpsTreeNode[] | null;
  treeLines: YamlTreeLine[];
  yopsExtracted: boolean;
}) {
  return (
    <section
      aria-label="YOps YAML tree"
      className="flex min-h-[360px] flex-col overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)]"
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
  );
}

function CommitReviewView({
  appliedCount,
  branchOptions,
  candidate,
  canCommit,
  canOverrideCommit,
  commitBlockers,
  commitTitle,
  committedHash,
  continuationBusy,
  isBusy,
  onCommit,
  onOverrideCommit,
  onContinueFromCommit,
  onTargetBranchChange,
  onViewCommitInState,
  status,
  schemaOverrideBlockers,
  targetBranch,
  validationReady,
}: {
  appliedCount: number;
  branchOptions: string[];
  candidate: WorkspaceCandidate;
  canCommit: boolean;
  canOverrideCommit: boolean;
  commitBlockers: string[];
  commitTitle: string;
  committedHash: string | null;
  continuationBusy: boolean;
  isBusy: boolean;
  onCommit: () => void;
  onOverrideCommit: () => void;
  onContinueFromCommit?: (
    commitHash: string,
    targetBranch: string,
    createBranchFrom?: string
  ) => Promise<void> | void;
  onTargetBranchChange: (branch: string) => void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  status: 'idle' | 'generating' | 'generated' | 'applying' | 'applied' | 'committing' | 'committed';
  schemaOverrideBlockers: string[];
  targetBranch: string;
  validationReady: boolean;
}) {
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);

  useEffect(() => {
    if (overrideDialogOpen) return;
    setOverrideConfirmed(false);
  }, [overrideDialogOpen]);

  function handleOverrideCommit() {
    if (!overrideConfirmed || !canOverrideCommit || isBusy) return;
    setOverrideDialogOpen(false);
    onOverrideCommit();
  }

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
            value={
              committedHash ? 'Done' : canCommit ? 'Ready' : canOverrideCommit ? 'Review' : 'Return'
            }
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
        {commitBlockers.length > 0 && !committedHash ? (
          <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
            <p>
              {canOverrideCommit
                ? 'Resolve these schema gaps, or click Commit to review and confirm the risk.'
                : 'Resolve these blockers before committing.'}
            </p>
            <ul className="grid gap-1">
              {commitBlockers.map((blocker) => (
                <li className="rounded-md bg-[var(--surface-card)] px-2 py-1" key={blocker}>
                  {blocker}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {committedHash ? (
        <PostCommitActions
          branchOptions={branchOptions}
          busy={continuationBusy}
          commitHash={committedHash}
          onContinueFromCommit={onContinueFromCommit}
          onViewCommitInState={onViewCommitInState}
          targetBranch={targetBranch}
        />
      ) : (
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
              disabled={isBusy}
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
            disabled={!canCommit && !canOverrideCommit}
            onClick={canOverrideCommit ? () => setOverrideDialogOpen(true) : () => onCommit()}
            size="sm"
            title={
              canOverrideCommit ? 'Review unresolved schema gaps before committing.' : commitTitle
            }
            type="button"
            variant="commit"
          >
            <GitCommitHorizontal aria-hidden="true" className="size-4" />
            {status === 'committing' ? 'Committing' : `Commit · ${targetBranch}`}
          </Button>
        </aside>
      )}

      <Dialog onOpenChange={setOverrideDialogOpen} open={overrideDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Commit despite unresolved schema gaps?</DialogTitle>
            <DialogDescription>
              This writes the materialized result to {targetBranch} while preserving the unresolved
              schema review gaps in the commit audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-3">
            <div
              className="rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] p-3"
              role="alert"
            >
              <p className="text-sm font-semibold text-[var(--status-warning)]">
                {schemaOverrideBlockers.length}{' '}
                {schemaOverrideBlockers.length === 1 ? 'schema gap remains' : 'schema gaps remain'}
              </p>
              <ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--text-secondary)]">
                {schemaOverrideBlockers.map((blocker) => (
                  <li className="break-words font-mono" key={blocker}>
                    {blocker}
                  </li>
                ))}
              </ul>
            </div>
            <label className="flex items-start gap-2 rounded-md border border-[var(--stroke-divider)] p-3 text-sm text-[var(--text-secondary)]">
              <input
                checked={overrideConfirmed}
                className="mt-0.5"
                onChange={(event) => setOverrideConfirmed(event.target.checked)}
                type="checkbox"
              />
              <span>I understand this commit will retain unresolved schema gaps.</span>
            </label>
          </div>
          <DialogFooter className="mt-6">
            <Button
              onClick={() => setOverrideDialogOpen(false)}
              type="button"
              variant="canvas-outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!overrideConfirmed || isBusy}
              onClick={handleOverrideCommit}
              type="button"
              variant="destructive"
            >
              Commit anyway · {targetBranch}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PostCommitActions({
  branchOptions,
  busy,
  commitHash,
  onContinueFromCommit,
  onViewCommitInState,
  targetBranch,
}: {
  branchOptions: string[];
  busy: boolean;
  commitHash: string;
  onContinueFromCommit?: (
    commitHash: string,
    targetBranch: string,
    createBranchFrom?: string
  ) => Promise<void> | void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  targetBranch: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [branchName, setBranchName] = useState('');
  const normalizedBranchName = normalizeNewBranchName(branchName);
  const branchError = getNewBranchNameError(normalizedBranchName, branchOptions);

  useEffect(() => {
    if (dialogOpen) return;
    setBranchName('');
  }, [dialogOpen]);

  function handleCreateBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalizedBranchName || branchError || busy || !onContinueFromCommit) return;
    void onContinueFromCommit(commitHash, normalizedBranchName, targetBranch);
    setDialogOpen(false);
  }

  return (
    <aside
      aria-label="Post-commit actions"
      className="flex flex-col gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3"
    >
      <div>
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
          Continue in this workspace
        </h4>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          The committed conversation stays preserved. Start a fresh source chat from this baseline.
        </p>
      </div>

      <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-2.5 text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          New conversation baseline
        </div>
        <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
          <span className="truncate font-mono font-semibold text-[var(--text-primary)]">
            {shortHash(commitHash)}
          </span>
          <Badge variant="commit-subtle">{targetBranch}</Badge>
        </div>
      </div>

      <Button
        disabled={busy || !onContinueFromCommit}
        onClick={() => void onContinueFromCommit?.(commitHash, targetBranch)}
        type="button"
        variant="commit"
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <ArrowRight aria-hidden="true" className="size-4" />
        )}
        Continue on {targetBranch}
      </Button>
      <Button
        disabled={busy || !onContinueFromCommit}
        onClick={() => setDialogOpen(true)}
        type="button"
        variant="branch"
      >
        <GitBranch aria-hidden="true" className="size-4" />
        Create a new branch
      </Button>
      <Button
        disabled={!onViewCommitInState}
        onClick={() => onViewCommitInState?.(commitHash, targetBranch)}
        type="button"
        variant="canvas-outline"
      >
        <Network aria-hidden="true" className="size-4" />
        View in State
      </Button>

      <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleCreateBranch}>
            <DialogHeader>
              <DialogTitle>Create a new branch</DialogTitle>
              <DialogDescription>
                Start a fresh source conversation from this commit and target its next commit to a
                new branch.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid gap-3">
              <label
                className="grid gap-1.5 text-sm font-semibold text-[var(--text-primary)]"
                htmlFor="workspace-next-branch-name"
              >
                Branch name
                <Input
                  autoFocus
                  id="workspace-next-branch-name"
                  onChange={(event) => setBranchName(event.target.value)}
                  placeholder="feature/next-iteration"
                  value={branchName}
                />
              </label>
              <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                Branch from <span className="font-mono font-semibold">{targetBranch}</span> at{' '}
                <span className="font-mono font-semibold">{shortHash(commitHash)}</span>
              </div>
              {branchName && branchError ? (
                <p className="text-xs font-semibold text-[var(--status-warning)]" role="alert">
                  {branchError}
                </p>
              ) : (
                <p className="text-xs text-[var(--text-tertiary)]">
                  Use letters, numbers, dots, slashes, underscores, or hyphens.
                </p>
              )}
            </div>
            <DialogFooter className="mt-6">
              <Button onClick={() => setDialogOpen(false)} type="button" variant="canvas-outline">
                Cancel
              </Button>
              <Button
                disabled={!normalizedBranchName || Boolean(branchError) || busy}
                type="submit"
                variant="branch"
              >
                Start on new branch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
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

function getExtractYOpsTitle({
  committedHash,
  flowBlocked,
  isBusy,
  operationCount,
}: {
  committedHash: string | null;
  flowBlocked: boolean;
  isBusy: boolean;
  operationCount: number;
}): string {
  if (committedHash) return 'This workspace is already committed.';
  if (isBusy) return 'A workspace operation is already in progress.';
  if (operationCount === 0) return 'No proposed YOps operations are available yet.';
  if (flowBlocked) return 'Resolve the flow error before validating this proposal.';
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
  blockers,
  committedHash,
  isBusy,
  targetBranch,
}: {
  appliedCount: number;
  blockers: string[];
  committedHash: string | null;
  isBusy: boolean;
  targetBranch: string;
}): string {
  if (committedHash) return 'Workspace result is already committed.';
  if (isBusy) return 'A workspace operation is already in progress.';
  if (appliedCount === 0) return 'Apply YOps before committing the workspace result.';
  if (blockers.length > 0) return blockers[0] ?? 'Resolve commit blockers before committing.';
  return `Commit the materialized YAML result to ${targetBranch}.`;
}

function getUnresolvedSchemaGaps(
  gaps: string[],
  materializedTrees: WorkspaceYOpsTreeNode[] | null,
  rootKey: string
): string[] {
  if (!materializedTrees) return gaps;
  return gaps.filter((gap) => !materializedTreeHasPathValue(materializedTrees, gap, rootKey));
}

function materializedTreeHasPathValue(
  trees: WorkspaceYOpsTreeNode[],
  path: string,
  rootKey: string
): boolean {
  const segments = path
    .replaceAll('/', '.')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments[0] === rootKey) segments.shift();
  if (segments.length === 0) return false;

  const root = trees.find((tree) => tree.key === rootKey);
  if (!root) return false;
  let node: WorkspaceYOpsTreeNode = root;

  for (const [index, segment] of segments.entries()) {
    const isLast = index === segments.length - 1;
    if (isLast && segment in node.slots) return hasMaterializedValue(node.slots[segment]);
    const child = node.children.find((candidate) => candidate.key === segment);
    if (!child) return false;
    node = child;
  }

  return false;
}

function hasMaterializedValue(value: WorkspaceYOpsTreeNode['slots'][string]): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function getCommitBlockers({
  appliedCount,
  baseCommitHash,
  originalTargetBranch,
  hasMaterializedTrees,
  schemaGaps,
  schemaVerdict,
  sourceBundleCount,
  targetBranch,
  validationPassed,
  visibleErrorMessage,
}: {
  appliedCount: number;
  baseCommitHash: string | null;
  originalTargetBranch: string;
  hasMaterializedTrees: boolean;
  schemaGaps: string[];
  schemaVerdict: WorkspaceCandidate['schemaReview']['verdict'];
  sourceBundleCount: number;
  targetBranch: string;
  validationPassed: boolean;
  visibleErrorMessage: string | null;
}): string[] {
  const blockers: string[] = [];

  if (appliedCount === 0 || !hasMaterializedTrees) {
    blockers.push('Apply YOps before committing the workspace result.');
  }
  if (!validationPassed) {
    blockers.push('Validate the YOps proposal before committing.');
  }
  if (sourceBundleCount === 0) {
    blockers.push('Add source evidence before committing.');
  }
  if (baseCommitHash && targetBranch !== originalTargetBranch) {
    blockers.push(
      `Target branch changed from ${originalTargetBranch} to ${targetBranch}. Rebuild this workspace from ${targetBranch} before committing.`
    );
  }
  if (schemaGaps.length > 0) {
    blockers.push(...schemaGaps.map((gap) => `Schema review gap: ${gap}`));
  } else if (schemaVerdict !== 'ready') {
    blockers.push('Resolve schema review before committing.');
  }
  if (visibleErrorMessage) {
    blockers.push(`Resolve flow error: ${visibleErrorMessage}`);
  }

  return blockers;
}

function isSchemaOverrideBlocker(blocker: string): boolean {
  return (
    blocker.startsWith('Schema review gap: ') ||
    blocker === 'Resolve schema review before committing.'
  );
}

function getYOpsViewTitle(view: WorkspaceYOpsFlowView): string {
  if (view === 'validation') return 'Validation';
  if (view === 'preview') return 'Preview';
  if (view === 'commit') return 'Commit';
  return 'Proposal';
}

function getYOpsViewDescription(view: WorkspaceYOpsFlowView): string {
  if (view === 'validation') return 'Check the Proposal against schema, evidence, and replay.';
  if (view === 'preview') return 'Read the rendered PRD and inspect its evidence before commit.';
  if (view === 'commit') return 'Commit the validated workspace result.';
  return 'Review what T3X recommends and why.';
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

function normalizeNewBranchName(value: string): string {
  return value.trim().replace(/\s+/g, '-');
}

function getNewBranchNameError(name: string, existingBranches: string[]): string | null {
  if (!name) return null;
  if (!/^[\w./-]+$/.test(name) || name.startsWith('/') || name.endsWith('/')) {
    return 'Enter a valid branch name without leading or trailing slashes.';
  }
  if (existingBranches.includes(name)) return `Branch “${name}” already exists.`;
  return null;
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
