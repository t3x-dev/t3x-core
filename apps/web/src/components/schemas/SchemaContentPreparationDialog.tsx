'use client';

import {
  type SchemaPreparationInput,
  SchemaPreparationInputSchema,
  type SchemaPreparationPreview,
  type SchemaPreparationTarget,
} from '@t3x-dev/api-client';
import { canonicalJson, type YValue } from '@t3x-dev/yops';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { walkDraftStructure } from '@/domain/workspaces/draftStructure';
import { useSchemaContentPreparation } from '@/hooks/schemas/useSchemaContentPreparation';
import {
  newPreparationChange,
  type PreparationChange,
  PreparationChangeForm,
  PreparationValueTree,
  preparationCommands,
  readablePreparationPath,
} from './SchemaPreparationFields';

/** Shared Studio/Workspace preparation surface. A preview belongs to one exact form and revision. */
export function SchemaContentPreparationDialog({
  projectId,
  workspaceId,
  revision,
  target,
  open,
  onOpenChange,
  onPrepared,
}: {
  projectId: string;
  workspaceId: string;
  revision: number;
  target: SchemaPreparationTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrepared: () => void | Promise<void>;
}) {
  const scope = JSON.stringify([projectId, workspaceId, revision, target, open]);
  const pathsId = useId();
  const preparation = useSchemaContentPreparation(projectId, workspaceId);
  const epoch = useRef(0);
  const saving = useRef(false);
  const [changes, setChanges] = useState<PreparationChange[]>([]);
  const [stale, setStale] = useState(false);
  const [confirmedChanges, setConfirmedChanges] = useState<string[]>([]);
  const [context, setContext] = useState<SchemaPreparationPreview>();
  const [review, setReview] = useState<{
    data: SchemaPreparationPreview;
    input: SchemaPreparationInput;
    requestId: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const token = ++epoch.current;
    setChanges([]);
    setStale(false);
    setConfirmedChanges([]);
    setContext(undefined);
    setReview(undefined);
    setError(undefined);
    if (!open) return;
    setBusy(true);
    const [_project, _workspace, ifRevision, selection] = JSON.parse(scope) as [
      string,
      string,
      number,
      SchemaPreparationTarget,
      boolean,
    ];
    void preparation
      .preview({
        target: selection,
        ifRevision,
        commands: [],
        confirmedChanges: [],
      })
      .then(
        (data) => {
          if (epoch.current === token) setContext(data);
        },
        (cause) => {
          if (epoch.current === token)
            setError(cause instanceof Error ? cause.message : 'Preparation unavailable.');
        }
      )
      .finally(() => {
        if (epoch.current === token) setBusy(false);
      });
    return () => {
      ++epoch.current;
    };
  }, [scope, open, preparation.preview]);

  useEffect(() => {
    if (!open) return;
    const invalidate = () => {
      if (saving.current) return;
      ++epoch.current;
      setReview(undefined);
      setStale(true);
      setBusy(false);
      setError('Workspace or source authority may have changed. Preview the migration again.');
    };
    window.addEventListener('focus', invalidate);
    return () => window.removeEventListener('focus', invalidate);
  }, [open]);

  function changeCommands(value: PreparationChange[]) {
    ++epoch.current;
    setChanges(value);
    setStale(true);
    setReview(undefined);
    setBusy(false);
    setError(undefined);
  }
  async function preview() {
    const token = ++epoch.current;
    setReview(undefined);
    setError(undefined);
    setBusy(true);
    try {
      const input = SchemaPreparationInputSchema.parse({
        target,
        ifRevision: revision,
        commands: preparationCommands(changes),
        confirmedChanges,
      });
      const data = await preparation.preview(input);
      if (epoch.current !== token) return;
      setContext(data);
      setStale(false);
      setReview({ data, input, requestId: `schema-preparation:${crypto.randomUUID()}` });
    } catch (cause) {
      if (epoch.current === token) setError(preparationError(cause));
    } finally {
      if (epoch.current === token) setBusy(false);
    }
  }
  async function prepare() {
    if (!review?.data.canPrepare || busy) return;
    const token = ++epoch.current;
    saving.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await preparation.prepare({
        ...review.input,
        previewHash: review.data.previewHash,
        requestId: review.requestId,
      });
      if (epoch.current !== token) return;
      await onPrepared();
      if (epoch.current === token) onOpenChange(false);
    } catch (cause) {
      if (epoch.current === token) {
        setError(cause instanceof Error ? cause.message : 'Preparation failed.');
        if ((cause as { code?: string })?.code) setReview(undefined);
      }
    } finally {
      saving.current = false;
      if (epoch.current === token) setBusy(false);
    }
  }
  const data = review?.data ?? context;
  const mappingPaths = [
    ...new Set(
      data?.impact.items.filter((item) => item.kind === 'needs_mapping').map((item) => item.path) ??
        []
    ),
  ];
  const differences = data ? contentDifferences(data.before, data.after) : [];
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent
        className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-6xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>Prepare Schema content</DialogTitle>
          <DialogDescription>
            Adapt existing content to the new Schema, preview the result, then save both together as
            one Draft revision. Nothing is published or committed here.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
          {error ? (
            <p role="alert" className="text-sm text-[var(--status-error)]">
              {error}
            </p>
          ) : null}
          {busy ? <output className="text-xs">Checking the complete Draft…</output> : null}
          <section aria-label="Content changes" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">1 · Plan content changes</h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Move or rename existing content, fill missing values, or remove content
                  explicitly.
                </p>
              </div>
              <Button
                variant="outline"
                disabled={busy || !context || changes.length >= 200}
                onClick={() => changeCommands([...changes, newPreparationChange()])}
              >
                + Add change
              </Button>
            </div>
            <datalist id={pathsId}>
              {walkDraftStructure(data?.before).map((node) => (
                <option key={node.path} value={node.path}>
                  {readablePreparationPath(node.path)}
                </option>
              ))}
            </datalist>
            {changes.length ? (
              <fieldset disabled={busy || !context} className="space-y-3">
                {changes.map((change, index) => (
                  <PreparationChangeForm
                    key={change.id}
                    change={change}
                    index={index}
                    pathsId={pathsId}
                    onChange={(next) =>
                      changeCommands(changes.map((item) => (item.id === change.id ? next : item)))
                    }
                    onRemove={() => changeCommands(changes.filter((item) => item.id !== change.id))}
                  />
                ))}
              </fieldset>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-[var(--text-secondary)]">
                No content edits planned. If the checks pass, your existing content can be kept as
                it is.
              </p>
            )}
          </section>
          {mappingPaths.length ? (
            <fieldset className="space-y-2 rounded border p-3 text-xs">
              <legend>Confirm affected mappings</legend>
              <p className="text-[var(--text-secondary)]">
                Confirmations acknowledge your migration plan; they do not replace the required
                content changes.
              </p>
              {mappingPaths.map((path) => (
                <label key={path} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={confirmedChanges.includes(path)}
                    onChange={(event) => {
                      ++epoch.current;
                      setReview(undefined);
                      setStale(true);
                      setConfirmedChanges((items) =>
                        event.target.checked
                          ? [...items, path]
                          : items.filter((item) => item !== path)
                      );
                    }}
                  />
                  My changes explicitly handle{' '}
                  <span title={path}>{readablePreparationPath(path)}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {data ? (
            <>
              <h3 className="border-t pt-4 text-sm font-semibold">2 · Check and preview</h3>
              {stale ? (
                <output className="block rounded border border-[var(--status-warning)] p-3 text-xs">
                  Changes have not been previewed yet. The results below belong to the previous
                  preview.
                </output>
              ) : null}
              {data.issues.length ? (
                <section
                  aria-label="Migration checks"
                  className="rounded-lg border border-[var(--status-warning)] p-4 text-xs"
                >
                  <h3 className="font-semibold">{data.issues.length} checks need attention</h3>
                  {data.issues.map((issue, index) => (
                    <p className="mt-2 break-words" key={`${issue.code}:${issue.path}:${index}`}>
                      <span title={issue.path} className="font-medium">
                        {readablePreparationPath(issue.path)}
                      </span>{' '}
                      · {issue.message}
                    </p>
                  ))}
                </section>
              ) : (
                <output className="block rounded-lg border border-[var(--status-success)] bg-[var(--status-success-muted)] p-4 text-sm">
                  Content satisfies the candidate Schema.
                  {!review ? ' Preview once more to confirm before saving.' : ''}
                </output>
              )}
              <section aria-label="Content comparison" className="rounded-lg border p-4">
                <h4 className="text-sm font-medium">
                  Content changes · {differences.length}{' '}
                  {differences.length === 1 ? 'field' : 'fields'}
                </h4>
                {differences.length ? (
                  <div className="mt-3 max-h-80 overflow-auto">
                    <table className="w-full table-fixed text-left text-xs">
                      <thead>
                        <tr className="border-b text-[var(--text-secondary)]">
                          <th className="w-1/4 p-2">Field</th>
                          <th className="p-2">Before</th>
                          <th className="p-2">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {differences.map((row) => (
                          <tr key={row.path} className="border-b align-top last:border-0">
                            <th title={row.path} className="break-words p-2 font-medium">
                              {readablePreparationPath(row.path)}
                            </th>
                            <td className="break-words bg-[var(--diff-removed-bg)] p-2">
                              {row.beforeExists ? (
                                <PreparationValueTree label="Value" value={row.before} />
                              ) : (
                                'Not present'
                              )}
                            </td>
                            <td className="break-words bg-[var(--diff-added-bg)] p-2">
                              {row.afterExists ? (
                                <PreparationValueTree label="Value" value={row.after} />
                              ) : (
                                'Removed'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Content is unchanged. Only the Schema binding will be updated when you save.
                  </p>
                )}
              </section>
              <details className="rounded-lg border p-4 text-xs">
                <summary className="cursor-pointer font-medium">
                  Browse complete content · before and after
                </summary>
                <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-2">
                  <Document title="Current Draft" value={data.before} />
                  <Document title="Prepared Draft" value={data.after} />
                </div>
              </details>
              <details className="rounded-lg border p-4 text-xs">
                <summary className="cursor-pointer font-medium">
                  Target Schema · {Object.keys(data.schema.nodes ?? {}).length} nodes
                </summary>
                <p className="my-2 text-[var(--text-secondary)]">
                  The structure and constraints the prepared content must satisfy.
                </p>
                <Document title="Target Schema definition" value={data.schema} />
              </details>
              <details className="rounded-lg border p-4 text-xs">
                <summary className="cursor-pointer font-medium">
                  Execution plan · {data.operations.length}{' '}
                  {data.operations.length === 1 ? 'operation' : 'operations'}
                </summary>
                <p className="my-2 text-[var(--text-secondary)]">
                  Generated automatically from your changes. Guard checks prevent applying them to
                  unexpected content.
                </p>
                <ol className="space-y-2">
                  {data.operations.map((operation, index) => {
                    const [kind, parameters] = Object.entries(operation)[0] ?? ['operation', {}];
                    const labels: Record<string, string> = {
                      assert: 'Check existing content',
                      set: 'Set value',
                      move: 'Move content',
                      append: 'Append item',
                      unset: 'Remove value',
                      drop: 'Remove node',
                      rename: 'Rename node',
                      define: 'Create node',
                    };
                    return (
                      <li key={`${index}:${kind}`}>
                        <PreparationValueTree
                          label={`${index + 1} · ${labels[kind] ?? kind}`}
                          value={parameters}
                          depth={2}
                        />
                      </li>
                    );
                  })}
                </ol>
                {!data.operations.length ? <p>No content operations needed.</p> : null}
              </details>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t pt-3">
          <p className="mr-auto text-xs text-[var(--text-secondary)]">
            3 · Save to Draft · not a publish or Commit
          </p>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void preview()}>
            Preview migration
          </Button>
          <Button disabled={busy || !review?.data.canPrepare} onClick={() => void prepare()}>
            Save prepared Draft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Document({ title, value }: { title: string; value: unknown }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="mb-2 text-xs font-medium">{title}</h3>
      <div className="max-h-80 overflow-auto rounded bg-[var(--surface-panel)] p-3 text-xs">
        <PreparationValueTree value={value} label={title} />
      </div>
    </section>
  );
}

function contentDifferences(before: unknown, after: unknown) {
  const leaves = (value: unknown) =>
    new Map(
      walkDraftStructure({ document: value })
        .filter((node) => !node.expandable)
        .map((node) => [node.path.replace(/^document\/?/, ''), node.value])
    );
  const left = leaves(before);
  const right = leaves(after);
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter(
      (path) =>
        left.has(path) !== right.has(path) ||
        canonicalJson(left.get(path) as YValue) !== canonicalJson(right.get(path) as YValue)
    )
    .map((path) => ({
      path,
      before: left.get(path),
      after: right.get(path),
      beforeExists: left.has(path),
      afterExists: right.has(path),
    }));
}

function preparationError(cause: unknown) {
  if (cause && typeof cause === 'object' && 'issues' in cause && Array.isArray(cause.issues))
    return cause.issues
      .map(
        (issue: { message: string; path?: Array<string | number> }) =>
          `${issue.path?.join(' › ') || 'Migration'}: ${issue.message}`
      )
      .join(' ');
  return cause instanceof Error ? cause.message : 'Migration preview failed.';
}
