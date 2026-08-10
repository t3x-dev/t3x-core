import { type TransitionViewV1, YAML_SOURCE_MUTATION_DRIVER_REF } from '@t3x-dev/core';
import {
  ArrowRight,
  CheckCircle2,
  FileCode2,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCommitTransitionView } from '@/hooks/workspaces/useCommitTransitionView';
import {
  useWorkspaceSourceTransition,
  type WorkspaceSourceTask,
} from '@/hooks/workspaces/useWorkspaceSourceTransition';
import type { WorkspaceCandidate, WorkspaceSourceMaterialSelector } from '@/types/workspaces';
import { TransitionDecisionControls } from './TransitionDecisionControls';
import { TransitionReviewPanel } from './TransitionReviewPanel';
import type { WorkspaceYOpsFlowView } from './YOpsDraftTab';

export function SourceTransitionTab({
  active,
  candidate,
  onCommitted,
  onViewChange,
  view,
}: {
  active: boolean;
  candidate: WorkspaceCandidate;
  onCommitted?: (commitHash: string, branch: string, workspace: WorkspaceCandidate) => void;
  onViewChange?: (view: WorkspaceYOpsFlowView) => void;
  view: WorkspaceYOpsFlowView;
}) {
  const sourceTransition = useWorkspaceSourceTransition(candidate);
  const [path, setPath] = useState('logger/level');
  const [expectedValue, setExpectedValue] = useState('DEBUG');
  const [replacementValue, setReplacementValue] = useState('INFO');
  const [why, setWhy] = useState('');
  const [revertWhy, setRevertWhy] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const committedReview = useCommitTransitionView(
    candidate.projectId,
    candidate.targetBranch,
    candidate.lastCommitHash ?? null
  );
  const isImport = !candidate.baseCommitHash && !candidate.lastCommitHash;
  const pathSegments = parseSourcePath(path);
  const change = sourceTask({
    expectedValue,
    isImport,
    path: pathSegments,
    replacementValue,
    root: candidate.sourceArtifact?.root,
  });
  const revertCommitId = reversibleCommitId(committedReview.view, candidate.lastCommitHash);

  if (!active) return null;

  const handleDraftChange = (update: () => void) => {
    update();
    sourceTransition.reset();
    setOverrideReason('');
  };

  const handleReview = async () => {
    if (!change) return;
    const reviewed = await sourceTransition.review(change, why);
    if (reviewed) onViewChange?.('validation');
  };

  const handleRevertReview = async () => {
    if (!revertCommitId) return;
    const reviewed = await sourceTransition.reviewRevert(revertCommitId, revertWhy);
    if (reviewed) onViewChange?.('validation');
  };

  const handleDecision = async (
    outcome: 'accepted' | 'overridden' | 'rejected',
    reason?: string
  ) => {
    const result = await sourceTransition.decide(outcome, reason);
    if (result) onCommitted?.(result.commitId, candidate.targetBranch, result.workspace);
  };

  const pendingReview = sourceTransition.state.view;
  const displayedReview = pendingReview
    ? { error: null, loading: false, view: pendingReview }
    : committedReview;
  const busy =
    sourceTransition.state.phase === 'reviewing' || sourceTransition.state.phase === 'deciding';
  const isRevert = sourceTransition.state.task === 'revert';
  const displayedOperations = sourceOperations(displayedReview.view);

  if (view === 'ops') {
    return (
      <SourceTaskEditor
        busy={busy}
        candidate={candidate}
        error={sourceTransition.state.error}
        expectedValue={expectedValue}
        isImport={isImport}
        onExpectedValueChange={(value) => handleDraftChange(() => setExpectedValue(value))}
        onPathChange={(value) => handleDraftChange(() => setPath(value))}
        onReplacementValueChange={(value) => handleDraftChange(() => setReplacementValue(value))}
        onReview={() => void handleReview()}
        onReviewRevert={() => void handleRevertReview()}
        onRevertWhyChange={(value) => handleDraftChange(() => setRevertWhy(value))}
        onWhyChange={(value) => handleDraftChange(() => setWhy(value))}
        path={path}
        ready={change !== null}
        replacementValue={replacementValue}
        revertCommitId={revertCommitId}
        revertWhy={revertWhy}
        why={why}
      />
    );
  }

  if (view === 'preview') {
    return (
      <SourceChangePreview
        isImport={isImport && !isRevert}
        isRevert={isRevert}
        onContinue={() => onViewChange?.('commit')}
        operations={displayedOperations}
        review={displayedReview}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <SourceFlowHeader
        candidate={candidate}
        isImport={isImport}
        title={
          view === 'validation'
            ? isRevert
              ? 'Revert checks'
              : 'Configuration checks'
            : isRevert
              ? 'Save configuration revert'
              : 'Save configuration change'
        }
      />
      {sourceTransition.state.error ? (
        <div
          className="rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] px-3 py-2 text-sm text-[var(--status-error)]"
          role="alert"
        >
          {sourceTransition.state.error}
        </div>
      ) : null}
      <TransitionReviewPanel {...displayedReview} />
      <RunnerAvailabilityNote runner={sourceTransition.state.runner} />
      {view === 'validation' ? (
        <div className="flex flex-wrap justify-end gap-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
          {!pendingReview ? (
            <Button disabled={!change || busy} onClick={() => void handleReview()} type="button">
              {busy ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Play aria-hidden="true" className="size-4" />
              )}
              Run configuration checks
            </Button>
          ) : (
            <Button onClick={() => onViewChange?.('preview')} type="button" variant="commit">
              Review before and after
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      ) : pendingReview ? (
        <TransitionDecisionControls
          busy={busy}
          onDecide={(outcome, reason) => void handleDecision(outcome, reason)}
          onOverrideReasonChange={setOverrideReason}
          overrideReason={overrideReason}
          view={pendingReview}
        />
      ) : null}
    </div>
  );
}

function sourceTask({
  expectedValue,
  isImport,
  path,
  replacementValue,
  root,
}: {
  expectedValue: string;
  isImport: boolean;
  path: Array<string | number>;
  replacementValue: string;
  root: WorkspaceSourceMaterialSelector | undefined;
}): WorkspaceSourceTask | null {
  if (!root) return null;
  if (isImport) return { mode: 'import', root };
  if (path.length === 0 || !expectedValue || !replacementValue) return null;
  return {
    mode: 'edit',
    operations: [
      {
        op: 'replace_scalar',
        path,
        expect: expectedValue,
        value: replacementValue,
      },
    ],
  };
}

function SourceTaskEditor({
  busy,
  candidate,
  error,
  expectedValue,
  isImport,
  onExpectedValueChange,
  onPathChange,
  onReplacementValueChange,
  onReview,
  onReviewRevert,
  onRevertWhyChange,
  onWhyChange,
  path,
  ready,
  replacementValue,
  revertCommitId,
  revertWhy,
  why,
}: {
  busy: boolean;
  candidate: WorkspaceCandidate;
  error: string | null;
  expectedValue: string;
  isImport: boolean;
  onExpectedValueChange: (value: string) => void;
  onPathChange: (value: string) => void;
  onReplacementValueChange: (value: string) => void;
  onReview: () => void;
  onReviewRevert: () => void;
  onRevertWhyChange: (value: string) => void;
  onWhyChange: (value: string) => void;
  path: string;
  ready: boolean;
  replacementValue: string;
  revertCommitId: string | null;
  revertWhy: string;
  why: string;
}) {
  const artifact = candidate.sourceArtifact;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <SourceFlowHeader candidate={candidate} isImport={isImport} title="Configuration proposal" />
      <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {isImport ? 'Import the selected configuration' : 'Change one YAML scalar'}
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              {isImport
                ? 'The exact Material bytes become the first version. Comments, tags, and key order stay intact.'
                : 'T3X locates this scalar and splices only its source range. The expected value keeps the proposal base-sensitive.'}
            </p>
          </div>
          <Badge variant="outline">{artifact?.rootPath ?? 'No root selected'}</Badge>
        </div>

        {!isImport ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label
              className="grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]"
              htmlFor="workspace-source-path"
            >
              YAML path
              <Input
                className="font-mono"
                id="workspace-source-path"
                onChange={(event) => onPathChange(event.target.value)}
                placeholder="logger/level"
                value={path}
              />
            </label>
            <label
              className="grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]"
              htmlFor="workspace-source-expected-value"
            >
              Current value
              <Input
                className="font-mono"
                id="workspace-source-expected-value"
                onChange={(event) => onExpectedValueChange(event.target.value)}
                value={expectedValue}
              />
            </label>
            <label
              className="grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]"
              htmlFor="workspace-source-replacement-value"
            >
              New value
              <Input
                className="font-mono"
                id="workspace-source-replacement-value"
                onChange={(event) => onReplacementValueChange(event.target.value)}
                value={replacementValue}
              />
            </label>
          </div>
        ) : null}

        <label
          className="mt-4 grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]"
          htmlFor="workspace-source-rationale"
        >
          Why this change? <span className="font-normal">(optional)</span>
          <Textarea
            id="workspace-source-rationale"
            maxLength={2000}
            onChange={(event) => onWhyChange(event.target.value)}
            placeholder="Reduce production log volume while keeping useful diagnostics."
            value={why}
          />
        </label>

        {error ? (
          <p className="mt-3 text-sm text-[var(--status-error)]" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button disabled={!ready || busy} onClick={onReview} type="button" variant="commit">
            {busy ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ShieldCheck aria-hidden="true" className="size-4" />
            )}
            Review and run checks
          </Button>
        </div>
      </section>
      {revertCommitId ? (
        <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Revert the saved change
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                T3X derives the reverse edit from the verified current commit, then reruns the same
                checks before saving a new history entry.
              </p>
            </div>
            <Badge variant="outline">{shortDigest(revertCommitId)}</Badge>
          </div>
          <label
            className="mt-4 grid gap-1.5 text-xs font-semibold text-[var(--text-secondary)]"
            htmlFor="workspace-source-revert-rationale"
          >
            Why revert? <span className="font-normal">(optional)</span>
            <Textarea
              id="workspace-source-revert-rationale"
              maxLength={2000}
              onChange={(event) => onRevertWhyChange(event.target.value)}
              placeholder="Restore the previous configuration while we investigate this change."
              value={revertWhy}
            />
          </label>
          <div className="mt-4 flex justify-end">
            <Button disabled={busy} onClick={onReviewRevert} type="button" variant="outline">
              {busy ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <RotateCcw aria-hidden="true" className="size-4" />
              )}
              Review revert
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SourceChangePreview({
  isImport,
  isRevert,
  onContinue,
  operations,
  review,
}: {
  isImport: boolean;
  isRevert: boolean;
  onContinue: () => void;
  operations: Array<{
    path: Array<string | number>;
    expect: string;
    value: string;
  }>;
  review: Parameters<typeof TransitionReviewPanel>[0];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <TransitionReviewPanel {...review} />
      <section className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {isRevert ? 'Source-preserving revert preview' : 'Source-preserving preview'}
        </h3>
        {isImport ? (
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            The selected root configuration will be imported byte-for-byte as the first saved
            version.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {operations.map((operation, index) => (
              <div
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                key={`${operation.path.join('/')}:${index}`}
              >
                <SourceValueCard label="Before" path={operation.path} value={operation.expect} />
                <SourceValueCard label="After" path={operation.path} value={operation.value} />
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={onContinue} type="button" variant="commit">
            Continue to decision
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}

function SourceValueCard({
  label,
  path,
  value,
}: {
  label: string;
  path: Array<string | number>;
  value: string;
}) {
  return (
    <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{path.join('/')}</span>
      </div>
      <pre className="mt-3 overflow-auto rounded bg-[var(--surface-card)] p-3 font-mono text-sm text-[var(--text-primary)]">
        {value}
      </pre>
    </div>
  );
}

function SourceFlowHeader({
  candidate,
  isImport,
  title,
}: {
  candidate: WorkspaceCandidate;
  isImport: boolean;
  title: string;
}) {
  return (
    <header className="flex flex-wrap items-start gap-3 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--source)]/10 text-[var(--source)]">
        <FileCode2 aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {isImport ? 'Import exact YAML' : 'Edit exact YAML'} on{' '}
          <span className="font-mono">{candidate.targetBranch}</span>
        </p>
      </div>
      <Badge variant="success">
        <CheckCircle2 aria-hidden="true" className="mr-1 size-3" />
        Source preserving
      </Badge>
    </header>
  );
}

function RunnerAvailabilityNote({
  runner,
}: {
  runner: ReturnType<typeof useWorkspaceSourceTransition>['state']['runner'];
}) {
  if (!runner || runner.mode === 'statement') return null;
  const text =
    runner.mode === 'not_configured'
      ? 'ESPHome environment check is not configured. No Runner result was fabricated.'
      : runner.mode === 'inputs_unavailable'
        ? `ESPHome check could not access the required secret references: ${runner.secretReferenceNames.join(', ')}.`
        : runner.reason === 'timed_out'
          ? 'The ESPHome environment timed out. No Runner conclusion was recorded.'
          : 'The ESPHome environment is unavailable. No Runner conclusion was recorded.';
  return (
    <p className="rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
      {text}
    </p>
  );
}

function parseSourcePath(value: string): Array<string | number> {
  const segments = value
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.map((segment) => (/^(0|[1-9]\d*)$/.test(segment) ? Number(segment) : segment));
}

function reversibleCommitId(
  view: TransitionViewV1 | null,
  selectedCommitId: string | undefined
): string | null {
  if (
    !selectedCommitId ||
    view?.mode !== 'transition' ||
    view.history.observation !== 'committed' ||
    view.history.commit.id !== selectedCommitId ||
    view.change.driver.protocol !== YAML_SOURCE_MUTATION_DRIVER_REF.protocol ||
    view.change.driver.protocolVersion !== YAML_SOURCE_MUTATION_DRIVER_REF.protocolVersion ||
    view.change.driver.specDigest !== YAML_SOURCE_MUTATION_DRIVER_REF.specDigest ||
    sourceOperations(view).length !== view.change.operations.length ||
    view.change.operations.length === 0
  ) {
    return null;
  }
  return selectedCommitId;
}

function sourceOperations(view: TransitionViewV1 | null): Array<{
  path: Array<string | number>;
  expect: string;
  value: string;
}> {
  if (view?.mode !== 'transition') return [];
  return view.change.operations.flatMap((operation) => {
    if (
      !operation ||
      typeof operation !== 'object' ||
      Array.isArray(operation) ||
      operation.op !== 'replace_scalar' ||
      !Array.isArray(operation.path) ||
      !operation.path.every(
        (segment) => typeof segment === 'string' || (typeof segment === 'number' && segment >= 0)
      ) ||
      typeof operation.expect !== 'string' ||
      typeof operation.value !== 'string'
    ) {
      return [];
    }
    return [
      {
        path: operation.path as Array<string | number>,
        expect: operation.expect,
        value: operation.value,
      },
    ];
  });
}

function shortDigest(value: string): string {
  return value.length > 18 ? `${value.slice(0, 14)}…${value.slice(-4)}` : value;
}
