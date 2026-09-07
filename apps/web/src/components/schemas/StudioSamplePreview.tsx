'use client';

import type { StudioPreview, StudioSample } from '@t3x-dev/api-client';
import { CheckCircle2, Code2, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { StateValueReader } from '@/components/project/StateValueReader';
import { Button } from '@/components/ui/button';
import { useValidateStudioSample } from '@/hooks/schemas/useStudioPreview';
import { StudioDefinitionPreview } from './StudioDefinitionPreview';

/** Keyed by the compiled selection: sample edits cannot survive a module/version change. */
export function StudioSamplePreview({
  projectId,
  candidateIds,
  preview,
  xray,
  title,
}: {
  projectId: string;
  candidateIds: string[];
  preview: StudioPreview;
  xray: boolean;
  title?: string;
}) {
  const [sampleId, setSampleId] = useState(preview.samples[0]?.id);
  const sample = preview.samples.find((item) => item.id === sampleId) ?? preview.samples[0];
  if (!sample) return <StudioDefinitionPreview preview={preview} xray={xray} />;
  return (
    <div className="space-y-4">
      {preview.samples.length > 1 ? (
        <select
          aria-label="Author sample"
          value={sample.id}
          onChange={(event) => setSampleId(event.target.value)}
          className="max-w-full rounded border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-2 text-xs"
        >
          {preview.samples.map((item) => (
            <option key={item.id} value={item.id}>
              {item.source?.canonicalName} · {item.source?.version}
            </option>
          ))}
        </select>
      ) : null}
      <SampleEditor
        key={sample.id}
        projectId={projectId}
        candidateIds={candidateIds}
        preview={preview}
        sample={sample}
        xray={xray}
        title={title}
      />
    </div>
  );
}
function SampleEditor({
  projectId,
  candidateIds,
  preview,
  sample,
  xray,
  title,
}: {
  projectId: string;
  candidateIds: string[];
  preview: StudioPreview;
  sample: StudioSample;
  xray: boolean;
  title?: string;
}) {
  const checkSample = useValidateStudioSample(projectId);
  const original = JSON.stringify(sample.value ?? {}, null, 2);
  const [text, setText] = useState(original);
  const [editing, setEditing] = useState(false);
  const [checked, setChecked] = useState<StudioSample | null>(sample);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const epoch = useRef(0);
  useEffect(
    () => () => {
      ++epoch.current;
    },
    []
  );
  let value: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      value = parsed as Record<string, unknown>;
  } catch {
    /* Show parsing feedback without retaining an old render. */
  }
  const modified = text !== original;
  function edit(next: string) {
    ++epoch.current;
    setText(next);
    setChecked(null);
    setPending(false);
    setError(undefined);
  }
  async function validate() {
    if (!value) return;
    const current = ++epoch.current;
    setPending(true);
    setChecked(null);
    setError(undefined);
    try {
      const result = await checkSample({ candidateIds, sample: value });
      if (epoch.current !== current) return;
      if (
        result.selectionHash !== preview.selectionHash ||
        result.schemaHash !== preview.schemaHash
      )
        throw new Error('The selected definition changed. Resolve the selection again.');
      setChecked(result.localSample);
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Sample validation failed.');
    } finally {
      if (epoch.current === current) setPending(false);
    }
  }
  return (
    <section aria-label="Sample preview" className="space-y-4">
      <header>
        <h3 className="text-2xl font-semibold tracking-tight">{title || 'Sample preview'}</h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {modified ? 'Local draft' : 'Author sample'} · {sample.source?.canonicalName} ·{' '}
          {sample.source?.version}
        </p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--stroke-divider)] bg-[var(--status-info-muted)] px-3 py-2">
        <output className="flex items-center gap-2 text-xs" aria-label="Sample validation">
          {checked?.ready ? <CheckCircle2 className="size-4 text-[var(--status-success)]" /> : null}
          <span>
            {pending
              ? 'Checking sample…'
              : checked
                ? checked.ready
                  ? 'Matches selected definition'
                  : 'Needs attention'
                : 'Not checked · sample changed'}
          </span>
        </output>
        <span className="font-mono text-[10px] text-[var(--status-info)]">T3X · no execution</span>
      </div>
      {checked?.issues.length ? (
        <ul
          aria-label="Sample issues"
          className="space-y-2 border-l-2 border-[var(--status-warning)] pl-3"
        >
          {checked.issues.map((issue, index) => (
            <li key={`${issue.code}:${issue.path}:${index}`} className="text-xs">
              <span className="font-mono text-[var(--status-warning)]">{issue.path}</span>
              <p className="mt-1 text-[var(--text-secondary)]">{issue.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--status-error)]">
          {error}
        </p>
      ) : null}
      {editing ? (
        <div>
          <label htmlFor="studio-sample-json" className="text-xs font-medium">
            Sample JSON
          </label>
          <textarea
            id="studio-sample-json"
            spellCheck={false}
            value={text}
            onChange={(event) => edit(event.target.value)}
            className="mt-2 min-h-72 w-full resize-y rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 font-mono text-xs leading-6"
          />
        </div>
      ) : null}
      {value ? (
        <div className="rounded-md border border-[var(--stroke-divider)] px-4 py-2">
          <SampleReading value={value} schema={preview.schema} />
        </div>
      ) : (
        <p role="alert" className="text-sm text-[var(--status-error)]">
          Enter a JSON object to render the sample.
        </p>
      )}
      <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--stroke-divider)] pt-3">
        <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
          <Code2 className="size-3.5" /> {editing ? 'Hide editor' : 'Edit sample'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!value || pending}
          onClick={() => void validate()}
        >
          Validate sample
        </Button>
        {modified ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              edit(original);
              setChecked(sample);
            }}
          >
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        ) : null}
        <span className="text-xs text-[var(--text-tertiary)]">
          Preview only · applying a definition does not copy this data
        </span>
      </footer>
      {xray ? (
        <details className="text-xs text-[var(--text-secondary)]">
          <summary className="cursor-pointer">Source & selected definition</summary>
          <div className="mt-2 break-all font-mono leading-6">
            Source: {sample.source?.hash}
            <br />
            Definition: {preview.schemaHash}
          </div>
        </details>
      ) : null}
    </section>
  );
}

