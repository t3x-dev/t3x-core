import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock3 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type {
  WorkspaceValidationFinding,
  WorkspaceValidationGateStatus,
  WorkspaceValidationRunDetails,
  WorkspaceValidationRunStatus,
  WorkspaceValidationStaleReason,
  WorkspaceValidationStepRun,
} from '@/types/api';
import { cn } from '@/utils/cn';

type RequiredCheckStatus = 'passed' | 'failed' | 'pending' | 'warning';
type RequiredCheckLogTone = 'default' | 'error' | 'muted' | 'success' | 'warning';
type WorkspaceValidationFeedbackTone = 'pending' | 'success' | 'warning';

interface RequiredCheckBadge {
  label: string;
  variant: 'branch-subtle' | 'destructive' | 'outline' | 'pending-subtle' | 'success' | 'warning';
}

interface RequiredCheckLogLine {
  text: string;
  tone?: RequiredCheckLogTone;
}

interface RequiredCheckRow {
  id: string;
  title: string;
  description: string;
  status: RequiredCheckStatus;
  badges: RequiredCheckBadge[];
  logLines: RequiredCheckLogLine[];
  logExcerpt?: string | null;
}

type RequiredCheckBadgeInput = readonly [label: string, variant: RequiredCheckBadge['variant']];
type RequiredCheckLogInput = string | readonly [text: string, tone: RequiredCheckLogTone];
type RequiredCheckRowInput = Omit<RequiredCheckRow, 'badges' | 'id' | 'logLines' | 'title'> & {
  badges: RequiredCheckBadgeInput[];
  logLines: RequiredCheckLogInput[];
};

interface RequiredCheckInput {
  details: WorkspaceValidationRunDetails | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  fresh?: boolean | null;
  hasBlockingIssues: boolean;
  loading: boolean;
  running: boolean;
  staleReason?: WorkspaceValidationStaleReason | null;
  validationRan: boolean;
}

interface WorkspaceRequiredChecksProps extends RequiredCheckInput {
  feedback?: { message: string; tone: WorkspaceValidationFeedbackTone } | null;
}

interface RunStatusMeta {
  badgeVariant: RequiredCheckBadge['variant'];
  description: string;
  fallbackLogLines: RequiredCheckLogInput[];
  label: string;
  logTone: RequiredCheckLogTone;
  rowStatus: RequiredCheckStatus;
}

const RUN_STATUS_META: Record<WorkspaceValidationRunStatus, RunStatusMeta> = {
  environment_required: {
    badgeVariant: 'warning',
    description: 'Docker is not available on this machine.',
    fallbackLogLines: [
      'Materialized workspace candidate to /config/device.yaml',
      'Checked local Docker or Podman runtime',
    ],
    label: 'Needs setup',
    logTone: 'warning',
    rowStatus: 'warning',
  },
  failed: {
    badgeVariant: 'destructive',
    description: 'ESPHome config failed.',
    fallbackLogLines: [
      'Materialized workspace candidate to /config/device.yaml',
      ['Ran ESPHome config validation', 'warning'],
    ],
    label: 'Failed',
    logTone: 'error',
    rowStatus: 'failed',
  },
  passed: {
    badgeVariant: 'success',
    description: 'ESPHome config passed.',
    fallbackLogLines: [],
    label: 'Passed',
    logTone: 'success',
    rowStatus: 'passed',
  },
  pending: {
    badgeVariant: 'pending-subtle',
    description: 'Extra checks are running.',
    fallbackLogLines: [
      'Extra checks request accepted',
      ['Waiting for ESPHome config result', 'muted'],
    ],
    label: 'Running',
    logTone: 'default',
    rowStatus: 'pending',
  },
  running: {
    badgeVariant: 'pending-subtle',
    description: 'Extra checks are running.',
    fallbackLogLines: [
      'Extra checks request accepted',
      ['Waiting for ESPHome config result', 'muted'],
    ],
    label: 'Running',
    logTone: 'default',
    rowStatus: 'pending',
  },
  stale: {
    badgeVariant: 'warning',
    description: 'Validation result is stale.',
    fallbackLogLines: [
      'Loaded saved ESPHome config result',
      ['Saved result does not match current candidate', 'warning'],
    ],
    label: 'Stale',
    logTone: 'warning',
    rowStatus: 'warning',
  },
  timed_out: {
    badgeVariant: 'destructive',
    description: 'ESPHome config timed out.',
    fallbackLogLines: [
      'Materialized workspace candidate to /config/device.yaml',
      ['ESPHome config validation exceeded the time limit', 'error'],
    ],
    label: 'Timed out',
    logTone: 'error',
    rowStatus: 'failed',
  },
};

