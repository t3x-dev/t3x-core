import type { ValidationError, ValidationGap, ValidationResult } from './types';

export interface DiffValidationResultsInput {
  before: ValidationResult;
  after: ValidationResult;
}

export interface YSchemaValidationDelta {
  fixedErrors: ValidationError[];
  newErrors: ValidationError[];
  unchangedErrors: ValidationError[];
  fixedGaps: ValidationGap[];
  newGaps: ValidationGap[];
  unchangedGaps: ValidationGap[];
  readyChanged: boolean;
  validChanged: boolean;
}

type ValidationIssue = ValidationError | ValidationGap;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}

function normalizeIssueDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeIssueDetails(item));
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'index')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, normalizeIssueDetails(entryValue)])
  );
}

function issueKey(issue: ValidationIssue): string {
  return stableStringify({
    code: issue.code,
    path: issue.path,
    details: normalizeIssueDetails(issue.details),
  });
}

function groupIssues<TIssue extends ValidationIssue>(
  issues: readonly TIssue[]
): Map<string, TIssue[]> {
  const grouped = new Map<string, TIssue[]>();
  for (const issue of issues) {
    const key = issueKey(issue);
    const group = grouped.get(key) ?? [];
    group.push(issue);
    grouped.set(key, group);
  }
  return grouped;
}

function sortIssues<TIssue extends ValidationIssue>(issues: TIssue[]): TIssue[] {
  return [...issues].sort((left, right) => {
    const pathDelta = left.path.localeCompare(right.path);
    if (pathDelta !== 0) return pathDelta;
    const codeDelta = left.code.localeCompare(right.code);
    if (codeDelta !== 0) return codeDelta;
    return left.message.localeCompare(right.message);
  });
}

function diffIssueList<TIssue extends ValidationIssue>(
  before: readonly TIssue[],
  after: readonly TIssue[]
): { fixed: TIssue[]; next: TIssue[]; unchanged: TIssue[] } {
  const beforeIssues = groupIssues(before);
  const afterIssues = groupIssues(after);
  const fixed: TIssue[] = [];
  const next: TIssue[] = [];
  const unchanged: TIssue[] = [];

  const allKeys = [...new Set([...beforeIssues.keys(), ...afterIssues.keys()])].sort(
    (left, right) => left.localeCompare(right)
  );

  for (const key of allKeys) {
    const beforeGroup = beforeIssues.get(key) ?? [];
    const afterGroup = afterIssues.get(key) ?? [];
    const sharedCount = Math.min(beforeGroup.length, afterGroup.length);

    unchanged.push(...afterGroup.slice(0, sharedCount));
    fixed.push(...beforeGroup.slice(sharedCount));
    next.push(...afterGroup.slice(sharedCount));
  }

  return {
    fixed: sortIssues(fixed),
    next: sortIssues(next),
    unchanged: sortIssues(unchanged),
  };
}

export function diffValidationResults(input: DiffValidationResultsInput): YSchemaValidationDelta {
  const errors = diffIssueList(input.before.errors, input.after.errors);
  const gaps = diffIssueList(input.before.gaps, input.after.gaps);

  return {
    fixedErrors: errors.fixed,
    newErrors: errors.next,
    unchangedErrors: errors.unchanged,
    fixedGaps: gaps.fixed,
    newGaps: gaps.next,
    unchangedGaps: gaps.unchanged,
    readyChanged: input.before.ready !== input.after.ready,
    validChanged: input.before.valid !== input.after.valid,
  };
}
