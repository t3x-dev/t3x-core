'use client';

import {
  type SchemaPreparationInput,
  SchemaPreparationInputSchema,
  type SchemaPreparationPreview,
  type SchemaPreparationTarget,
} from '@t3x-dev/api-client';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useSchemaContentPreparation } from '@/hooks/schemas/useSchemaContentPreparation';

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
  const commandId = useId();
  const preparation = useSchemaContentPreparation(projectId, workspaceId);
  const epoch = useRef(0);
  const saving = useRef(false);
  const [commands, setCommands] = useState('[]');
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
    setCommands('[]');
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
      setBusy(false);
      setError('Workspace or source authority may have changed. Preview the migration again.');
    };
    window.addEventListener('focus', invalidate);
    return () => window.removeEventListener('focus', invalidate);
  }, [open]);

  function changeCommands(value: string) {
    ++epoch.current;
    setCommands(value);
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
        commands: JSON.parse(commands),
        confirmedChanges,
      });
      const data = await preparation.preview(input);
      if (epoch.current !== token) return;
      setContext(data);
      setReview({ data, input, requestId: `schema-preparation:${crypto.randomUUID()}` });
    } catch (cause) {
      if (epoch.current === token)
        setError(cause instanceof Error ? cause.message : 'Migration preview failed.');
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
  const example =
    data?.before &&
    typeof data.before === 'object' &&
    !Array.isArray(data.before) &&
    data.before.domain === 't3x.dev/semantic-content'
      ? '[{"kind":"rename_node","path":"content/trees/[key=candidate]/children/[key=requirements]","toKey":"features"}]'
      : '[{"kind":"move","from":"candidate/requirements","to":"candidate/features"},{"kind":"set","path":"candidate/advantage","value":{"title":"Faster"}}]';
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Prepare Schema content</DialogTitle>
          <DialogDescription>
            Confirm mappings and fill required content. Saving creates one Draft revision containing
            the Schema binding and content YOps. It does not publish or Commit.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
          {error ? (
            <p role="alert" className="text-sm text-[var(--status-error)]">
              {error}
            </p>
          ) : null}
          {busy ? <output className="text-xs">Checking the complete Draft…</output> : null}
          <label htmlFor={commandId} className="block space-y-2 text-sm">
            <span>Content migration commands (JSON)</span>
            <Textarea
              id={commandId}
              aria-label="Content migration commands"
              className="min-h-36 font-mono text-xs"
              value={commands}
              disabled={busy || !context}
              onChange={(event) => changeCommands(event.target.value)}
            />
          </label>
          <p className="text-xs text-[var(--text-secondary)]">
            Supported: rename_node (semantic node key), move (path mapping), set (input or explicit
            conversion), append, remove (explicit deletion). Paths address the full Draft shown
            below. Update affected relation endpoints explicitly when renaming linked nodes.
          </p>
          <details className="text-xs">
            <summary>Example commands</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all">{example}</pre>
          </details>
          {mappingPaths.length ? (
            <fieldset className="space-y-2 rounded border p-3 text-xs">
              <legend>Confirm each mapping</legend>
              {mappingPaths.map((path) => (
                <label key={path} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={confirmedChanges.includes(path)}
                    onChange={(event) => {
                      ++epoch.current;
                      setReview(undefined);
                      setConfirmedChanges((items) =>
                        event.target.checked
                          ? [...items, path]
                          : items.filter((item) => item !== path)
                      );
                    }}
                  />
                  My commands explicitly handle {path}
                </label>
              ))}
            </fieldset>
          ) : null}
          {data ? (
            <>
              {data.issues.length ? (
                <section aria-label="Migration checks" className="rounded border p-3 text-xs">
                  <h3 className="font-medium">Required inputs and mapping checks</h3>
                  {data.issues.map((issue, index) => (
                    <p className="mt-1" key={`${issue.code}:${issue.path}:${index}`}>
                      {issue.path}: {issue.message}
                    </p>
                  ))}
                </section>
              ) : (
                <output className="text-sm">Content satisfies the candidate Schema.</output>
              )}
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <Document title="Current full Draft" value={data.before} />
                <Document title="Prepared full Draft" value={data.after} />
              </div>
              <details className="text-xs">
                <summary>Candidate YSchema</summary>
                <Document title="Target Schema definition" value={data.schema} />
              </details>
              <details className="text-xs">
                <summary>Generated guarded YOps</summary>
                <Document title="Content YOps" value={data.operations} />
              </details>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t pt-3">
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
      <pre className="max-h-72 overflow-auto rounded bg-[var(--surface-panel)] p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