const GATE_STATUS_BADGES: Record<
  WorkspaceValidationGateStatus,
  readonly [string, RequiredCheckBadge['variant']]
> = {
  blocked: ['Gate blocked', 'warning'],
  pending: ['Gate pending', 'pending-subtle'],
  ready: ['Gate ready', 'success'],
  stale: ['Gate stale', 'warning'],
};

const FEEDBACK_TONE_CLASSES: Record<WorkspaceValidationFeedbackTone, string> = {
  pending: 'border-[var(--accent-pending)]/20 bg-[var(--accent-pending)]/10',
  success: 'border-[var(--status-success)]/20 bg-[var(--status-success-muted)]',
  warning: 'border-[var(--status-warning)]/20 bg-[var(--status-warning-muted)]',
};

const FEEDBACK_BADGE_VARIANTS: Record<
  WorkspaceValidationFeedbackTone,
  RequiredCheckBadge['variant']
> = {
  pending: 'pending-subtle',
  success: 'success',
  warning: 'warning',
};

const STALE_REASON_MESSAGES: Record<WorkspaceValidationStaleReason, string> = {
  input_changed: 'Materialized validation input changed after the latest extra check.',
  subject_changed: 'Candidate state changed after the latest extra check.',
  validator_changed: 'Validator command changed after the latest extra check.',
  workflow_changed: 'Validation workflow changed after the latest extra check.',
};

const LOG_LINE_TONE_CLASSES: Record<RequiredCheckLogTone, string> = {
  default: 'text-[var(--text-secondary)]',
  error: 'text-[var(--status-error)]',
  muted: 'text-[var(--text-tertiary)]',
  success: 'text-[var(--status-success)]',
  warning: 'text-[var(--status-warning)]',
};

