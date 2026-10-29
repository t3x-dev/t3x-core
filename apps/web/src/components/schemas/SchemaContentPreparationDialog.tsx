'use client';

import {
  type SchemaPreparationInput,
  SchemaPreparationInputSchema,
  type SchemaPreparationPreview,
  type SchemaPreparationTarget,
} from '@t3x-dev/api-client';
import { canonicalJson, type YValue } from '@t3x-dev/yops';
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  GitCompareArrows,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { draftPathSegment, walkDraftStructure } from '@/domain/workspaces/draftStructure';
import { useSchemaContentPreparation } from '@/hooks/schemas/useSchemaContentPreparation';
import {
  newPreparationChange,
  type PreparationChange,
  PreparationChangeForm,
  PreparationValueEditor,
  PreparationValueTree,
  preparationCommands,
  readablePreparationPath,
} from './SchemaPreparationFields';
import { requiredContentChange } from './schemaPreparationSuggestions';

const stepClass =
  'space-y-3 rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-xs)]';
const stepTitleClass = 'text-sm font-semibold text-[var(--text-primary)]';
const panelClass = 'rounded-lg border border-[var(--stroke-divider)] p-4';
const detailsClass = 'group rounded-lg border border-[var(--stroke-divider)] px-4 py-3 text-xs';
const summaryClass =
  'flex cursor-pointer list-none select-none items-center gap-2 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] [&::-webkit-details-marker]:hidden';
const chevronClass = 'size-3.5 shrink-0 transition-transform group-open:rotate-90';

