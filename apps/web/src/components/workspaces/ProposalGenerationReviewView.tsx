import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  WorkspaceProposalGenerationGroup,
  WorkspaceProposalGenerationView,
  WorkspaceProposalOrigin,
  WorkspaceProposalPosture,
} from '@/types/workspaces';
import { cn } from '@/utils/cn';
import { ProposalPostureSelector, proposalPostureOption } from './ProposalPostureSelector';

export type ProposalGenerationAction = 'prepare_changes' | 'revision';
export type ProposalGenerationReviewState = 'undecided' | 'ready_for_changes';

export function ProposalGenerationReviewView({
  actionBusy,
  actionState,
  error,
  onAction,
  onPostureChange,
  onRegenerate,
  onVerify,
  selectedPosture,
  view,
}: {
  actionBusy?: boolean;
  actionState?: ProposalGenerationReviewState;
  error?: string | null;
  onAction?: (action: ProposalGenerationAction) => Promise<void> | void;
  onPostureChange: (posture: WorkspaceProposalPosture) => void;
  onRegenerate: () => Promise<void> | void;
  onVerify: () => Promise<void> | void;
  selectedPosture: WorkspaceProposalPosture;
  view: WorkspaceProposalGenerationView;
}) {
  const groups = view.generation.groups;
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? null);
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null,
    [groups, selectedGroupId]
  );
  const selectedIndex = Math.max(
    groups.findIndex((group) => group.id === selectedGroup?.id),
    0
  );
  const posture = proposalPostureOption(selectedPosture);
  const generatedWithSelectedPosture = view.generation.posture === selectedPosture;

  return (
    <section aria-label="Governed proposal review" className="flex min-h-0 flex-1 flex-col">
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
          <Badge variant="secondary">
            {groups.length} {groups.length === 1 ? 'outcome' : 'outcomes'}
          </Badge>
          <Badge variant={verificationBadgeVariant(view.generation.verification.status)}>
            {verificationLabel(view.generation.verification.status)}
          </Badge>
          <Badge variant={decisionHeaderBadgeVariant(actionState ?? 'undecided')}>
            {decisionHeaderLabel(actionState ?? 'undecided')}
          </Badge>
        </div>
      </header>

      <section className="border-b border-[var(--source)]/20 bg-[var(--source)]/[0.07] px-4 py-3">
        <div className="grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)_auto] lg:items-center">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              1 · Proposal mode
            </p>
            <ProposalPostureSelector
              disabled={actionBusy}
              onChange={onPostureChange}
              value={selectedPosture}
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{posture.policy}</Badge>
              {!generatedWithSelectedPosture ? (
                <Badge variant="warning">Regenerate to apply</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{posture.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
              {posture.description}
            </p>
          </div>
          <Button
            disabled={actionBusy}
            onClick={onRegenerate}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            {actionBusy ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <RotateCcw aria-hidden="true" className="size-4" />
            )}
            Regenerate
          </Button>
        </div>
      </section>

      {error ? (
        <div
          className="border-b border-[var(--status-error)]/20 bg-[var(--status-error-muted)] px-4 py-2 text-xs text-[var(--status-error)]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {selectedGroup ? (
        <div className="grid min-h-0 grid-cols-1 xl:grid-cols-[330px_minmax(420px,1fr)_370px]">
          <ProposalGroupList
            groups={groups}
            onSelect={setSelectedGroupId}
            selectedGroupId={selectedGroup.id}
          />
          <ProposalGroupDetail group={selectedGroup} index={selectedIndex} />
          <ProposalVerification
            actionBusy={actionBusy}
            actionState={actionState ?? 'undecided'}
            onAction={onAction}
            onVerify={onVerify}
            postureMatchesSelection={generatedWithSelectedPosture}
            view={view}
          />
        </div>
      ) : (
        <div className="flex min-h-[360px] items-center justify-center p-6 text-sm text-[var(--text-secondary)]">
          This generation produced no reviewable change groups.
        </div>
      )}
    </section>
  );
}

function ProposalGroupList({
  groups,
  onSelect,
  selectedGroupId,
}: {
  groups: WorkspaceProposalGenerationGroup[];
  onSelect: (groupId: string) => void;
  selectedGroupId: string;
}) {
  return (
    <aside
      aria-label="Proposal outcomes"
      className="min-w-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] xl:border-r xl:border-b-0"
    >
      <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-2.5">
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">
            2 · Proposal outcomes
          </h4>
          <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
            Grouped by origin and affected fields
          </p>
        </div>
        <Badge variant="secondary">{groups.length}</Badge>
      </div>
      <ol className="max-h-[680px] overflow-auto">
        {groups.map((group, index) => (
          <li key={group.id}>
            <button
              aria-current={group.id === selectedGroupId ? 'true' : undefined}
              className={cn(
                'grid min-h-[102px] w-full grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b border-[var(--stroke-divider)] px-3 py-3 text-left transition-colors',
                group.id === selectedGroupId
                  ? 'border-l-2 border-l-[var(--accent-branch)] bg-[var(--diff-modified-bg)]'
                  : 'border-l-2 border-l-transparent bg-[var(--surface-card)] hover:bg-[var(--hover-bg)]'
              )}
              onClick={() => onSelect(group.id)}
              type="button"
            >
              <span className="pt-0.5 font-mono text-xs font-semibold text-[var(--text-tertiary)]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0">
                <Badge variant={originBadgeVariant(group.origin)}>
                  {originLabel(group.origin)}
                </Badge>
                <strong className="mt-1.5 block text-sm leading-5 text-[var(--text-primary)]">
                  {groupTitle(group)}
                </strong>
                <span className="mt-1 block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
                  {group.paths.join(', ') || group.id}
                </span>
                <span className="mt-2 block text-[10px] text-[var(--text-secondary)]">
                  {group.operations.length}{' '}
                  {group.operations.length === 1 ? 'operation' : 'operations'}
                  {group.challenges.length > 0
                    ? ` · ${group.challenges.length} ${group.challenges.length === 1 ? 'challenge' : 'challenges'}`
                    : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function ProposalGroupDetail({
  group,
  index,
}: {
  group: WorkspaceProposalGenerationGroup;
  index: number;
}) {
  return (
    <article aria-label="Selected proposal outcome" className="min-w-0 bg-[var(--surface-card)]">
      <header className="flex min-h-[78px] flex-wrap items-start gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
            Outcome {String(index + 1).padStart(2, '0')}
          </p>
          <h4 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
            {groupTitle(group)}
          </h4>
          <p className="mt-1 break-all font-mono text-[10px] text-[var(--text-tertiary)]">
            {group.paths.join(', ') || group.id}
          </p>
        </div>
        <Badge variant={originBadgeVariant(group.origin)}>{originLabel(group.origin)}</Badge>
      </header>

      <ReviewSection label="1 · Basis">
        <p className="text-xs leading-5 text-[var(--text-secondary)]">
          {group.evidence.length > 0
            ? `${group.evidence.length} exact source ${group.evidence.length === 1 ? 'reference is' : 'references are'} cited for this outcome.`
            : group.basis.length > 0
              ? `${group.basis.length} explicit ${group.basis.length === 1 ? 'basis item supports' : 'basis items support'} this outcome.`
              : 'No primary source evidence is claimed for this outcome.'}
        </p>
        <div className="mt-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-[var(--text-primary)]">
            {formatEvidence(group.evidence[0] ?? group.basis[0] ?? 'No source span available')}
          </pre>
        </div>
      </ReviewSection>

      <ReviewSection label="2 · Reason and boundary">
        <div className="border-l-2 border-l-[var(--accent-branch)] bg-[var(--diff-modified-bg)] px-3 py-2.5">
          <p className="text-sm leading-6 text-[var(--text-primary)]">
            {group.reason || 'No authored reason was supplied.'}
          </p>
          {group.assumptions.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-[var(--text-secondary)]">
              {group.assumptions.map((assumption) => (
                <li key={assumption}>Assumption: {assumption}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {group.challenges.length > 0 ? (
          <div className="mt-3 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] p-3">
            <p className="text-xs font-semibold text-[var(--text-primary)]">Challenge to review</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              {group.challenges[0]!.reason}
            </p>
          </div>
        ) : null}
      </ReviewSection>

      <ReviewSection label="3 · Proposed value" last>
        <div className="grid overflow-hidden rounded-md border border-[var(--stroke-divider)] sm:grid-cols-2">
          <ValueColumn
            label="Before"
            tone="before"
            values={group.values.map((value) => value.before)}
          />
          <ValueColumn
            label="After · not applied"
            tone="after"
            values={group.values.map((value) => value.after)}
          />
        </div>
      </ReviewSection>
    </article>
  );
}

function ProposalVerification({
  actionBusy,
  actionState,
  onAction,
  onVerify,
  postureMatchesSelection,
  view,
}: {
  actionBusy?: boolean;
  actionState: ProposalGenerationReviewState;
  onAction?: (action: ProposalGenerationAction) => Promise<void> | void;
  onVerify: () => Promise<void> | void;
  postureMatchesSelection: boolean;
  view: WorkspaceProposalGenerationView;
}) {
  const verification = view.generation.verification;
  const replay = view.transition.checks.replay;
  const validation = view.transition.checks.validation;
  const replayPassed = checkPassed(replay);
  const validationPassed = checkPassed(validation);
  const validationNotRequired = validation.observation === 'no_statement_observed';
  const canPrepareChangesReview =
    verification.status === 'passed' &&
    replayPassed &&
    (validationPassed || validationNotRequired) &&
    postureMatchesSelection &&
    actionState === 'undecided';

  return (
    <aside className="min-w-0 border-t border-[var(--stroke-divider)] bg-[var(--surface-panel)] xl:border-t-0 xl:border-l">
      <section className="border-b border-[var(--stroke-divider)] p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">3 · Verify</h4>
          <Badge variant={verificationBadgeVariant(verification.status)}>
            {verificationLabel(verification.status)}
          </Badge>
        </div>
        <div
          className={cn(
            'mt-3 rounded-md border p-3',
            verificationSummaryClass(verification.status)
          )}
        >
          <div className="flex items-start gap-2">
            {verification.status === 'passed' ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            )}
            <div>
              <p className="text-xs font-semibold">
                {verification.status === 'passed'
                  ? 'All required posture checks passed'
                  : verification.status === 'failed'
                    ? 'Verification found blocking issues'
                    : 'Verification has not completed'}
              </p>
              <p className="mt-1 text-xs leading-5">
                {verification.findings[0]?.message ??
                  'Replay, posture policy, and evidence integrity remain separately visible.'}
              </p>
            </div>
          </div>
        </div>
        <ul className="mt-3 divide-y divide-[var(--stroke-divider)] border-y border-[var(--stroke-divider)] text-xs">
          <CheckRow label="Deterministic replay" passed={replayPassed} />
          <CheckRow
            label="Schema validation"
            passed={validationPassed}
            pendingLabel={validationNotRequired ? 'Not required' : 'Attention'}
            tone={validationNotRequired ? 'neutral' : 'warning'}
          />
          <CheckRow label="Posture policy" passed={verification.status === 'passed'} />
          <CheckRow label="Changes decision" passed={false} pendingLabel="In Changes" />
        </ul>
        <Button
          className="mt-3 w-full"
          disabled={actionBusy}
          onClick={onVerify}
          size="sm"
          type="button"
          variant="canvas-outline"
        >
          {actionBusy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          Re-run verification
        </Button>
      </section>

      <section className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">4 · Changes handoff</h4>
          <Badge variant={reviewBadgeVariant(actionState)}>{reviewLabel(actionState)}</Badge>
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
          Select the reviewed proposal, then continue through Validation and Changes. Final accept,
          reject, override, and commit actions stay backed by an immutable ReviewSnapshot.
        </p>
        <div className="mt-3 grid gap-2">
          <Button
            disabled={actionBusy || actionState !== 'undecided'}
            onClick={() => onAction?.('revision')}
            size="sm"
            type="button"
            variant="canvas-outline"
          >
            Request revision
          </Button>
          <Button
            disabled={actionBusy || !canPrepareChangesReview}
            onClick={() => onAction?.('prepare_changes')}
            size="sm"
            type="button"
            variant="commit"
          >
            {actionBusy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {actionState === 'ready_for_changes' ? 'Ready for Changes' : 'Prepare Changes review'}
          </Button>
        </div>
      </section>
    </aside>
  );
}

function ReviewSection({
  children,
  label,
  last,
}: {
  children: ReactNode;
  label: string;
  last?: boolean;
}) {
  return (
    <section className={cn('px-4 py-4', last ? '' : 'border-b border-[var(--stroke-divider)]')}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function ValueColumn({
  label,
  tone,
  values,
}: {
  label: string;
  tone: 'before' | 'after';
  values: Array<{ availability: 'available'; value: unknown } | { availability: 'unavailable' }>;
}) {
  return (
    <div
      className={cn(
        'min-w-0 p-3 sm:first:border-r sm:first:border-[var(--stroke-divider)]',
        tone === 'before' ? 'bg-[var(--diff-removed-bg)]' : 'bg-[var(--diff-added-bg)]'
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[var(--text-primary)]">
        {values.map(formatGenerationValue).join('\n')}
      </pre>
    </div>
  );
}

function CheckRow({
  label,
  passed,
  pendingLabel = 'Attention',
  tone = 'warning',
}: {
  label: string;
  passed: boolean;
  pendingLabel?: string;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <strong
        className={
          passed
            ? 'text-[var(--status-success)]'
            : tone === 'neutral'
              ? 'text-[var(--text-tertiary)]'
              : 'text-[var(--status-warning)]'
        }
      >
        {passed ? 'Passed' : pendingLabel}
      </strong>
    </li>
  );
}

function checkPassed(check: { observation: string; outcomes: string[] }): boolean {
  return (
    check.observation === 'observed' &&
    check.outcomes.length > 0 &&
    check.outcomes.every((outcome) => ['confirmed', 'passed', 'verified'].includes(outcome))
  );
}

function groupTitle(group: WorkspaceProposalGenerationGroup): string {
  const path = group.paths[0] ?? group.id;
  if (group.origin === 'source_backed') return `Apply source-backed change to ${path}`;
  if (group.origin === 'inferred') return `Review inferred change to ${path}`;
  return `Review recommended change to ${path}`;
}

function originLabel(origin: WorkspaceProposalOrigin): string {
  if (origin === 'source_backed') return 'Source-backed';
  if (origin === 'inferred') return 'Inferred';
  return 'Recommended';
}

function originBadgeVariant(origin: WorkspaceProposalOrigin): 'outline' | 'secondary' | 'warning' {
  if (origin === 'source_backed') return 'outline';
  if (origin === 'inferred') return 'secondary';
  return 'warning';
}

function verificationLabel(status: 'pending' | 'passed' | 'failed'): string {
  if (status === 'passed') return 'Verify passed';
  if (status === 'failed') return 'Verify failed';
  return 'Verify pending';
}

function verificationBadgeVariant(
  status: 'pending' | 'passed' | 'failed'
): 'success' | 'warning' | 'destructive' {
  if (status === 'passed') return 'success';
  if (status === 'failed') return 'destructive';
  return 'warning';
}

function verificationSummaryClass(status: 'pending' | 'passed' | 'failed'): string {
  if (status === 'passed') {
    return 'border-[var(--status-success)]/30 bg-[var(--status-success-muted)] text-[var(--status-success)]';
  }
  if (status === 'failed') {
    return 'border-[var(--status-error)]/30 bg-[var(--status-error-muted)] text-[var(--status-error)]';
  }
  return 'border-[var(--status-warning)]/30 bg-[var(--status-warning-muted)] text-[var(--status-warning)]';
}

function reviewLabel(state: ProposalGenerationReviewState): string {
  if (state === 'ready_for_changes') return 'Ready for Changes';
  return 'Needs handoff';
}

function reviewBadgeVariant(state: ProposalGenerationReviewState): 'outline' | 'success' {
  if (state === 'ready_for_changes') return 'success';
  return 'outline';
}

function decisionHeaderLabel(state: ProposalGenerationReviewState): string {
  if (state === 'ready_for_changes') return 'Ready for Changes';
  return 'Changes handoff required';
}

function decisionHeaderBadgeVariant(state: ProposalGenerationReviewState): 'success' | 'warning' {
  if (state === 'ready_for_changes') return 'success';
  return 'warning';
}

function formatGenerationValue(
  value: { availability: 'available'; value: unknown } | { availability: 'unavailable' }
): string {
  return value.availability === 'available' ? formatEvidence(value.value) : 'Not available';
}

function formatEvidence(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isRecord(value)) {
    const locator = isRecord(value.locator) ? value.locator : null;
    const locatorValue = locator && isRecord(locator.value) ? locator.value : null;
    const resource = isRecord(value.resource) ? value.resource : null;
    const quote =
      locatorValue && typeof locatorValue.quote === 'string' ? locatorValue.quote : null;
    const uri = resource && typeof resource.uri === 'string' ? resource.uri : null;
    if (quote) {
      const sourceLabel = uri ? uri.split('/').at(-1) : null;
      return `“${quote}”${sourceLabel ? `\n${sourceLabel}` : ''}`;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
