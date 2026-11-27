'use client';

import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { ChangeCheckRow } from '@/domain/workspaces/changeDecision';
import styles from './WorkspaceReviewWorkbench.module.css';

/** Displays recorded check projections; never determines permission to commit. */
export function WorkspaceReviewValidation({
  checks,
  running = false,
  prepared = false,
  actions,
  children,
}: {
  checks: readonly ChangeCheckRow[];
  running?: boolean;
  prepared?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [failedOnly, setFailedOnly] = useState(false);
  const failed = checks.filter((check) => check.status === 'failed').length;
  const completed = checks.filter(
    (check) => check.status === 'passed' || check.status === 'failed'
  ).length;
  const applicable = checks.filter((check) => check.status !== 'not_applicable').length;
  const status = running
    ? 'Preparing…'
    : !checks.length
      ? prepared
        ? 'Recorded in fixed review'
        : 'Not prepared'
      : failed
        ? `${failed} failed`
        : completed < applicable
          ? 'Checks pending'
          : applicable
            ? 'Checks passed'
            : 'Not applicable';
  const Icon = running
    ? Loader2
    : failed
      ? XCircle
      : checks.length && completed === applicable && applicable
        ? CheckCircle2
        : CircleDashed;
  return (
    <details className={styles.validation}>
      <summary>
        <strong>Validation</strong>
        <Icon size={15} aria-hidden="true" className={running ? 'animate-spin' : undefined} />
        <span
          data-status={
            failed
              ? 'failed'
              : !running && applicable > 0 && completed === applicable
                ? 'passed'
                : 'pending'
          }
        >
          {status}
        </span>
        {checks.length ? (
          <small>
            {completed} of {applicable} checks complete
          </small>
        ) : null}
      </summary>
      <div className={styles.validationBody}>
        <div className={styles.validationTools}>
          <fieldset aria-label="Filter validation checks">
            <button type="button" aria-pressed={!failedOnly} onClick={() => setFailedOnly(false)}>
              All ({checks.length})
            </button>
            <button type="button" aria-pressed={failedOnly} onClick={() => setFailedOnly(true)}>
              Failed ({failed})
            </button>
          </fieldset>
          {actions}
        </div>
        {!checks.length ? (
          <p>
            {prepared
              ? 'Open the fixed review to read its checks.'
              : 'Prepare review to record checks for this revision.'}
          </p>
        ) : (
          <ul className={styles.validationList}>
            {checks
              .filter((check) => !failedOnly || check.status === 'failed')
              .map((check) => (
                <li key={check.id} aria-label={`${check.label}: ${check.status}`}>
                  <div>
                    <strong>{check.label}</strong>
                    <span data-status={check.status}>
                      {check.status === 'missing'
                        ? 'Not run'
                        : check.status === 'not_applicable'
                          ? 'Not applicable'
                          : check.status === 'passed'
                            ? 'Passed'
                            : 'Failed'}
                    </span>
                  </div>
                  <p>{check.summary}</p>
                  {check.findings.length ? (
                    <ul>
                      {check.findings.map((finding) => (
                        <li key={`${finding.code}:${finding.path}:${finding.message}`}>
                          <code>{finding.path ?? finding.code}</code> · {finding.message}
                          {finding.count > 1 ? ` ×${finding.count}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
        {failedOnly && checks.length > 0 && !failed ? <p>No failed checks recorded.</p> : null}
        {children}
      </div>
    </details>
  );
}