/** Shared Studio/Workspace preparation surface. A preview belongs to one exact form and revision. */
export function SchemaContentPreparationDialog({
  projectId,
  workspaceId,
  revision,
  target,
  open,
  onOpenChange,
  onPrepared,
  continueToReview = false,
  embedded = false,
}: {
  projectId: string;
  workspaceId: string;
  revision: number;
  target: SchemaPreparationTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrepared: () => void | Promise<void>;
  continueToReview?: boolean;
  embedded?: boolean;
}) {
  const scope = JSON.stringify([projectId, workspaceId, revision, target, open]);
  const pathsId = useId();
  const preparation = useSchemaContentPreparation(projectId, workspaceId);
  const epoch = useRef(0);
  const saving = useRef(false);
  const [changes, setChanges] = useState<PreparationChange[]>([]);
  const [requirements, setRequirements] = useState<
    Record<string, SchemaPreparationPreview['issues'][number]>
  >({});
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
    setRequirements({});
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
          if (epoch.current === token) {
            setContext(data);
            setReview({
              data,
              input: { target: selection, ifRevision, commands: [], confirmedChanges: [] },
              requestId: `schema-preparation:${crypto.randomUUID()}`,
            });
          }
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
  const Header = embedded ? 'header' : DialogHeader;
  const Heading = embedded ? 'h1' : DialogTitle;
  const Description = embedded ? 'p' : DialogDescription;
  const requirementIssues = Object.values({
    ...requirements,
    ...Object.fromEntries(
      (context?.issues ?? []).map((issue) => [`required-content:${issue.path}`, issue])
    ),
  });
  return (
    <PreparationShell open={open} embedded={embedded} busy={busy} onOpenChange={onOpenChange}>
      <Header className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-6 py-4 pr-12 text-left">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]"
          >
            <GitCompareArrows className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            {embedded ? (
              <p className="mb-2 text-xs text-[var(--text-secondary)]">
                Schema · Edit → Adapt content → Review
              </p>
            ) : null}
            <Heading className="text-base font-semibold">
              {continueToReview ? 'Update content for this schema' : 'Prepare Schema content'}
            </Heading>
            <Description className="max-w-3xl text-xs leading-relaxed">
              Adapt existing content to the new Schema, preview the result, then save both together
              as one Draft revision. Nothing is published or committed here.
            </Description>
          </div>
        </div>
      </Header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[var(--surface-app)] px-6 py-5">
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[var(--status-error)] bg-[var(--status-error-muted)] px-3 py-2 text-sm text-[var(--status-error)]"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </p>
        ) : null}
        {busy ? (
          <output className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            Checking the complete Draft…
          </output>
        ) : null}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0 space-y-4">
            <section aria-label="Content changes" className={stepClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className={stepTitleClass}>Resolve required content changes</h3>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Move or rename existing content, fill missing values, or remove content
                    explicitly.
                  </p>
                </div>
              </div>
              {requirementIssues.map((issue) => {
                const id = `required-content:${issue.path}`;
                const planned = changes.find((change) => change.id === id);
                const suggested = context ? requiredContentChange(context, issue) : undefined;
                if (!suggested && !planned) return null;
                const nodeMissing = issue.code === 'REQUIRED_NODE_MISSING';
                const resolved =
                  !stale &&
                  !!review &&
                  !review.data.issues.some((item) => item.path === issue.path);
                return (
                  <section
                    key={id}
                    aria-label={`Resolve ${issue.path}`}
                    className="space-y-3 rounded-md border border-[var(--stroke-divider)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="break-words text-sm font-semibold">{issue.path}</h4>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {resolved
                            ? 'Resolved in the latest preview.'
                            : issue.code === 'DEFAULT_REQUIRES_APPROVAL'
                              ? 'A default is available. Review the value before using it.'
                              : nodeMissing
                                ? 'This required node is missing from the existing content.'
                                : 'Enter a value for this required field.'}
                        </p>
                      </div>
                      {planned ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            changeCommands(changes.filter((change) => change.id !== id))
                          }
                        >
                          Undo resolution
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || !suggested || changes.length >= 200}
                          onClick={() => {
                            if (!suggested) return;
                            setRequirements((current) => ({ ...current, [id]: issue }));
                            changeCommands([...changes, suggested]);
                          }}
                        >
                          {issue.code === 'DEFAULT_REQUIRES_APPROVAL'
                            ? `Use default for ${issue.path}`
                            : nodeMissing
                              ? `Add node ${issue.path}`
                              : `Fill ${issue.path}`}
                        </Button>
                      )}
                    </div>
                    {!planned && suggested && issue.code === 'DEFAULT_REQUIRES_APPROVAL' ? (
                      <PreparationValueTree
                        label="Default value"
                        value={
                          preparationCommands([suggested]).map((command) =>
                            'value' in command ? command.value : null
                          )[0]
                        }
                      />
                    ) : null}
                    {planned ? (
                      nodeMissing ? (
                        <p className="text-sm text-[var(--text-secondary)]">
                          {resolved
                            ? 'The new node is included in the preview.'
                            : 'The node will be created. Preview the result to check its required fields.'}
                        </p>
                      ) : (
                        <fieldset disabled={busy}>
                          <PreparationValueEditor
                            label={`Value for ${issue.path}`}
                            value={planned.value}
                            fixedType
                            onChange={(value) =>
                              changeCommands(
                                changes.map((change) =>
                                  change.id === id ? { ...change, value } : change
                                )
                              )
                            }
                          />
                        </fieldset>
                      )
                    ) : null}
                  </section>
                );
              })}
              <details className="rounded-md border border-[var(--stroke-divider)] p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Advanced content edits
                </summary>
                <p className="my-3 text-xs text-[var(--text-secondary)]">
                  For custom moves, renames or removals, choose an action and its content location.
                  Preview all changes before continuing.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !context || changes.length >= 200}
                  onClick={() => changeCommands([...changes, newPreparationChange()])}
                >
                  + Add change
                </Button>
                <datalist id={pathsId}>
                  {walkDraftStructure(data?.before).map((node) => (
                    <option key={node.path} value={node.path}>
                      {readablePreparationPath(node.path)}
                    </option>
                  ))}
                </datalist>
                {changes.length ? (
                  <fieldset disabled={busy || !context} className="space-y-3">
                    {changes
                      .filter((change) => !requirements[change.id])
                      .map((change, index) => (
                        <PreparationChangeForm
                          key={change.id}
                          change={change}
                          index={index}
                          pathsId={pathsId}
                          onChange={(next) =>
                            changeCommands(
                              changes.map((item) => (item.id === change.id ? next : item))
                            )
                          }
                          onRemove={() =>
                            changeCommands(changes.filter((item) => item.id !== change.id))
                          }
                        />
                      ))}
                  </fieldset>
                ) : (
                  <p className="rounded-lg border border-dashed border-[var(--stroke-strong)] bg-[var(--surface-panel)] px-4 py-5 text-center text-sm text-[var(--text-secondary)]">
                    No content edits planned. If the checks pass, your existing content can be kept
                    as it is.
                  </p>
                )}
              </details>
            </section>
            {mappingPaths.length ? (
              <fieldset className="space-y-2 rounded-xl border border-[var(--status-warning)] bg-[var(--status-warning-muted)] p-4 text-xs">
                <legend className="px-1 font-semibold">Confirm affected mappings</legend>
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
          </div>
          {data ? (
            <div className={stepClass}>
              <h3 className={stepTitleClass}>Check content changes</h3>
              {stale ? (
                <output className="flex items-start gap-2 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-muted)] px-3 py-2.5 text-xs">
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-[var(--status-warning)]"
                  />
                  Changes have not been previewed yet. The results below belong to the previous
                  preview.
                </output>
              ) : null}
              {data.issues.length ? (
                <section
                  aria-label="Migration checks"
                  className="rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-muted)] p-4 text-xs"
                >
                  <h3 className="flex items-center gap-2 font-semibold">
                    <TriangleAlert
                      aria-hidden="true"
                      className="size-3.5 text-[var(--status-warning)]"
                    />
                    {data.issues.length} checks need attention
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {data.issues.map((issue, index) => (
                      <li
                        className="break-words rounded-md bg-[var(--surface-card)] px-2.5 py-1.5"
                        key={`${issue.code}:${issue.path}:${index}`}
                      >
                        <span title={issue.path} className="font-mono font-medium">
                          {readablePreparationPath(issue.path)}
                        </span>{' '}
                        · {issue.message}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <output className="flex items-start gap-2 rounded-lg border border-[var(--status-success)] bg-[var(--status-success-muted)] px-3 py-2.5 text-sm">
                  <CircleCheck
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-[var(--status-success)]"
                  />
                  <span>
                    {data.contentValidation === 'not_applicable'
                      ? 'No business content to migrate. Required fields will be checked when content is added.'
                      : 'Content satisfies the candidate Schema.'}
                  </span>
                </output>
              )}
              <section aria-label="Content comparison" className={panelClass}>
                <h4 className="flex items-center gap-2 text-sm font-medium">
                  Content changes · {differences.length}{' '}
                  {differences.length === 1 ? 'field' : 'fields'}
                </h4>
                {differences.length ? (
                  <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-[var(--stroke-divider)]">
                    <table className="w-full table-fixed text-left text-xs">
                      <thead className="sticky top-0 bg-[var(--surface-panel)]">
                        <tr className="border-b border-[var(--stroke-divider)] text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
                          <th className="w-1/4 px-3 py-2 font-medium">Field</th>
                          <th className="px-3 py-2 font-medium">Before</th>
                          <th className="px-3 py-2 font-medium">After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {differences.map((row) => (
                          <tr
                            key={row.path}
                            className="border-b border-[var(--stroke-divider)] align-top last:border-0"
                          >
                            <th
                              title={row.path}
                              className="break-words px-3 py-2 font-mono font-medium"
                            >
                              {readablePreparationPath(row.path)}
                            </th>
                            <td className="break-words border-l-2 border-[var(--diff-removed-accent)] bg-[var(--diff-removed-bg)] px-3 py-2">
                              {row.beforeExists ? (
                                <PreparationValueTree label="Value" value={row.before} />
                              ) : (
                                'Not present'
                              )}
                            </td>
                            <td className="break-words border-l-2 border-[var(--diff-added-accent)] bg-[var(--diff-added-bg)] px-3 py-2">
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
              <details className={detailsClass}>
                <summary className={summaryClass}>
                  <ChevronRight aria-hidden="true" className={chevronClass} />
                  Browse complete content · before and after
                </summary>
                <div className="mt-3 grid min-w-0 gap-4 md:grid-cols-2">
                  <Document title="Current Draft" value={data.before} />
                  <Document title="Prepared Draft" value={data.after} />
                </div>
              </details>
              <details className={detailsClass}>
                <summary className={summaryClass}>
                  <ChevronRight aria-hidden="true" className={chevronClass} />
                  Target Schema · {Object.keys(data.schema.nodes ?? {}).length} nodes
                </summary>
                <p className="my-2 text-[var(--text-secondary)]">
                  The structure and constraints the prepared content must satisfy.
                </p>
                <Document title="Target Schema definition" value={data.schema} />
              </details>
              <details className={detailsClass}>
                <summary className={summaryClass}>
                  <ChevronRight aria-hidden="true" className={chevronClass} />
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
                      <li
                        className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2"
                        key={`${index}:${kind}`}
                      >
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
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-6 py-3">
        <p className="mr-auto text-xs text-[var(--text-tertiary)]">
          Saving updates the Draft. Commit happens after Review.
        </p>
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
          {embedded ? 'Back to editing' : 'Cancel'}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void preview()}>
          Preview changes
        </Button>
        <Button
          disabled={busy || !review?.data.canPrepare}
          onClick={() => void prepare()}
          variant="commit"
        >
          {continueToReview ? 'Save and continue to review' : 'Save prepared Draft'}
        </Button>
      </div>
    </PreparationShell>
  );
}

function PreparationShell({
  children,
  open,
  embedded,
  busy,
  onOpenChange,
}: {
  children: ReactNode;
  open: boolean;
  embedded: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (embedded)
    return open ? (
      <section
        aria-label="Update content for this schema"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {children}
      </section>
    ) : null;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
        showCloseButton={!busy}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Document({ title, value }: { title: string; value: unknown }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        {title}
      </h3>
      <div className="max-h-80 overflow-auto rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 text-xs">
        <PreparationValueTree value={value} label={title} />
      </div>
    </section>
  );
}

function contentDifferences(before: unknown, after: unknown) {
  const rows: Array<{
    path: string;
    before: unknown;
    after: unknown;
    beforeExists: boolean;
    afterExists: boolean;
  }> = [];
  const mapping = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  const visit = (left: unknown, right: unknown, path: string) => {
    if (left === undefined && right === undefined) return;
    if (
      left !== undefined &&
      right !== undefined &&
      canonicalJson(left as YValue) === canonicalJson(right as YValue)
    )
      return;
    if (mapping(left) && mapping(right)) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
        visit(
          left[key],
          right[key],
          path ? `${path}/${draftPathSegment(key)}` : draftPathSegment(key)
        );
      return;
    }
    rows.push({
      path,
      before: left,
      after: right,
      beforeExists: left !== undefined,
      afterExists: right !== undefined,
    });
  };
  visit(before, after, '');
  return rows;
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
