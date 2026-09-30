'use client';
import type { SchemaCatalogItem } from '@t3x-dev/api-client';
import { type ReactNode, useState } from 'react';
import type { useSchemaCatalog, useSchemaCollections } from '@/hooks/schemas/useSchemaCatalog';
import { CatalogLogo } from './CatalogLogo';
import { ReferenceIcon as Icon } from './DiscoverReference';
import shared from './ExploreDiscoverySurface.module.css';
import s from './SchemaCatalogBrowse.module.css';

export function SchemaBrowse({
  catalog,
  collections,
  items,
  navigate,
  onOpen,
  params,
}: {
  catalog: ReturnType<typeof useSchemaCatalog>;
  collections: ReturnType<typeof useSchemaCollections>;
  items: SchemaCatalogItem[];
  navigate: (
    view: 'discover' | 'browse' | 'studio' | 'active' | 'release',
    updates?: Record<string, string | undefined>
  ) => void;
  onOpen: (item: SchemaCatalogItem) => void;
  params: URLSearchParams;
}) {
  const [publisher, setPublisher] = useState<string>();
  const [usable, setUsable] = useState(true);
  const [compatible, setCompatible] = useState(true);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState('relevant');
  const [showPublishers, setShowPublishers] = useState(false);
  const publishers = [...new Set(items.map((item) => item.identity.publisher))];
  const visibleItems = items.filter((item) => !publisher || item.identity.publisher === publisher);
  if (sort === 'name')
    visibleItems.sort((a, b) =>
      (a.identity.displayName ?? a.identity.canonicalName).localeCompare(
        b.identity.displayName ?? b.identity.canonicalName
      )
    );
  if (sort === 'recent')
    visibleItems.sort((a, b) =>
      (b.release.publishedAt ?? '').localeCompare(a.release.publishedAt ?? '')
    );
  function reset() {
    setPublisher(undefined);
    setCompatible(false);
    setUsable(false);
    navigate('browse', {
      tags: undefined,
      collection: undefined,
      publisher: undefined,
      ecosystem: undefined,
      family: undefined,
      kind: undefined,
      format: undefined,
      capability: undefined,
    });
  }
  const activeCollection = params.get('collection');
  return (
    <div className={`${shared.surface} ${s.page}`}>
      <div className={s.layout}>
        <aside className={s.fl} aria-label="Catalog filters">
          <div className={s['fl-h']}>
            <b>Filters</b>
            <button onClick={reset}>Reset</button>
          </div>
          <div className={s.grp}>
            <div className={s.gt}>STATUS</div>
            <div className={s.seg3}>
              <button className={usable ? s.on : undefined} onClick={() => setUsable(!usable)}>
                Usable
              </button>
              <button disabled title="The catalog only exposes published releases">
                Draft
              </button>
              <button disabled title="The catalog only exposes published releases">
                Deprecated
              </button>
            </div>
          </div>
          <Filter title="Publisher">
            {(showPublishers ? publishers : publishers.slice(0, 4)).map((name) => (
              <button
                key={name}
                className={`${s.opt} ${publisher === name ? s.on : ''}`}
                aria-pressed={publisher === name}
                onClick={() => setPublisher(publisher === name ? undefined : name)}
              >
                <span className={s.pub}>{name.slice(0, 1).toUpperCase()}</span>
                {name}
                <span className={s.cn}>
                  {items.filter((item) => item.identity.publisher === name).length}
                </span>
              </button>
            ))}
            {publishers.length > 4 ? (
              <button className={s.more} onClick={() => setShowPublishers(!showPublishers)}>
                {showPublishers ? 'Show less' : `Show ${publishers.length - 4} more`}
                <Icon name="down" size={11} />
              </button>
            ) : null}
          </Filter>
          <Filter title="Category">
            {collections.map((collection) => (
              <Check
                key={collection.id}
                checked={activeCollection === collection.id}
                label={collection.title}
                count={
                  items.filter((item) =>
                    item.identity.tags.some((tag) => collection.tags.includes(tag))
                  ).length
                }
                onChange={() =>
                  navigate('browse', {
                    collection: activeCollection === collection.id ? undefined : collection.id,
                  })
                }
              />
            ))}
          </Filter>
          <Filter title="Compatible with">
            <Check
              checked={compatible}
              label="YSchema"
              count={items.length}
              onChange={() => setCompatible(!compatible)}
            />
          </Filter>
        </aside>
        <section className={s.results} aria-label="Schema results">
          <div className={s.rb}>
            <h1>Browse schemas</h1>
            <span className={s.cnt}>{visibleItems.length} results</span>
            {usable ? (
              <button className={s.chip} onClick={() => setUsable(false)}>
                Usable
                <Icon name="x" size={12} />
              </button>
            ) : null}
            {compatible ? (
              <button className={s.chip} onClick={() => setCompatible(false)}>
                YSchema
                <Icon name="x" size={12} />
              </button>
            ) : null}
            {params.get('tags') ? (
              <button className={s.chip} onClick={() => navigate('browse', { tags: undefined })}>
                {params.get('tags')}
                <Icon name="x" size={12} />
              </button>
            ) : null}
            {activeCollection ? (
              <button
                className={s.chip}
                onClick={() => navigate('browse', { collection: undefined })}
              >
                {collections.find((c) => c.id === activeCollection)?.title ?? activeCollection}
                <Icon name="x" size={12} />
              </button>
            ) : null}
            <button className={s.clr} onClick={reset}>
              Clear all
            </button>
            <div className={shared.grow} />
            <select
              aria-label="Sort schemas"
              className={s.dd}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="relevant">Most relevant</option>
              <option value="recent">Recently updated</option>
              <option value="name">Name</option>
            </select>
            <div className={s.vt}>
              {(['grid', 'list'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-label={`${view === 'grid' ? 'Grid' : 'List'} view`}
                  aria-pressed={layout === view}
                  className={layout === view ? s.on : undefined}
                  onClick={() => setLayout(view)}
                >
                  <Icon name={view} size={15} />
                </button>
              ))}
            </div>
          </div>
          catalog.loading ? <output className={s.feedback}>Loading schemas…</output> :
          nullcatalog.error ? (
          <div className={s.feedback} role="alert">
            {catalog.error}
            <button onClick={catalog.retry}>Retry</button>
          </div>
          ) : null!catalog.loading && !catalog.error && !visibleItems.length ? (
          <div className={s.feedback}>No schemas match these filters.</div>) : null
          <div className={`${s.grid} ${layout === 'list' ? s.listView : ''}`}>
            {visibleItems.map((item) => (
              <SchemaCard
                key={item.release.artifactVersionId}
                item={item}
                onOpen={() => onOpen(item)}
              />
            ))}
          </div>
          catalog.data?.has_more ? (
          <button className={s.loadMore} disabled={catalog.morePending} onClick={catalog.loadMore}>
            {catalog.morePending ? 'Loading…' : 'Load more'}
          </button>
          ) : null
        </section>
      </div>
    </div>
  );
}
function Filter({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className={s.grp} open>
      <summary className={s.gt}>
        {title}
        <Icon name="down" size={12} />
      </summary>
      {children}
    </details>
  );
}
function Check({
  checked,
  label,
  count,
  onChange,
}: {
  checked: boolean;
  label: string;
  count: number;
  onChange: () => void;
}) {
  return (
    <label className={`${s.opt} ${checked ? s.on : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className={s.mk}>{checked ? <Icon name="check" size={11} weight={3} /> : null}</span>
      {label}
      <span className={s.cn}>{count}</span>
    </label>
  );
}
function SchemaCard({ item, onOpen }: { item: SchemaCatalogItem; onOpen: () => void }) {
  const name = item.identity.displayName || item.identity.canonicalName;
  const tags = item.identity.tags.filter((tag) => !tag.startsWith('ecosystem:')).slice(0, 3);
  return (
    <button
      type="button"
      className={s.sc}
      aria-label={`Explore ${name} ${item.release.version}`}
      onClick={onOpen}
    >
      <span className={s.top}>
        <span className={s.logo}>
          <CatalogLogo item={item} />
        </span>
        <span className={s.identity}>
          <span className={s.nm}>{name}</span>
          <span className={s.by}>
            <span className={s.pub}>{item.identity.publisher.slice(0, 1).toUpperCase()}</span>
            {item.identity.publisher}
          </span>
        </span>
        <span className={s.ver}>{item.release.version}</span>
      </span>
      <span className={s.ds}>{item.identity.description || 'Structured schema definition.'}</span>
      <span className={s.tg}>
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </span>
      <span className={s.ft}>
        <span className={s.mt}>
          <Icon name="braces" size={12} />
          {item.definition.pathCount} paths
        </span>
        <span className={s.use}>
          <Icon name="arrowr" size={12} />
          Explore
        </span>
      </span>
    </button>
  );
}
