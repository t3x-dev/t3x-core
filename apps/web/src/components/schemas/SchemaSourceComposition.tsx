'use client';

import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { mergeSchemaDraft } from '@/domain/schemas/schemaDraftMerge';
import type { SchemaDefinition } from '@/domain/schemas/schemaFieldEditing';
import { useStudioPreview } from '@/hooks/schemas/useStudioPreview';
import s from './SchemaSourceManager.module.css';

export function SchemaSourceComposition({
  projectId,
  workspaceId,
  candidates,
  selection,
  initialComposition,
  baseDefinition,
  currentDefinition,
  onBack,
  onSaved,
  onSavingChange,
  onSave,
}: {
  projectId: string;
  workspaceId: string;
  candidates: StudioCandidate[];
  selection: string[];
  initialComposition?: Record<string, string>;
  baseDefinition?: SchemaDefinition;
  currentDefinition?: SchemaDefinition;
  onBack: () => void;
  onSaved: () => void;
  onSavingChange: (saving: boolean) => void;
  onSave: (
    ids: string[],
    composition: Record<string, string>,
    preview: StudioPreview,
    definition: SchemaDefinition
  ) => Promise<void>;
}) {
  const ids = selection;
  const busy = useRef(false);
  const [composition, setComposition] = useState(initialComposition ?? {});
  const [choices, setChoices] = useState<Record<string, 'current' | 'incoming'>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // A source-combination preview always uses source bytes; no bound Workspace substitution.
  const preview = useStudioPreview(projectId, { candidateIds: ids, composition });
  const merged = useMemo(
    () =>
      preview.data
        ? mergeSchemaDraft(
            baseDefinition ?? {},
            currentDefinition ?? baseDefinition ?? {},
            preview.data.schema,
            choices
          )
        : undefined,
    [preview.data, baseDefinition, currentDefinition, choices]
  );
  const name = (id: string) => {
    const item = candidates.find((candidate) => candidate.id === id);
    return `${item?.title ?? item?.source?.canonicalName ?? id} @ ${item?.source?.version ?? '?'}`;
  };
  return (
    <>
      <div className={s.scroll}>
        <h3 className="pt-4 text-sm font-medium">Combine schemas</h3>
        <p className={s.feedback}>
          Resolve conflicting definitions, then save the combined draft with your current field
          edits.
        </p>
        <fieldset disabled={saving} className="space-y-3 pb-4">
          <legend className="sr-only">Combined sources</legend>
          <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
            {ids.map((id) => (
              <li key={id}>{name(id)}</li>
            ))}
          </ul>
          {preview.loading ? <output>Checking source definitions…</output> : null}
          {(preview.data?.compositionConflicts ?? []).map((conflict) => (
            <div
              key={conflict.path}
              className="space-y-2 rounded-md border border-[var(--stroke-default)] p-3"
            >
              <label className="block text-sm font-medium">
                {conflict.path === '$metadata'
                  ? 'Root metadata and constraints'
                  : `Definition conflict: ${conflict.path}`}
                <select
                  aria-label={`Source for ${conflict.path}`}
                  className="mt-2 h-9 w-full rounded-md border px-2"
                  value={composition[conflict.path] ?? ''}
                  onChange={(event) => {
                    setComposition((current) => {
                      const next = { ...current };
                      if (event.target.value) next[conflict.path] = event.target.value;
                      else delete next[conflict.path];
                      return next;
                    });
                    setChoices({});
                  }}
                >
                  <option value="">Choose a source</option>
                  {conflict.candidates.map((id) => (
                    <option key={id} value={id}>
                      {name(id)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-[var(--text-secondary)]">
                The chosen definition is kept intact. Other definitions at this path are excluded
                explicitly.
              </p>
              <details>
                <summary className="cursor-pointer text-sm">Compare source definitions</summary>
                {conflict.candidates.map((id) => (
                  <div key={id} className="mt-2">
                    <b className="text-xs">{name(id)}</b>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                      {JSON.stringify(conflict.definitions?.[id], null, 2)}
                    </pre>
                  </div>
                ))}
              </details>
            </div>
          ))}
          {merged?.conflicts.map((conflict) => (
            <div
              key={conflict.path}
              className="space-y-2 rounded-md border border-[var(--stroke-default)] p-3"
            >
              <p className="text-sm font-medium">
                Your edit overlaps the new sources: {conflict.path}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(['current', 'incoming'] as const).map((side) => (
                  <div key={side}>
                    <b>{side === 'current' ? 'Current draft' : 'New sources'}</b>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(conflict[side], null, 2) ?? '(removed)'}
                    </pre>
                    <Button
                      variant="canvas-outline"
                      size="sm"
                      onClick={() => setChoices((value) => ({ ...value, [conflict.path]: side }))}
                    >
                      {side === 'current' ? 'Keep my changes' : 'Use source definition'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {preview.data?.report.issues
            .filter((issue) => issue.blocking)
            .map((issue, index) => (
              <p key={`${issue.code}:${index}`} className="text-sm text-[var(--status-error)]">
                {issue.message}
              </p>
            ))}
          {preview.error || error ? (
            <p role="alert" className="text-sm text-[var(--status-error)]">
              {error || preview.error}
            </p>
          ) : null}
          {merged && preview.data?.report.valid && !merged.conflicts.length ? (
            <details>
              <summary className="cursor-pointer text-sm">Preview combined definition</summary>
              <pre className="max-h-64 overflow-auto text-xs">
                {JSON.stringify(merged.definition, null, 2)}
              </pre>
            </details>
          ) : null}
        </fieldset>
      </div>
      <footer className={s.footer}>
        <Button variant="ghost" size="sm" disabled={saving} onClick={onBack}>
          Back
        </Button>
        <Button
          variant="commit"
          size="sm"
          disabled={
            saving ||
            preview.loading ||
            !!preview.error ||
            !ids.length ||
            !workspaceId ||
            !preview.data?.report.valid ||
            !merged ||
            !!merged.conflicts.length
          }
          onClick={async () => {
            if (busy.current || !preview.data || !merged) return;
            busy.current = true;
            setSaving(true);
            onSavingChange(true);
            setError('');
            try {
              await onSave(ids, composition, preview.data, merged.definition);
              onSaved();
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : 'Could not save the combined candidate.'
              );
            } finally {
              busy.current = false;
              setSaving(false);
              onSavingChange(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save combined draft'}
        </Button>
      </footer>
    </>
  );
}
