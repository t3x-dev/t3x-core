'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLegacyLeaf } from '@/hooks/leaves/useLegacyLeaf';

export function LegacyLeafReader({ projectId, leafId }: { projectId: string; leafId: string }) {
  const data = useLegacyLeaf(projectId, leafId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  if (data.error)
    return (
      <div role="alert" className="p-6">
        {data.error} <Button onClick={data.retry}>Retry</Button>
      </div>
    );
  if (!data.leaf) return <output className="p-6">Loading legacy Leaf…</output>;
  const leaf = data.leaf;
  const selected = selectedId ? data.history?.find((entry) => entry.id === selectedId) : leaf;
  const download = (format: 'json' | 'text') => {
    if (!selected) return;
    try {
      data.download(format, selected);
      setExportError(null);
    } catch (error) {
      setExportError(String(error));
    }
  };
  return (
    <section
      aria-label="Legacy Leaf archive"
      className="flex h-full min-h-0 flex-col bg-[var(--surface-panel)]"
    >
      <header className="flex flex-wrap items-center gap-3 border-b p-4">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          <h1 className="text-lg font-semibold">{leaf.title || 'Untitled Leaf'}</h1>
          <p className="text-xs text-[var(--text-secondary)]">Legacy Leaf · Read-only</p>
        </div>
        <Button variant="outline" onClick={() => download('text')} disabled={!selected}>
          Export text
        </Button>
        <Button variant="outline" onClick={() => download('json')} disabled={!selected}>
          Export record
        </Button>
      </header>
      <div className="flex flex-wrap gap-2 border-b px-4 py-2 text-xs">
        <Link
          className="text-[var(--accent-commit)] underline"
          href={`/project/${encodeURIComponent(projectId)}?view=overview&commit=${encodeURIComponent(leaf.commit_hash)}`}
        >
          View source State
        </Link>
        <span className="break-all font-mono">{leaf.commit_hash}</span>
      </div>
      {exportError ? (
        <p role="alert" className="p-3">
          {exportError}
        </p>
      ) : null}
      <div className="grid min-h-0 flex-1 content-start overflow-auto md:content-normal md:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="Leaf history and evidence" className="overflow-auto border-r p-4">
          <h2 className="mb-2 text-sm font-semibold">Saved output</h2>
          <Button
            variant="outline"
            className="w-full"
            aria-pressed={!selectedId}
            onClick={() => setSelectedId(null)}
          >
            Current saved output
          </Button>
          <h2 className="mb-2 mt-5 text-sm font-semibold">Generation history</h2>
          {data.historyError ? (
            <div role="alert" className="text-xs">
              History unavailable.{' '}
              <Button size="sm" onClick={data.retry}>
                Retry history
              </Button>
            </div>
          ) : !data.history ? (
            <output className="text-xs">Loading history…</output>
          ) : !data.history.length ? (
            <p className="text-xs">No generation history on this page.</p>
          ) : (
            data.history.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={selectedId === entry.id}
                onClick={() => setSelectedId(entry.id)}
                className="mt-2 w-full rounded border p-2 text-left text-xs hover:bg-[var(--hover-bg)]"
              >
                <span className="block">{entry.generated_at}</span>
                <span className="text-[var(--text-secondary)]">{entry.model}</span>
              </button>
            ))
          )}
          <div className="mt-3 flex items-center gap-2 text-xs">
            <Button
              size="sm"
              variant="outline"
              disabled={!data.page}
              onClick={() => {
                setSelectedId(null);
                data.setPage(data.page - 1);
              }}
            >
              Previous
            </Button>
            <span>{data.page + 1}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={data.history?.length !== 100}
              onClick={() => {
                setSelectedId(null);
                data.setPage(data.page + 1);
              }}
            >
              Next
            </Button>
          </div>
          <details className="mt-5 text-xs">
            <summary className="cursor-pointer font-semibold">Current saved evidence</summary>
            <p className="my-2">
              These records belong to the current saved Leaf, not necessarily the selected
              generation.
            </p>
            <pre className="overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(
                {
                  constraints: leaf.constraints,
                  assertions: leaf.assertions,
                  runner_assertions: leaf.runner_assertions,
                },
                null,
                2
              )}
            </pre>
          </details>
        </aside>
        <main className="min-w-0 overflow-auto p-5">
          <h2 className="mb-3 text-sm font-semibold">
            {selectedId ? 'Historical generation' : 'Current saved output'}
          </h2>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
            {selected
              ? (selected.output ?? 'No saved output.')
              : 'Selected history entry is unavailable.'}
          </pre>
        </main>
      </div>
    </section>
  );
}
