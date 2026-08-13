import { ArrowRight, Code2, Loader2, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { T3XDiff } from '@/components/shared/T3XDiff';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { StructuredDiffChange, StructuredDiffKind } from '@/domain/diff/structuredStateDiff';
import { workspaceYOpsScriptForEditor } from '@/domain/workspaces/yopsScript';
import type {
  SourceBundleItem,
  WorkspaceCandidate,
  WorkspaceProposalGenerationView,
  WorkspaceProposalPosture,
  WorkspaceYOpsDraftOperation,
} from '@/types/workspaces';
import type { WorkspaceYOpsValue } from '@/types/workspaceYops';
import { cn } from '@/utils/cn';
import {
  type ProposalGenerationAction,
  ProposalGenerationReviewView,
} from './ProposalGenerationReviewView';
import { ProposalPostureSelector, proposalPostureOption } from './ProposalPostureSelector';
import { WorkspaceYOpsEditor } from './WorkspaceYOpsEditor';

interface ProposalReviewViewProps {
  candidate: WorkspaceCandidate;
  flowError?: string | null;
  onContinueToValidation?: () => void;
  onGenerateProposal?: () => Promise<void> | void;
  onProposalAction?: (action: ProposalGenerationAction) => Promise<void> | void;
  onProposalPostureChange?: (posture: WorkspaceProposalPosture) => void;
  onVerifyProposal?: () => Promise<void> | void;
  onSendToYOps?: () => Promise<void> | void;
  onSaveYOpsScript?: (script: string) => Promise<void> | void;
  proposalMode: string;
  proposalPosture?: WorkspaceProposalPosture;
  proposalGeneration?: WorkspaceProposalGenerationView;
  proposalGenerationBusy?: boolean;
  proposalDecisionState?: 'undecided' | 'accepted' | 'rejected' | 'committed';
  sendingToYOps: boolean;
  statusText: string;
  yopsDraftSent: boolean;
  yopsLines: string[];
  yopsReadOnly?: boolean;
  yopsReadOnlyReason?: string;
}

export function ProposalReviewView({
  candidate,
  flowError,
  onContinueToValidation,
  onGenerateProposal,
  onProposalAction,
  onProposalPostureChange,
  onVerifyProposal,
  onSendToYOps,
  onSaveYOpsScript,
  proposalMode,
  proposalPosture = 'guided',
  proposalGeneration,
  proposalGenerationBusy = false,
  proposalDecisionState = 'undecided',
  sendingToYOps,
  statusText,
  yopsDraftSent,
  yopsLines,
  yopsReadOnly = false,
  yopsReadOnlyReason,
}: ProposalReviewViewProps) {
  const operations = candidate.yopsDraft.operations;
  const [selectedOperationId, setSelectedOperationId] = useState(operations.at(-1)?.id ?? null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [yopsOpen, setYOpsOpen] = useState(false);
  const selectedOperation =
    operations.find((operation) => operation.id === selectedOperationId) ?? operations[0] ?? null;
  const selectedIndex = Math.max(
    operations.findIndex((operation) => operation.id === selectedOperation?.id),
    0
  );

  useEffect(() => {
    setSelectedOperationId(operations.at(-1)?.id ?? null);
  }, [candidate.id, candidate.yopsDraft.id, operations]);

  if (proposalGeneration && onGenerateProposal && onProposalPostureChange && onVerifyProposal) {
    return (
      <ProposalGenerationReviewView
        actionBusy={proposalGenerationBusy}
        actionState={proposalDecisionState}
        error={flowError}
        onAction={onProposalAction}
        onPostureChange={onProposalPostureChange}
        onRegenerate={onGenerateProposal}
        onVerify={onVerifyProposal}
        selectedPosture={proposalPosture}
        view={proposalGeneration}
      />
    );
  }

  const posture = proposalPostureOption(proposalPosture);

  return (
    <section aria-label="YOps proposal" className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-[72px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
            Proposal
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
            Review what T3X proposes, what supports it, and why.
          </p>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <Badge variant="branch-subtle">
            {candidate.sourceBundle.length}{' '}
            {candidate.sourceBundle.length === 1 ? 'source' : 'sources'}
          </Badge>
          <Badge variant="secondary">
            {operations.length} {operations.length === 1 ? 'recommendation' : 'recommendations'}
          </Badge>
          <Badge variant="outline">{proposalMode}</Badge>
          {yopsDraftSent ? <Badge variant="pending-subtle">Proposal ready</Badge> : null}
          <span className="max-w-40 truncate text-[10px] font-medium text-[var(--text-tertiary)]">
            {statusText}
          </span>
          <Button
            aria-expanded={yopsOpen}
            onClick={() => setYOpsOpen((current) => !current)}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <Code2 aria-hidden="true" className="size-4" />
            {yopsOpen ? 'Close YOps' : 'Open YOps'}
          </Button>
          <Button
            disabled={operations.length === 0}
            onClick={onContinueToValidation}
            size="sm"
            type="button"
            variant="commit"
          >
            Continue to Validation
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </header>

      {flowError ? (
        <div
          className="border-b border-[var(--status-warning)]/20 bg-[var(--status-warning-muted)] px-4 py-2 text-xs text-[var(--text-secondary)]"
          role="alert"
        >
          {flowError}
        </div>
      ) : null}

      {onGenerateProposal && onProposalPostureChange ? (
        <section className="border-b border-[var(--source)]/20 bg-[var(--source)]/[0.07] px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                1 · Proposal mode
              </p>
              <ProposalPostureSelector
                disabled={proposalGenerationBusy}
                onChange={onProposalPostureChange}
                value={proposalPosture}
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{posture.policy}</Badge>
                <Badge variant="secondary">One mode per generation</Badge>
              </div>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {posture.title}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                {posture.description}
              </p>
            </div>
            <Button
              disabled={proposalGenerationBusy}
              onClick={onGenerateProposal}
              size="sm"
              type="button"
              variant="commit"
            >
              {proposalGenerationBusy ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              Generate governed proposal
            </Button>
          </div>
        </section>
      ) : null}

      {yopsOpen ? (
        <YOpsScriptPanel
          lines={yopsLines}
          onSave={onSaveYOpsScript}
          readOnly={yopsReadOnly || !onSaveYOpsScript}
          readOnlyReason={yopsReadOnlyReason}
          resetKey={candidate.id}
        />
      ) : null}

      {selectedOperation ? (
        <>
          <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]">
            <aside
              aria-label="Recommendations"
              className="flex min-h-[430px] min-w-0 flex-col border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] lg:border-r lg:border-b-0"
            >
              <div className="flex min-h-[54px] items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-2.5">
                <div>
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                    Recommendations
                  </h4>
                  <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                    Source-backed suggestions · replay order
                  </p>
                </div>
                <Badge variant="secondary">{operations.length}</Badge>
              </div>
              <ol className="min-h-0 flex-1 overflow-auto">
                {operations.map((operation, index) => (
                  <li key={operation.id}>
                    <button
                      aria-current={operation.id === selectedOperation.id ? 'true' : undefined}
                      className={cn(
                        'grid min-h-[82px] w-full grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b border-[var(--stroke-divider)] px-3 py-3 text-left transition-colors',
                        operation.id === selectedOperation.id
                          ? 'border-l-2 border-l-[var(--accent-branch)] bg-[var(--diff-modified-bg)]'
                          : 'border-l-2 border-l-transparent bg-[var(--surface-card)] hover:bg-[var(--hover-bg)]'
                      )}
                      onClick={() => setSelectedOperationId(operation.id)}
                      type="button"
                    >
                      <span className="pt-0.5 font-mono text-xs font-semibold text-[var(--text-tertiary)]">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-start gap-2">
                          <Badge variant="outline">{operation.op.toUpperCase()}</Badge>
                          <strong className="min-w-0 flex-1 text-sm leading-5 text-[var(--text-primary)]">
                            {operation.summary}
                          </strong>
                        </span>
                        <span className="mt-1 block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                          {operation.path}
                        </span>
                        <span className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                          <span className="font-semibold text-[var(--status-success)]">
                            {operation.sourceRefs?.length ? 'Source matched' : 'Source required'}
                          </span>
                          <span className="text-[var(--text-tertiary)]">
                            1 YOp · affects 1 field
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {onSendToYOps ? (
                <footer className="border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
                  <Button
                    className="w-full"
                    disabled={sendingToYOps}
                    onClick={onSendToYOps}
                    size="sm"
                    type="button"
                    variant="canvas-outline"
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

            <ProposalDetail
              candidate={candidate}
              index={selectedIndex}
              operation={selectedOperation}
            />
          </div>

          <WorkspaceDiff
            candidate={candidate}
            onOpenChange={() => setDiffOpen((current) => !current)}
            onSelectOperation={setSelectedOperationId}
            open={diffOpen}
            phase="proposal"
            selectedOperation={selectedOperation}
          />
        </>
      ) : (
        <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">No proposed YOps operations yet.</strong>
          <span>Add source evidence and generate a YOps proposal before validating.</span>
          {onSendToYOps ? (
            <Button
              className="mt-2"
              disabled={sendingToYOps}
              onClick={onSendToYOps}
              size="sm"
              type="button"
              variant="canvas-outline"
            >
              {sendingToYOps ? 'Generating proposal...' : 'Generate YOps proposal'}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ProposalDetail({
  candidate,
  index,
  operation,
}: {
  candidate: WorkspaceCandidate;
  index: number;
  operation: WorkspaceYOpsDraftOperation;
}) {
  const source = getPrimaryOperationSource(candidate, operation);
  const sourceExcerpt = getSourceExcerpt(source, operation);

  return (
    <article aria-label="Selected recommendation" className="min-w-0 bg-[var(--surface-card)]">
      <header className="flex min-h-[78px] flex-wrap items-start gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
            Recommendation {String(index + 1).padStart(2, '0')}
          </p>
          <h4 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
            {operation.summary}
          </h4>
          <p className="mt-1 break-all font-mono text-[10px] text-[var(--text-tertiary)]">
            {operation.path}
          </p>
        </div>
        <Badge variant="pending-subtle">Proposed</Badge>
      </header>

      <section className="border-b border-[var(--stroke-divider)] px-4 py-4">
        <SectionLabel>1 · Source</SectionLabel>
        <div className="mt-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
          <blockquote className="text-sm leading-6 text-[var(--text-primary)]">
            “{sourceExcerpt}”
          </blockquote>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--stroke-divider)] pt-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {source?.title ?? 'Workspace source bundle'}
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                {source?.id ?? operation.sourceRefs?.[0] ?? 'source reference unavailable'}
              </p>
            </div>
            <Badge variant={source ? 'success' : 'warning'}>{source ? 'Matched' : 'Review'}</Badge>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--stroke-divider)] px-4 py-4">
        <SectionLabel>2 · Reason</SectionLabel>
        <div className="mt-2 border-l-2 border-l-[var(--accent-branch)] bg-[var(--diff-modified-bg)] px-3 py-2.5">
          <p className="text-sm leading-6 text-[var(--text-primary)]">
            {operation.reason ?? 'This recommendation is derived from the matched source evidence.'}
          </p>
        </div>
      </section>

      <section className="px-4 py-4">
        <SectionLabel>3 · Proposed value</SectionLabel>
        <div className="mt-2 overflow-hidden rounded-md border border-[var(--status-success)]/30 bg-[var(--status-success-muted)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--status-success)]/20 px-3 py-2 text-[10px]">
            <strong className="uppercase tracking-[0.08em] text-[var(--status-success)]">
              Proposed
            </strong>
            <span className="text-[var(--text-tertiary)]">Recommendation · not applied</span>
          </div>
          <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-[var(--text-primary)]">
            {formatDisplayValue(operation.afterValue)}
          </pre>
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--status-success)]/20 px-3 py-2">
            <Badge variant="outline">{operation.op.toUpperCase()}</Badge>
            <Badge variant="outline">affects 1 field</Badge>
          </div>
        </div>
      </section>
    </article>
  );
}

export function WorkspaceDiff({
  candidate,
  onOpenChange,
  onSelectOperation,
  open,
  phase,
  schemaPassed = false,
  selectedOperation,
}: {
  candidate: WorkspaceCandidate;
  onOpenChange: () => void;
  onSelectOperation: (operationId: string) => void;
  open: boolean;
  phase: 'proposal' | 'validation';
  schemaPassed?: boolean;
  selectedOperation: WorkspaceYOpsDraftOperation;
}) {
  const operations = candidate.yopsDraft.operations;
  const changes = operations.map((operation) =>
    workspaceOperationToDiffChange(candidate, operation)
  );

  return (
    <T3XDiff
      baselineLabel="Baseline"
      changes={changes}
      headerSubtitle={
        phase === 'validation'
          ? 'Validated projection · Baseline → Projected'
          : 'Proposal · Baseline → Projected'
      }
      onOpenChange={onOpenChange}
      onSelectChange={onSelectOperation}
      open={open}
      pathSubtitle="Preview component · node-level result"
      projectedLabel="Projected"
      secondaryStat={
        phase === 'validation' ? (
          <Badge variant={schemaPassed ? 'success' : 'pending-subtle'}>
            YSchema {schemaPassed ? 'pass' : 'pending'}
          </Badge>
        ) : undefined
      }
      selectedChangeId={selectedOperation.id}
    />
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h5 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
      {children}
    </h5>
  );
}

function YOpsScriptPanel({
  lines,
  onSave,
  readOnly,
  readOnlyReason,
  resetKey,
}: {
  lines: string[];
  onSave?: (script: string) => Promise<void> | void;
  readOnly: boolean;
  readOnlyReason?: string;
  resetKey: string;
}) {
  const initialScript = useMemo(() => workspaceYOpsScriptForEditor(lines), [lines]);
  const lastInitialScriptRef = useRef(initialScript);
  const lastResetKeyRef = useRef(resetKey);
  const [script, setScript] = useState(initialScript);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = script !== initialScript;

  useEffect(() => {
    const previousInitialScript = lastInitialScriptRef.current;
    const previousResetKey = lastResetKeyRef.current;
    const targetChanged = resetKey !== previousResetKey;
    lastInitialScriptRef.current = initialScript;
    lastResetKeyRef.current = resetKey;

    setScript((current) => {
      if (targetChanged || current === previousInitialScript) return initialScript;
      return current;
    });
    if (targetChanged) setErrorMessage(null);
    setSaved(false);
  }, [initialScript, resetKey]);

  async function handleSave() {
    if (!onSave || readOnly || !dirty || saving) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await onSave(script);
      setSaved(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save YOps changes.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="YOps script" className="border-b border-[var(--stroke-divider)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--stroke-divider)] bg-[var(--editor-gutter)] px-4 py-2">
        <span className="text-xs font-semibold text-[var(--text-primary)]">YOps plan</span>
        <Badge
          variant={
            readOnly ? 'secondary' : dirty ? 'pending-subtle' : saved ? 'success' : 'commit-subtle'
          }
        >
          {readOnly ? 'Read only' : dirty ? 'Unsaved changes' : saved ? 'Saved' : 'Editable'}
        </Badge>
        {readOnly && readOnlyReason ? (
          <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-tertiary)]">
            {readOnlyReason}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-tertiary)]">
            Save changes, then validate this proposal again.
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            disabled={!dirty || saving}
            onClick={() => {
              setScript(initialScript);
              setErrorMessage(null);
              setSaved(false);
            }}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Revert
          </Button>
          <Button
            disabled={readOnly || !dirty || saving}
            onClick={() => void handleSave()}
            size="sm"
            type="button"
            variant="commit"
          >
            {saving ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="size-4" />
            )}
            Save changes
          </Button>
        </div>
      </div>
      {errorMessage ? (
        <div
          className="border-b border-[var(--status-error)]/20 bg-[var(--status-error-muted)] px-4 py-2 text-xs font-semibold text-[var(--status-error)]"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}
      <div className="h-80 min-h-0 bg-[var(--editor-bg)]">
        <WorkspaceYOpsEditor
          onChange={(nextScript) => {
            setScript(nextScript);
            setErrorMessage(null);
            setSaved(false);
          }}
          readOnly={readOnly || saving}
          value={script}
        />
      </div>
    </section>
  );
}

function workspaceOperationToDiffChange(
  candidate: WorkspaceCandidate,
  operation: WorkspaceYOpsDraftOperation
): StructuredDiffChange {
  const source = getPrimaryOperationSource(candidate, operation);
  const kind = workspaceOperationKind(operation);
  return {
    afterValue: formatDisplayValue(operation.afterValue),
    beforeValue: formatDisplayValue(operation.beforeValue),
    evidence: source ? getSourceExcerpt(source, operation) : undefined,
    evidenceSource: source?.title,
    id: operation.id,
    kind,
    op: operation.op.toUpperCase(),
    path: operation.path,
    reason: operation.reason ?? 'No operation rationale provided.',
    summary: operation.summary,
  };
}

function workspaceOperationKind(operation: WorkspaceYOpsDraftOperation): StructuredDiffKind {
  if (/delete|drop|remove|unset/i.test(operation.op)) return 'removed';
  if (/append|add|create|define|populate/i.test(operation.op)) return 'added';
  return 'modified';
}

function getPrimaryOperationSource(
  candidate: WorkspaceCandidate,
  operation: WorkspaceYOpsDraftOperation
): SourceBundleItem | undefined {
  const sourceRefs = operation.sourceRefs ?? [];
  return candidate.sourceBundle.find((source) => sourceRefs.includes(source.id));
}

function getSourceExcerpt(
  source: SourceBundleItem | undefined,
  operation: WorkspaceYOpsDraftOperation
): string {
  const userTurn = source?.previewTurns?.find((turn) => turn.role === 'user');
  const previewTurn = userTurn ?? source?.previewTurns?.at(-1);
  return (
    previewTurn?.content ??
    source?.previewText ??
    source?.description ??
    operation.reason ??
    'No source excerpt is available for this recommendation.'
  );
}

function formatDisplayValue(value: WorkspaceYOpsValue | undefined): string {
  if (value === undefined || value === '') return 'Empty';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}