/** Only a declared repeated node becomes a named-row table. Preserve every actual field. */
function SampleReading({
  value,
  schema,
}: {
  value: Record<string, unknown>;
  schema: Record<string, unknown>;
}) {
  const nodes = schema.nodes as Record<string, { repeated?: boolean }> | undefined;
  const entries = Object.entries(value).sort(
    ([a], [b]) => Number(Boolean(nodes?.[a]?.repeated)) - Number(Boolean(nodes?.[b]?.repeated))
  );
  return (
    <div className="divide-y divide-[var(--stroke-divider)]">
      {entries.map(([path, content]) => {
        const rows =
          content && typeof content === 'object' && !Array.isArray(content)
            ? Object.entries(content)
            : [];
        const flat =
          rows.length > 0 &&
          rows.every(
            ([, row]) =>
              row &&
              typeof row === 'object' &&
              !Array.isArray(row) &&
              Object.values(row).every(
                (cell) =>
                  cell === null ||
                  typeof cell !== 'object' ||
                  (Array.isArray(cell) &&
                    cell.every((value) => value === null || typeof value !== 'object'))
              )
          );
        const columns = flat
          ? [...new Set(rows.flatMap(([, row]) => Object.keys(row as object)))]
          : [];
        return (
          <section key={path} className="py-4">
            <h4 className="mb-3 text-sm font-semibold">{path}</h4>
            {nodes?.[path]?.repeated && flat && columns.length <= 8 ? (
              <div className="overflow-x-auto rounded border border-[var(--stroke-divider)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface-panel)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Node</th>
                      {columns.map((column) => (
                        <th className="px-3 py-2 font-medium" key={column}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([name, row]) => (
                      <tr className="border-t border-[var(--stroke-divider)]" key={name}>
                        <th className="px-3 py-3 font-mono font-normal align-top">{name}</th>
                        {columns.map((column) => (
                          <td key={column} className="px-3 py-3 align-top">
                            {Object.hasOwn(row as object, column) ? (
                              <StateValueReader value={(row as Record<string, unknown>)[column]} />
                            ) : (
                              <span title="Absent">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <StateValueReader value={content} />
            )}
          </section>
        );
      })}
    </div>
  );
}
