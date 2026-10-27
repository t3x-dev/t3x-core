import type { useRepositoryName } from '@/hooks/projects/useRepositoryName';

export function RepositoryNameFeedback({ check }: { check: ReturnType<typeof useRepositoryName> }) {
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
