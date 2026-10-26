import { getProjectIdRepoPath } from './repoPath';

export type CheckRecordKind = 'review' | 'validation' | 'schema' | 'pull-request';
export interface CheckRecord {
  id: string;
  kind: CheckRecordKind;
  created_at: string;
  payload: Record<string, unknown>;
}
export interface CheckItem {
  id: string;
  title: string;
  status: string;
  summary: string;
  findings: Array<{ code: string; path: string; message: string }>;
  log?: string;
  truncated?: boolean;
  evidence?: unknown;
}
export const CHECK_KIND_LABELS: Record<CheckRecordKind, string> = {
  review: 'Review snapshot',
  validation: 'Validation run',
  schema: 'Schema run',
  'pull-request': 'PR current checks',
};
/** Canonical catch-all routes can carry an encoded segment; decode exactly once. */
export function decodeCheckRecordId(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function entries(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}
export function textValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function findings(value: unknown): CheckItem['findings'] {
  return entries(value).map((f) => ({
    code: textValue(f.code),
    path: textValue(f.state_path ?? f.path ?? f.file) + (f.line ? `:${f.line}` : ''),
    message: textValue(f.message),
  }));
}
function observedStatus(value: Record<string, unknown>): string {
  const outcomes = Array.isArray(value.outcomes) ? value.outcomes : [];
  if (value.observation !== 'observed' || !outcomes.length) return 'not_observed';
  if (outcomes.every((o) => o === 'passed' || o === 'verified')) return 'passed';
  if (outcomes.some((o) => ['failed', 'invalid', 'denied', 'error', 'false'].includes(String(o))))
    return 'failed';
  return 'no_conclusion';
}
export function checkItems(record: CheckRecord): CheckItem[] {
  const p = record.payload;
  if (record.kind === 'review') {
    const checks = object(object(object(p.snapshot).transition).checks);
    const items: CheckItem[] = ['replay', 'validation', 'runner']
      .filter((key) => key !== 'runner' || object(checks[key]).observation === 'observed')
      .map((key) => {
        const check = object(checks[key]);
        const runs = entries(check.runs);
        return {
          id: key,
          title:
            { replay: 'Deterministic replay', validation: 'Schema validation', runner: 'Runner' }[
              key
            ] ?? key,
          status: observedStatus(check),
          summary: Array.isArray(check.outcomes)
            ? check.outcomes.join(', ')
            : 'No conclusion recorded.',
          findings: runs.flatMap((run) => findings(object(run.predicate).gaps)),
          evidence: check,
        };
      });
    items.push({
      id: 'integrity',
      title: 'Object integrity',
      status: checks.objectIntegrity === 'verified' ? 'passed' : 'not_observed',
      summary: 'Integrity observation saved in this review snapshot.',
      findings: [],
      evidence: checks.objectIntegrity,
    });
    return items;
  }
  if (record.kind === 'validation') {
    const detail = object(p.details);
    const steps = entries(detail.steps);
    if (!steps.length)
      return [
        {
          id: 'validation',
          title: textValue(p.workflow_name),
          status: textValue(p.status),
          summary: textValue(p.summary),
          findings: [],
        },
      ];
    return steps.map((step) => ({
      id: textValue(step.id),
      title: textValue(step.name),
      status: textValue(step.status),
      summary: textValue(step.summary),
      findings: findings(
        entries(detail.findings).filter((f) => !f.step_run_id || f.step_run_id === step.id)
      ),
      log: textValue(step.log_excerpt),
      truncated: step.log_truncated === true,
      evidence: step.result_json,
    }));
  }
  if (record.kind === 'pull-request') {
    return entries(p.checks).map((check) => {
      const message = textValue(check.message);
      const unverified =
        /No CommitV2 Statement constraint provider configured|node\(s\) in merge result|No nodes to verify/.test(
          message
        );
      return {
        id: textValue(check.checkId),
        title: textValue(check.title),
        status: unverified ? 'not_verified' : textValue(check.status),
        summary: message,
        findings: [],
        evidence: check,
      };
    });
  }
  return [
    {
      id: 'schema',
      title: 'Schema validation',
      status: textValue(p.status),
      summary: `${p.error_count ?? 0} errors · ${p.gap_count ?? 0} gaps · ${p.fix_count ?? 0} fixes`,
      findings: findings(object(p.result_json).gaps),
      evidence: p.result_json,
    },
  ];
}
export function checkRecordView(record: CheckRecord) {
  const p = record.payload;
  const snapshot = object(p.snapshot);
  const precondition = object(object(snapshot.review).precondition);
  const items = checkItems(record);
  const status =
    record.kind === 'pull-request'
      ? 'current_summary'
      : record.kind !== 'review'
        ? textValue(p.status)
        : items.some((i) => i.status === 'failed')
          ? 'failed'
          : items.length && items.every((i) => i.status === 'passed')
            ? 'passed'
            : 'not_observed';
  return {
    title:
      record.kind === 'review'
        ? `Workspace review · revision ${precondition.workspaceRevision ?? 'unknown'}`
        : record.kind === 'validation'
          ? textValue(p.workflow_name)
          : record.kind === 'schema'
            ? `${textValue(p.schema_name)} validation`
            : `PR #${p.number} · ${textValue(p.title)}`,
    status,
    items,
    workspace: textValue(p.workspace_id),
    snapshot: textValue(p.snapshot_id),
    branch: textValue(precondition.refName ?? p.source_branch),
    commit: textValue(p.commit_hash ?? object(object(snapshot.objects).commit).digest),
    target:
      record.kind === 'pull-request'
        ? `${textValue(p.source_branch)} → ${textValue(p.target_branch)}`
        : textValue(p.workspace_id ?? p.commit_hash),
    notice:
      record.kind === 'review'
        ? 'Saved review evidence. This snapshot does not confirm the current Workspace revision.'
        : record.kind === 'pull-request'
          ? 'Current PR readiness only. Rerunning replaces these results; execution history is not retained yet.'
          : 'Saved validation result for the recorded input. Current commit or merge eligibility is evaluated separately.',
  };
}

export function checksHref(
  projectId: string,
  options: {
    recordId?: string;
    workspace?: string;
    pr?: number;
    commit?: string;
    returnTo?: string;
  } = {}
): string {
  const params = new URLSearchParams();
  if (options.workspace) params.set('workspace', options.workspace);
  if (options.pr) params.set('pr', String(options.pr));
  if (options.commit) params.set('commit', options.commit);
  if (options.returnTo) params.set('returnTo', options.returnTo);
  return `${getProjectIdRepoPath(projectId)}/checks${options.recordId ? `/${encodeURIComponent(options.recordId)}` : ''}${params.size ? `?${params}` : ''}`;
}

/** Only a path within this repository (canonical or ID address) can be a return target. */
export function checksReturnTo(
  value: string | null,
  projectId: string,
  pathname: string
): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value))
    return null;
  const currentBase = pathname.split('/').slice(0, 3).join('/');
  const bases = [getProjectIdRepoPath(projectId), currentBase];
  let target: string;
  try {
    target = decodeURIComponent(new URL(value, 'http://checks.local').pathname);
  } catch {
    return null;
  }
  return bases.some((base) => target === base || target.startsWith(`${base}/`)) &&
    !target.includes('..') &&
    !target.includes('\\')
    ? value
    : null;
}
