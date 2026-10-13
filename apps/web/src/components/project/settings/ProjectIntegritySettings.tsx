'use client';

import { Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/domain/format/errors';
import type { VerifyResult } from '@/types/api';
import { cn } from '@/utils/cn';
import { SettingsSection } from './SettingsSection';

function problemCount(result: VerifyResult): number {
  return (
    result.errors.hash_mismatch.length +
    result.errors.parent_not_found.length +
    result.errors.other.length +
    (result.merkle_mismatches?.length ?? 0)
  );
}

export function ProjectIntegritySettings({ onVerify }: { onVerify: () => Promise<VerifyResult> }) {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setRunning(true);
    setError(null);
    try {
      setResult(await onVerify());
    } catch (cause) {
      setError(formatUserFacingError(cause, 'Integrity check failed to run.'));
    } finally {
      setRunning(false);
    }
  }

  const problems = result ? problemCount(result) : 0;
  const status = !result
    ? 'idle'
    : !result.valid
      ? 'failed'
      : result.total === 0
        ? 'idle'
        : 'verified';
  const StatusIcon =
    status === 'verified' ? ShieldCheck : status === 'failed' ? ShieldAlert : ShieldQuestion;

  return (
    <SettingsSection
      action={
        <Button disabled={running} onClick={runCheck} size="sm" type="button" variant="outline">
          {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {result ? 'Run again' : 'Run check'}
        </Button>
      }
      description="Recompute every commit hash and parent link to confirm history has not been altered."
      icon={ShieldCheck}
      id="integrity"
      title="Integrity"
    >
      <div
        className={cn(
          'flex items-start gap-3 rounded-lg px-4 py-3',
          status === 'idle' && 'bg-[var(--surface-app)]',
          status === 'verified' && 'bg-[var(--status-success)]/8',
          status === 'failed' && 'bg-[var(--status-error)]/8'
        )}
      >
        <StatusIcon
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-5 shrink-0',
            status === 'idle' && 'text-[var(--text-tertiary)]',
            status === 'verified' && 'text-[var(--status-success)]',
            status === 'failed' && 'text-[var(--status-error)]'
          )}
        />
        <output className="block min-w-0">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">
            {!result
              ? 'Not checked in this session'
              : !result.valid
                ? `${problems} integrity problem${problems === 1 ? '' : 's'} found`
                : result.total === 0
                  ? 'No history to verify yet'
                  : 'History verified'}
          </p>
          <p className="mt-0.5 text-xs leading-[17px] text-[var(--text-secondary)]">
            {!result
              ? 'The check is read-only and safe to run at any time.'
              : result.valid && result.total === 0
                ? 'This repository has no commits. Run the check again after the first commit.'
                : `Checked ${result.verified_depth} of ${result.total} commits from ${result.entry_points} entry point${result.entry_points === 1 ? '' : 's'}${result.truncated ? ' (truncated)' : ''} at ${new Date(result.verified_at).toLocaleTimeString()}.`}
          </p>
        </output>
      </div>

      {result && !result.valid ? (
        <ul className="mt-3 grid gap-1 font-mono text-xs text-[var(--status-error)]">
          {result.errors.hash_mismatch.map((hash) => (
            <li key={`hash-${hash}`}>hash mismatch: {hash}</li>
          ))}
          {result.errors.parent_not_found.map((hash) => (
            <li key={`parent-${hash}`}>missing parent: {hash}</li>
          ))}
          {(result.merkle_mismatches ?? []).map((hash) => (
            <li key={`merkle-${hash}`}>merkle mismatch: {hash}</li>
          ))}
          {result.errors.other.map((message) => (
            <li key={`other-${message}`}>{message}</li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-3 text-xs text-[var(--status-error)]" role="alert">
          {error}
        </p>
      ) : null}
    </SettingsSection>
  );
}
