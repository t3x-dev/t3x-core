import { CheckCircle2 } from 'lucide-react';
import type { useRepositoryName } from '@/hooks/projects/useRepositoryName';
import styles from './NewRepositoryPage.module.css';

export function RepositoryNameFeedback({
  check,
  compact = false,
}: {
  check: ReturnType<typeof useRepositoryName>;
  compact?: boolean;
}) {
  if (compact)
    return (
      <div aria-live="polite" className={styles.nameFeedback}>
        {check.pending && <p>Checking name and availability…</p>}
        {check.error && (
          <p role="alert">
            {check.error}{' '}
            <button type="button" onClick={check.retry} className="underline">
              Retry
            </button>
          </p>
        )}
        {check.result && (
          <>
            <div className={styles.nameResult}>
              {check.result.canonical_path && (
                <span>
                  Your address: <code>{check.result.canonical_path}</code>
                </span>
              )}
              {check.result.available ? (
                <span className={styles.available}>
                  <CheckCircle2 aria-hidden="true" size={13} />
                  Name available
                </span>
              ) : (
                <p role="alert">{check.result.message}</p>
              )}
            </div>
            {check.result.changed && (
              <p>
                Final repository name: <code>{check.result.name || '(empty)'}</code>. Unsupported
                characters are replaced with “-”.
              </p>
            )}
          </>
        )}
      </div>
    );
  return (
    <div className="mt-1.5 text-xs text-[var(--text-secondary)]" aria-live="polite">
      {check.pending && <p>Checking name and availability…</p>}
      {check.error && (
        <p role="alert">
          {check.error}{' '}
          <button type="button" onClick={check.retry} className="underline">
            Retry
          </button>
        </p>
      )}
      {check.result && (
        <>
          <p>
            Final repository name: <code>{check.result.name || '(empty)'}</code>
          </p>
          {check.result.canonical_path && (
            <p>
              Path: <code>{check.result.canonical_path}</code>
            </p>
          )}
          {check.result.changed && (
            <p>
              Leading/trailing whitespace is removed; each run of unsupported characters becomes
              “-”. This final name will be saved.
            </p>
          )}
          <p role={check.result.available ? undefined : 'alert'}>
            {check.result.available
              ? 'Name is available. Availability is checked again when saving.'
              : check.result.message}
          </p>
        </>
      )}
    </div>
  );
}
