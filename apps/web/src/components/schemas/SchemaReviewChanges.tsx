'use client';

import type { WorkspaceFullSchemaReview } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChangeReviewChanges } from '@/components/workspaces/ChangeReviewChanges';
import { type FieldChangeGroup, fieldChangeCount } from '@/domain/workspaces/changeFields';

/** A Schema-focused presentation of the same complete, immutable Workspace review. */
export function SchemaReviewChanges({
  review,
  groups,
  operations,
}: {
  review?: WorkspaceFullSchemaReview | null;
  groups: readonly FieldChangeGroup[] | null;
  operations: readonly unknown[];
}) {
  const [pane, setPane] = useState<'definition' | 'content'>('definition');
  return (
    <section aria-label="Schema review changes" className="min-w-0 space-y-3">
      <div className="rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 text-sm">
        <p className="font-medium">This decision covers the complete Workspace Draft.</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          Schema changes, content adaptations and any other saved Draft changes are included
          together. Check both views before deciding.
        </p>
      </div>
      <fieldset
        className="flex flex-wrap gap-2 border-b border-[var(--stroke-divider)] pb-2"
        aria-label="Review scope"
      >
        <Button
          size="sm"
          variant={pane === 'definition' ? 'secondary' : 'ghost'}
          aria-pressed={pane === 'definition'}
          onClick={() => setPane('definition')}
        >
          Schema definition · {review?.changes.length ?? '—'}
        </Button>
        <Button
          size="sm"
          variant={pane === 'content' ? 'secondary' : 'ghost'}
          aria-pressed={pane === 'content'}
          onClick={() => setPane('content')}
        >
          All content changes · {groups ? fieldChangeCount(groups) : '—'}
        </Button>
      </fieldset>
      {pane === 'definition' ? (
        <div className="space-y-3">
          {!review ? (
            <p role="alert" className="p-4 text-sm">
              The complete Schema comparison is unavailable. Open the current Schema and prepare a
              new review.
            </p>
          ) : (
            <>
              {review.base.status === 'unbound' && review.draft.status === 'bound' ? (
                <p className="text-sm">
                  {Object.keys((review.draft.definition?.nodes ?? {}) as Record<string, unknown>)
                    .length
                    ? 'Apply the first Schema to this Workspace.'
                    : 'Apply an empty Schema to this Workspace. No nodes or fields are defined yet.'}
                </p>
              ) : null}
              {review.base.status === 'unknown' ? (
                <p role="alert" className="p-3 text-sm">
                  The exact Base Schema is unavailable. Acceptance is blocked until it is recovered.
                </p>
              ) : null}
              {review.contentValidation === 'not_applicable' ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  There is no business content yet. Required fields will be checked when content is
                  added.
                </p>
              ) : null}
              <section
                aria-label="Definition changes"
                className="overflow-hidden rounded-md border border-[var(--stroke-divider)]"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 border-b bg-[var(--surface-panel)] px-4 py-2 text-xs text-[var(--text-secondary)]">
                  <span>Field or rule</span>
                  <span>Change</span>
                </div>
                {review.changes.length ? (
                  <ul className="divide-y divide-[var(--stroke-divider)]">
                    {review.changes.map((change) => (
                      <li
                        key={`${change.kind}:${change.path}`}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 px-4 py-3 text-sm"
                      >
                        <code className="break-words text-xs">{change.path}</code>
                        <div className="min-w-0 break-words">
                          <span className="mr-2 text-xs text-[var(--text-secondary)]">
                            {change.kind}
                          </span>
                          {change.summary}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-4 text-sm text-[var(--text-secondary)]">
                    No Schema definition changes.
                  </p>
                )}
              </section>
              <details className="rounded-md border border-[var(--stroke-divider)] p-3 text-sm">
                <summary className="cursor-pointer">Compare full definitions</summary>
                <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-2">
                  {[
                    ['Before', review.base.definition],
                    ['After', review.draft.definition],
                  ].map(([label, definition]) => (
                    <section key={String(label)} className="min-w-0">
                      <h3 className="mb-2 font-medium">{String(label)}</h3>
                      <pre className="max-h-[60vh] overflow-auto rounded bg-[var(--surface-panel)] p-3 text-xs">
                        {dump(definition, { noRefs: true, sortKeys: true })}
                      </pre>
                    </section>
                  ))}
                </div>
              </details>
              <details className="text-xs text-[var(--text-secondary)]">
                <summary className="cursor-pointer">Revision details</summary>
                <dl className="mt-2 grid gap-1 break-all">
                  <dt>Base Schema</dt>
                  <dd>{review.base.schemaHash ?? review.base.status}</dd>
                  <dt>Draft Schema</dt>
                  <dd>{review.draft.schemaHash ?? review.draft.status}</dd>
                </dl>
              </details>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <ChangeReviewChanges groups={groups} operations={operations} />
          {review ? (
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer">Compare complete content</summary>
              <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-2">
                {[
                  ['Before', review.baseContent],
                  ['After', review.draftContent],
                ].map(([label, content]) => (
                  <section key={String(label)} className="min-w-0">
                    <h3 className="mb-2 font-medium">{String(label)}</h3>
                    <pre className="max-h-[60vh] overflow-auto rounded bg-[var(--surface-panel)] p-3 text-xs">
                      {dump(content, { noRefs: true, sortKeys: true })}
                    </pre>
                  </section>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}
