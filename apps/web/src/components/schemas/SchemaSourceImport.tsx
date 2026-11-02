'use client';

import type { AddStudioCandidate, SchemaCatalogItem, StudioCandidate } from '@t3x-dev/api-client';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSchemaCatalog } from '@/hooks/schemas/useSchemaCatalog';
import s from './SchemaSourceManager.module.css';

export function SchemaSourceImport({
  projectId,
  candidates,
  onImport,
  onBack,
  onBusyChange,
}: {
  projectId: string;
  candidates: StudioCandidate[];
  onImport: (source: AddStudioCandidate) => Promise<StudioCandidate | undefined>;
  onBack: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SchemaCatalogItem>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const catalog = useSchemaCatalog(
    projectId,
    new URLSearchParams({ limit: '24', ...(query ? { q: query } : {}) }).toString()
  );
  const existing = (item: SchemaCatalogItem) =>
    candidates.some(
      (candidate) =>
        candidate.source?.projectId === item.identity.ownerProjectId &&
        candidate.source?.canonicalName === item.identity.canonicalName &&
        candidate.source?.version === item.release.version &&
        candidate.source?.hash === item.release.hash
    );
  async function save() {
    if (!selected || existing(selected) || saving.current) return;
    saving.current = true;
    setPending(true);
    onBusyChange(true);
    setError(undefined);
    try {
      const candidate = await onImport({
        ...(selected.identity.ownerProjectId
          ? { sourceProjectId: selected.identity.ownerProjectId }
          : {}),
        canonicalName: selected.identity.canonicalName,
        version: selected.release.version,
        expectedHash: selected.release.hash,
      });
      if (!candidate) throw new Error('Source import did not complete. Please try again.');
      onBack();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import this source.');
    } finally {
      saving.current = false;
      setPending(false);
      onBusyChange(false);
    }
  }
  return (
    <>
      <form
        className={s.toolbar}
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
          setSelected(undefined);
          setError(undefined);
        }}
      >
        <Input
          aria-label="Search schema catalog"
          placeholder="Find schemas or modules…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={pending}
        />
        <Button type="submit" variant="canvas-outline" size="sm" disabled={pending}>
          Search
        </Button>
      </form>
      <div className={s.scroll}>
        <h3 className="pt-4 text-sm font-medium">Import schema</h3>
        <p className={s.feedback}>Choose a published version to add to this project’s sources.</p>
        {catalog.loading ? <output className={s.feedback}>Loading schema catalog…</output> : null}
        {catalog.error ? (
          <p role="alert" className={`${s.feedback} ${s.error}`}>
            {catalog.error}{' '}
            <Button variant="ghost" size="sm" onClick={catalog.retry} disabled={pending}>
              Retry
            </Button>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className={`${s.feedback} ${s.error}`}>
            {error}
          </p>
        ) : null}
        {(catalog.data?.items ?? []).map((item, index) => {
          const title = item.identity.displayName ?? item.identity.canonicalName;
          const added = existing(item);
          const inputId = `${id}-${index}`;
          return (
            <div key={item.release.artifactVersionId} className={s.row}>
              <input
                id={inputId}
                type="radio"
                name={`${id}-release`}
                aria-label={`Import ${title} @ ${item.release.version}`}
                checked={selected?.release.artifactVersionId === item.release.artifactVersionId}
                disabled={pending || added}
                onChange={() => {
                  setSelected(item);
                  setError(undefined);
                }}
              />
              <div className={s.identity}>
                <label htmlFor={inputId}>{title}</label>
                <p className={s.meta}>
                  {item.identity.canonicalName} · {item.release.version} · {item.release.kind}
                </p>
                {item.identity.description ? (
                  <p className={s.meta}>{item.identity.description}</p>
                ) : null}
                {added ? <p className={s.meta}>Already in sources</p> : null}
                <details className={s.meta}>
                  <summary>Source hash</summary>
                  <code>{item.release.hash}</code>
                </details>
              </div>
            </div>
          );
        })}
        {!catalog.loading && !catalog.error && !catalog.data?.items.length ? (
          <p className={s.feedback}>No published schemas match this search.</p>
        ) : null}
        {catalog.data?.has_more ? (
          <Button
            className="my-3"
            variant="canvas-outline"
            size="sm"
            disabled={catalog.morePending || pending}
            onClick={() => void catalog.loadMore()}
          >
            {catalog.morePending ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </div>
      <footer className={s.footer}>
        <Button variant="ghost" size="sm" disabled={pending} onClick={onBack}>
          Back
        </Button>
        <Button
          variant="commit"
          size="sm"
          disabled={
            pending || !selected || existing(selected) || catalog.loading || !!catalog.error
          }
          onClick={() => void save()}
        >
          {pending ? 'Importing…' : 'Import source'}
        </Button>
      </footer>
    </>
  );
}