export function WorkspaceRequiredChecks({
  details,
  errorCode,
  errorMessage,
  feedback,
  fresh,
  hasBlockingIssues,
  loading,
  running,
  staleReason,
  validationRan,
}: WorkspaceRequiredChecksProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const proposalPassed = validationRan && !hasBlockingIssues;
  const visibleFeedback =
    feedback && !proposalPassed
      ? {
          message: hasBlockingIssues
            ? 'Extra checks are blocked until YSchema Proposal passes.'
            : 'Extra checks are blocked until Validate proposal passes.',
          tone: 'warning' as const,
        }
      : feedback;
  const rows = buildRequiredCheckRows({
    details,
    errorCode,
    errorMessage,
    fresh,
    hasBlockingIssues,
    loading,
    running,
    staleReason,
    validationRan,
  });
  const passedCount = rows.filter((row) => row.status === 'passed').length;
  const pendingCount = rows.filter((row) => row.status === 'pending').length;
  const attentionCount = rows.filter(
    (row) => row.status === 'warning' || row.status === 'failed'
  ).length;

  return (
    <section
      aria-label="Required checks"
      className="border-t border-b border-[var(--stroke-divider)] bg-[var(--surface-card)]"
    >
      <header className="flex min-h-[48px] flex-wrap items-center gap-3 border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-2.5">
        <div>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Required checks</h4>
          <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
            Proposal, runtime config, and candidate freshness before Preview.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Badge variant={passedCount === rows.length ? 'success' : 'outline'}>
            {passedCount} passed
          </Badge>
          {attentionCount > 0 ? <Badge variant="warning">{attentionCount} attention</Badge> : null}
          {pendingCount > 0 ? <Badge variant="pending-subtle">{pendingCount} pending</Badge> : null}
        </div>
      </header>

      {visibleFeedback ? (
        <div
          className={cn(
            'flex min-h-9 items-center gap-2 border-b px-4 py-2 text-xs text-[var(--text-secondary)]',
            FEEDBACK_TONE_CLASSES[visibleFeedback.tone]
          )}
          role={visibleFeedback.tone === 'pending' ? 'status' : 'alert'}
        >
          <Badge variant={FEEDBACK_BADGE_VARIANTS[visibleFeedback.tone]}>
            {feedbackBadgeLabel(visibleFeedback.tone, proposalPassed)}
          </Badge>
          <span className="min-w-0 flex-1">{visibleFeedback.message}</span>
        </div>
      ) : null}

      <div className="min-w-[820px]">
        {rows.map((row, index) => {
          const expanded = expandedRowId === row.id;
          const logLines = visibleLogLines(row);
          return (
            <div className="border-b border-[var(--stroke-divider)] last:border-b-0" key={row.id}>
              <button
                aria-expanded={expanded}
                aria-label={`${expanded ? 'Hide' : 'Show'} ${row.title} check details`}
                className={cn(
                  'grid min-h-[52px] w-full grid-cols-[52px_minmax(260px,1fr)_minmax(260px,1fr)_minmax(180px,max-content)_32px] items-center gap-3 px-3 text-left transition-colors',
                  expanded
                    ? 'border-l-2 border-l-[var(--accent-branch)] bg-[var(--diff-modified-bg)]'
                    : 'border-l-2 border-l-transparent hover:bg-[var(--hover-bg)]'
                )}
                onClick={() => setExpandedRowId(expanded ? null : row.id)}
                type="button"
              >
                <span className="font-mono text-xs font-semibold text-[var(--text-tertiary)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <StatusIcon status={row.status} />
                  <strong className="truncate text-sm text-[var(--text-primary)]">
                    {row.title}
                  </strong>
                </span>
                <span className="truncate text-xs text-[var(--text-secondary)]">
                  {row.description}
                </span>
                <span className="flex justify-end gap-1.5">
                  {row.badges.map((badge) => (
                    <Badge key={`${row.id}-${badge.label}`} variant={badge.variant}>
                      {badge.label}
                    </Badge>
                  ))}
                </span>
                <span className="flex justify-end text-[var(--text-tertiary)]">
                  {expanded ? (
                    <ChevronDown aria-hidden="true" className="size-4" />
                  ) : (
                    <ChevronRight aria-hidden="true" className="size-4" />
                  )}
                </span>
              </button>

              {expanded ? (
                <div className="border-t border-[var(--stroke-divider)] bg-[var(--editor-bg)] px-4 py-3">
                  <ol
                    aria-label={`${row.title} log`}
                    className="max-h-32 overflow-auto rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] py-2 font-mono text-[11px] leading-5"
                  >
                    {logLines.map((line, lineIndex) => (
                      <li
                        className="grid min-h-5 grid-cols-[2.5rem_minmax(0,1fr)] hover:bg-[var(--hover-bg)]"
                        key={`${row.id}-${lineIndex}-${line.text}`}
                      >
                        <span className="select-none pr-3 text-right text-[var(--text-quaternary)]">
                          {lineIndex + 1}
                        </span>
                        <code
                          className={cn(
                            'min-w-0 whitespace-pre-wrap break-words text-[11px]',
                            logLineToneClass(line.tone)
                          )}
                        >
                          {line.text}
                        </code>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function feedbackBadgeLabel(tone: WorkspaceValidationFeedbackTone, proposalPassed: boolean) {
  if (tone === 'pending') return 'Running';
  if (tone === 'success') return 'Finished';
  return proposalPassed ? 'Attention' : 'Blocked';
}

function requiredCheckRow(
  id: string,
  title: string,
  input: RequiredCheckRowInput
): RequiredCheckRow {
  return {
    id,
    title,
    ...input,
    badges: input.badges.map(toBadge),
    logLines: input.logLines.map(toLogLine),
  };
}

function toBadge(input: RequiredCheckBadgeInput): RequiredCheckBadge {
  return { label: input[0], variant: input[1] };
}

function toLogLine(input: RequiredCheckLogInput): RequiredCheckLogLine {
  if (typeof input === 'string') return { text: input };
  return { text: input[0], tone: input[1] };
}

function buildRequiredCheckRows(input: RequiredCheckInput): RequiredCheckRow[] {
  const proposalPassed = input.validationRan && !input.hasBlockingIssues;
  return [
    requiredCheckRow('yschema-proposal', 'YSchema Proposal', {
      description: proposalPassed
        ? 'Proposal passed YSchema.'
        : input.hasBlockingIssues
          ? 'Proposal does not match YSchema.'
          : 'Proposal has not been validated yet.',
      status: proposalPassed ? 'passed' : input.hasBlockingIssues ? 'warning' : 'pending',
      badges: [
        [
          proposalPassed ? 'Passed' : input.hasBlockingIssues ? 'Review' : 'Pending',
          proposalPassed ? 'success' : input.hasBlockingIssues ? 'warning' : 'pending-subtle',
        ],
      ],
      logLines: proposalLogLines({
        hasBlockingIssues: input.hasBlockingIssues,
        proposalPassed,
        validationRan: input.validationRan,
      }),
    }),
    buildRuntimeCheckRow(input),
    buildFreshnessRow(input),
  ];
}

function proposalLogLines(input: {
  hasBlockingIssues: boolean;
  proposalPassed: boolean;
  validationRan: boolean;
}): RequiredCheckLogInput[] {
  if (input.proposalPassed) {
    return [
      'Loaded active YSchema for projected proposal',
      'Checked projected YOps changes against schema rules',
      ['YSchema proposal passed', 'success'],
    ];
  }
  if (input.hasBlockingIssues) {
    return [
      'Loaded active YSchema for projected proposal',
      ['Detected blocking proposal issue', 'warning'],
      ['Extra checks are blocked until YSchema Proposal passes', 'warning'],
    ];
  }
  if (!input.validationRan) {
    return [
      'No YSchema Proposal result has been recorded',
      'Validate proposal must pass before Extra checks can run',
      ['Waiting for Validate proposal', 'muted'],
    ];
  }
  return [['Waiting for Validate proposal', 'muted']];
}

function blockedLogLines(
  target: 'runtime' | 'freshness',
  hasBlockingIssues: boolean
): RequiredCheckLogInput[] {
  const isRuntime = target === 'runtime';
  return [
    isRuntime ? 'Skipped ESPHome config' : 'Skipped candidate freshness check',
    [
      hasBlockingIssues
        ? isRuntime
          ? 'Reason: YSchema Proposal is not passing'
          : 'Reason: runtime config did not run'
        : 'Reason: Validate proposal has not passed yet',
      hasBlockingIssues ? 'warning' : 'muted',
    ],
    [
      isRuntime
        ? 'No Docker or ESPHome command was started'
        : 'Freshness needs a completed Extra checks result',
      'muted',
    ],
  ];
}

function buildRuntimeCheckRow(input: RequiredCheckInput): RequiredCheckRow {
  const step = input.details?.steps[0] ?? null;
  const finding = input.details?.findings[0] ?? null;
  const proposalPassed = input.validationRan && !input.hasBlockingIssues;

  if (!proposalPassed) {
    return runtimeRow({
      badges: [['Not run', input.hasBlockingIssues ? 'warning' : 'pending-subtle']],
      description: input.hasBlockingIssues
        ? 'Not run because YSchema Proposal has issues.'
        : 'Not run until Validate proposal passes.',
      logLines: blockedLogLines('runtime', input.hasBlockingIssues),
      status: 'pending',
    });
  }

  if (input.running) {
    return runtimeRow({
      badges: [['Running', 'pending-subtle']],
      description: 'Extra checks are running.',
      logLines: [
        'Extra checks request accepted',
        'Materializing workspace candidate to /config/device.yaml',
        ['Waiting for ESPHome config result', 'muted'],
      ],
      status: 'pending',
    });
  }
  if (input.loading) {
    return runtimeRow({
      badges: [['Loading', 'pending-subtle']],
      description: 'Loading latest extra-check result.',
      logLines: [
        'Loading latest saved workspace validation run',
        'Looking for ESPHome config step result',
        ['Waiting for saved evidence', 'muted'],
      ],
      status: 'pending',
    });
  }
  if (input.errorMessage) {
    const unsupported = input.errorCode === 'VALIDATION_INPUT_NOT_SUPPORTED';
    const timedOut = input.errorCode === 'TIMEOUT';
    return runtimeRow({
      badges: [
        [
          unsupported ? 'Not supported' : timedOut ? 'Timed out' : 'Failed',
          timedOut ? 'destructive' : 'warning',
        ],
      ],
      description: unsupported
        ? 'ESPHome device state was not found.'
        : timedOut
          ? 'ESPHome config timed out.'
          : 'Extra checks could not complete.',
      logLines: [
        [
          unsupported
            ? 'Extra checks could not find ESPHome device state'
            : 'Extra checks request failed',
          'warning',
        ],
        [input.errorMessage, timedOut ? 'error' : 'warning'],
        [
          unsupported ? 'No ESPHome config command was started' : 'No runtime result was recorded',
          'muted',
        ],
      ],
      status: timedOut ? 'failed' : 'warning',
    });
  }
  if (!input.details) {
    return runtimeRow({
      badges: [['Not validated', 'pending-subtle']],
      description: 'Extra checks have not run yet.',
      logLines: [
        'No saved ESPHome config result for this candidate',
        'Expected command: esphome config /config/device.yaml',
        ['Run Extra checks after proposal passes', 'muted'],
      ],
      status: 'pending',
    });
  }

  const status = input.details.run.status;
  const statusMeta = RUN_STATUS_META[status];
  return runtimeRow({
    badges: [
      [statusMeta.label, statusMeta.badgeVariant],
      GATE_STATUS_BADGES[input.details.run.gate_status],
    ],
    description: statusMeta.description,
    logLines: runtimeLogLines(input.details, step, finding),
    logExcerpt: finding?.log_excerpt ?? step?.log_excerpt,
    status: statusMeta.rowStatus,
  });
}

function buildFreshnessRow(input: RequiredCheckInput): RequiredCheckRow {
  const proposalPassed = input.validationRan && !input.hasBlockingIssues;

  if (!proposalPassed) {
    return freshnessRow({
      badges: [['Not run', input.hasBlockingIssues ? 'warning' : 'pending-subtle']],
      description: input.hasBlockingIssues
        ? 'Not checked because Extra checks did not run.'
        : 'Not checked until Validate proposal passes.',
      logLines: blockedLogLines('freshness', input.hasBlockingIssues),
      status: 'pending',
    });
  }

  if (input.running) {
    return freshnessRow({
      badges: [['Checking', 'pending-subtle']],
      description: 'Freshness will update after this run.',
      logLines: [
        'Waiting for current extra-check result',
        'Freshness will compare validation input hash to current candidate',
        ['No freshness decision yet', 'muted'],
      ],
      status: 'pending',
    });
  }
  if (input.loading) {
    return freshnessRow({
      badges: [['Loading', 'pending-subtle']],
      description: 'Loading latest candidate evidence.',
      logLines: [
        'Loading latest validation run for this candidate',
        'Checking stored input hash and workflow version',
        ['Waiting for freshness result', 'muted'],
      ],
      status: 'pending',
    });
  }
  if (input.errorCode === 'VALIDATION_INPUT_NOT_SUPPORTED') {
    return freshnessRow({
      badges: [['Not available', 'warning']],
      description: 'Freshness is not available for this input.',
      logLines: [
        'Freshness check requires a materialized runtime input',
        [input.errorMessage ?? 'ESPHome device state was not found.', 'warning'],
        ['No validation input hash was recorded', 'muted'],
      ],
      status: 'warning',
    });
  }
  if (!input.details) {
    return freshnessRow({
      badges: [['Not validated', 'pending-subtle']],
      description: 'No extra-check evidence yet.',
      logLines: [
        'No candidate validation evidence has been recorded',
        'Freshness needs a completed Extra checks run',
        ['Waiting for Extra checks', 'muted'],
      ],
      status: 'pending',
    });
  }
  if (
    !input.fresh ||
    input.details.run.status === 'stale' ||
    input.details.run.gate_status === 'stale'
  ) {
    return freshnessRow({
      badges: [
        ['Stale', 'warning'],
        ['Rerun required', 'warning'],
      ],
      description: 'Validation result is stale.',
      logLines: [
        `Latest run: ${input.details.run.id}`,
        'Compared stored validation input with current candidate',
        [staleReasonText(input.staleReason), 'warning'],
      ],
      status: 'warning',
    });
  }

  return freshnessRow({
    badges: [
      ['Fresh', 'success'],
      ['Recorded', 'branch-subtle'],
    ],
    description: 'Validation result matches this candidate.',
    logLines: [
      `Latest run: ${input.details.run.id}`,
      'Compared validation input hash with current candidate',
      `Finished: ${formatDateTime(input.details.run.finished_at ?? input.details.run.created_at)}`,
      ['Candidate freshness passed', 'success'],
    ],
    status: 'passed',
  });
}

function runtimeRow(input: RequiredCheckRowInput): RequiredCheckRow {
  return requiredCheckRow('esphome-config', 'ESPHome config', input);
}

function freshnessRow(input: RequiredCheckRowInput): RequiredCheckRow {
  return requiredCheckRow('candidate-freshness', 'Candidate freshness', input);
}

function runtimeLogLines(
  details: WorkspaceValidationRunDetails,
  step: WorkspaceValidationStepRun | null,
  finding: WorkspaceValidationFinding | null
): RequiredCheckLogInput[] {
  if (details.run.status === 'passed') {
    const command =
      step?.command_json?.map(String).join(' ') ?? 'esphome config /config/device.yaml';
    const result: RequiredCheckLogInput[] = [
      'Materialized workspace candidate to /config/device.yaml',
      `Command: ${command}`,
      ['ESPHome config passed', 'success'],
    ];
    if (step?.duration_ms !== null && step?.duration_ms !== undefined) {
      result.splice(2, 0, `Duration: ${step.duration_ms}ms`);
    }
    return result;
  }

  const statusMeta = RUN_STATUS_META[details.run.status];
  const result = [
    ...statusMeta.fallbackLogLines,
    [details.run.summary ?? step?.summary ?? statusMeta.description, statusMeta.logTone] as const,
    step?.command_json ? `Command: ${step.command_json.map(String).join(' ')}` : null,
    step?.duration_ms !== null && step?.duration_ms !== undefined
      ? `Duration: ${step.duration_ms}ms`
      : null,
    finding ? ([`${finding.code}: ${finding.message}`, 'warning'] as const) : null,
  ];
  return result.filter((item): item is RequiredCheckLogInput => Boolean(item));
}

function visibleLogLines(row: RequiredCheckRow): RequiredCheckLogLine[] {
  const excerpt = row.logExcerpt?.trim();
  if (!excerpt) return row.logLines;
  const excerptLines = excerpt
    .split(/\r?\n/)
    .filter(Boolean)
    .map((text) => ({
      text,
      tone: inferLogLineTone(text, row.status),
    }));
  if (excerptLines.length >= 3) return excerptLines;
  return mergeLogLines(row.logLines, excerptLines);
}

function mergeLogLines(
  fallbackLines: RequiredCheckLogLine[],
  excerptLines: RequiredCheckLogLine[]
): RequiredCheckLogLine[] {
  const seen = new Set<string>();
  return [...fallbackLines, ...excerptLines].filter((line) => {
    const key = line.text.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferLogLineTone(text: string, status: RequiredCheckStatus): RequiredCheckLogTone {
  const normalized = text.toLowerCase();
  if (normalized.includes('passed') || normalized.includes('success')) return 'success';
  if (
    normalized.includes('error') ||
    normalized.includes('failed') ||
    normalized.includes('invalid')
  ) {
    return 'error';
  }
  if (
    normalized.includes('missing') ||
    normalized.includes('not found') ||
    normalized.includes('required') ||
    status === 'warning'
  ) {
    return 'warning';
  }
  return 'default';
}

function logLineToneClass(tone: RequiredCheckLogTone | undefined): string {
  return LOG_LINE_TONE_CLASSES[tone ?? 'default'];
}

function staleReasonText(reason: WorkspaceValidationStaleReason | null | undefined): string {
  return reason
    ? STALE_REASON_MESSAGES[reason]
    : 'Latest extra-check evidence is not fresh for the current candidate.';
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function StatusIcon({ status }: { status: RequiredCheckStatus }) {
  if (status === 'passed') {
    return <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--status-success)]" />;
  }
  if (status === 'pending') {
    return <Clock3 aria-hidden="true" className="size-4 text-[var(--accent-pending)]" />;
  }
  if (status === 'failed') {
    return <AlertTriangle aria-hidden="true" className="size-4 text-[var(--status-error)]" />;
  }
  return <AlertTriangle aria-hidden="true" className="size-4 text-[var(--status-warning)]" />;
}
