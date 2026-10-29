import type { WorkspaceFullSchemaReview } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';

/** Display only the application facts frozen with this Review, never live Studio state. */
export function WorkspaceSchemaReviewPanel({
  review,
  historical = false,
}: {
  review?: WorkspaceFullSchemaReview | null;
  historical?: boolean;
}) {
  if (!review) return null;
  return (
    <details
      open={review.changes.length > 0}
      className="mx-4 my-2 max-h-96 shrink-0 overflow-auto rounded-lg border p-3 text-sm"
    >
      <summary className="cursor-pointer font-medium">
        {historical ? 'Historical complete Review' : 'Complete Workspace Review'} · Schema + content
        {' · '}
        {review.actionCount} Draft actions · {review.changes.length} definition changes
      </summary>
      <p className="my-2 text-[var(--text-secondary)]">
        Frozen Base → complete Draft. Studio checks alone do not authorize a commit.
      </p>
      {review.contentValidation === 'not_applicable' ? (
        <p className="my-2 text-[var(--text-secondary)]">
          This review establishes the Schema without business content. Content validation is not
          applicable yet; required fields will be checked when content is added.
        </p>
      ) : null}
      {review.base.status === 'unknown' ? (
        <p role="alert">
          The exact Base Schema is unavailable. Accept and Commit are blocked until it is recovered;
          rejection remains available.
        </p>
      ) : null}
      <dl className="my-2 grid gap-1 break-all">
        <dt>Base Schema Hash</dt>
        <dd>
          <code>{review.base.schemaHash ?? review.base.status}</code>
        </dd>
        <dt>Draft Schema Hash</dt>
        <dd>
          <code>{review.draft.schemaHash ?? review.draft.status}</code>
        </dd>
      </dl>
      {review.changes.length ? (
        <ul className="my-2 list-inside list-disc">
          {review.changes.map((change) => (
            <li key={`${change.kind}:${change.path}`}>
              <code>
                {change.kind} {change.path}
              </code>{' '}
              · {change.summary}
            </li>
          ))}
        </ul>
      ) : review.base.status !== 'unknown' ? (
        <p>No Schema definition changes.</p>
      ) : null}
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {(
          [
            ['Base Schema', review.base.definition],
            ['Draft Schema', review.draft.definition],
            ['Base content', review.baseContent],
            ['Complete Draft content', review.draftContent],
          ] as const
        ).map(([label, value]) => (
          <section className="min-w-0" key={label} aria-label={label}>
            <h3 className="my-1 font-medium">{label}</h3>
            <pre className="max-h-48 overflow-auto rounded bg-[var(--surface-muted)] p-2 text-xs">
              {dump(value, { noRefs: true, sortKeys: true })}
            </pre>
          </section>
        ))}
      </div>
    </details>
  );
}
