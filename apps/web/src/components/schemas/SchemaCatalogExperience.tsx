'use client';
import type { SchemaCatalogItem } from '@t3x-dev/api-client';
import { ArrowRight, BookOpen, Check, ChevronDown, Code2, Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useSchemaCatalog, useSchemaCollections } from '@/hooks/schemas/useSchemaCatalog';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { cn } from '@/utils/cn';
import { ActiveSchemaBindings } from './ActiveSchemaBindings';
import { CatalogLogo } from './CatalogLogo';
import { ExploreDiscoverySurface } from './ExploreDiscoverySurface';
import browseStyles from './SchemaCatalogBrowse.module.css';
import { SchemaReleasePage } from './SchemaReleasePage';
import { SchemaStudioExperience } from './SchemaStudioExperience';

const filterKeys = [
  'q',
  'tags',
  'ecosystem',
  'publisher',
  'family',
  'kind',
  'format',
  'capability',
  'collection',
] as const;
type View = 'discover' | 'browse' | 'studio' | 'active' | 'release';
const releaseKeys = ['catalogName', 'catalogVersion', 'catalogHash'] as const;
export function SchemaCatalogExperience({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const params = new URLSearchParams(search?.toString() ?? '');
  const requestedView = params.get('schemaView');
  const workspaces = useProjectWorkspaces(projectId);
  const view: View =
    requestedView === 'browse' ||
    requestedView === 'studio' ||
    requestedView === 'discover' ||
    requestedView === 'active' ||
    requestedView === 'release'
      ? requestedView
      : params.get('mode') === 'compose'
        ? 'studio'
        : 'discover';
  const filters = new URLSearchParams();
  if (view === 'browse')
    for (const key of filterKeys) {
      const value = params.get(key);
      if (value) filters.set(key, value);
    }
  if (view === 'release') {
    const canonicalName = params.get('catalogName');
    if (canonicalName) filters.set('canonical_name', canonicalName);
  }
  filters.set('limit', '24');
  const catalog = useSchemaCatalog(
    projectId,
    filters.toString(),
    view === 'browse' || view === 'release'
  );
  const collections = useSchemaCollections();
  function navigate(nextView: View, updates: Record<string, string | undefined> = {}) {
    const next = new URLSearchParams(search?.toString() ?? '');
    next.set('schemaView', nextView);
    for (const key of ['mode', 'module', 'version', ...releaseKeys]) next.delete(key);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }
  function searchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate('browse', { q: String(new FormData(event.currentTarget).get('q') ?? '').trim() });
  }
  function openRelease(item: SchemaCatalogItem) {
    navigate('release', {
      catalogName: item.identity.canonicalName,
      catalogVersion: item.release.version,
      catalogHash: item.release.hash,
    });
  }
  const items = catalog.data?.items ?? [];
  const selectedRelease = items.find(
    (item) =>
      item.identity.canonicalName === params.get('catalogName') &&
      item.release.version === params.get('catalogVersion') &&
      (!params.get('catalogHash') || item.release.hash === params.get('catalogHash'))
  );
  const visibleView = view === 'active' || view === 'release' ? 'browse' : view;
  const viewNavigation = (
    <nav aria-label="Schema views" className="flex h-[45px] shrink-0 items-center px-2">
      <SegmentedControl
        ariaLabel="Schema views"
        className="h-[34px]"
        itemClassName="min-w-[96px] px-4 text-[14px]"
        items={[
          { icon: Search, label: 'Discover', value: 'discover' },
          { icon: BookOpen, label: 'Browse', value: 'browse' },
          { icon: Code2, label: 'Studio', value: 'studio' },
        ]}
        onValueChange={(nextView) => navigate(nextView)}
        value={visibleView}
      />
    </nav>
  );
  return (
    <section
      className={cn(
        'min-w-0 bg-white text-[var(--text-primary)]',
        (view === 'browse' || view === 'studio' || view === 'release') &&
          'flex h-full min-h-0 flex-col overflow-hidden'
      )}
      aria-label="Schema experience"
    >
      {view === 'release' ? null : (
        <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-white">
          {viewNavigation}
        </div>
      )}
      {view === 'release' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SchemaReleasePage
            error={catalog.error}
            item={selectedRelease}
            loading={catalog.loading}
            onBack={() =>
              navigate('browse', {
                catalogName: undefined,
                catalogVersion: undefined,
                catalogHash: undefined,
              })
            }
            projectId={projectId}
            returnTo={`${pathname}?${params.toString()}`}
          />
        </div>
      ) : String(view) === 'browse' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SchemaBrowse
            catalog={catalog}
            collections={collections}
            items={items}
            navigate={navigate}
            onOpen={openRelease}
            params={params}
            searchSubmit={searchSubmit}
          />
        </div>
      ) : view === 'active' ? (
        <ActiveSchemaBindings
          projectId={projectId}
          workspaces={workspaces.workspaces}
          refresh={workspaces.refresh}
          error={workspaces.error}
        />
      ) : view === 'studio' ? (
        <SchemaStudioExperience key={projectId} projectId={projectId}>
          {children}
        </SchemaStudioExperience>
      ) : (
        <ExploreDiscoverySurface
          onBrowse={() => navigate('browse')}
          onSearch={(query) => navigate('browse', { q: query || undefined })}
        />
      )}
    </section>
  );
}

function SchemaBrowse({
  catalog,
  collections,
  items,
  navigate,
  onOpen,
  params,
  searchSubmit,
}: {
  catalog: ReturnType<typeof useSchemaCatalog>;
  collections: ReturnType<typeof useSchemaCollections>;
  items: SchemaCatalogItem[];
  navigate: (view: View, updates?: Record<string, string | undefined>) => void;
  onOpen: (item: SchemaCatalogItem) => void;
  params: URLSearchParams;
  searchSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [publisherScope, setPublisherScope] = useState<string>();
  const [compatible, setCompatible] = useState(true);
  const [usable, setUsable] = useState(true);
  const visibleItems = publisherScope
    ? items.filter((item) =>
        publisherScope === 'team'
          ? ['team', 'private'].includes(item.identity.visibility)
          : item.identity.visibility === publisherScope
      )
    : items;
  const officialCount = items.filter((item) => item.identity.visibility === 'official').length;
  const teamCount = items.filter((item) =>
    ['team', 'private'].includes(item.identity.visibility)
  ).length;
  const communityCount = items.filter((item) => item.identity.visibility === 'community').length;
  const categoryCounts = new Map(
    collections.map((collection) => [
      collection.id,
      items.filter((item) => item.identity.tags.some((tag) => collection.tags.includes(tag)))
        .length,
    ])
  );
  const activeCollection = params.get('collection');
  const activeTags = params.get('tags');

  return (
    <div className={browseStyles.root}>
      <header className={browseStyles.searchHeader}>
        <form aria-label="Search schema catalog" onSubmit={searchSubmit}>
          <Search aria-hidden="true" />
          <input
            key={params.get('q') ?? ''}
            aria-label="Search definitions"
            defaultValue={params.get('q') ?? ''}
            name="q"
            placeholder="Search projects and schemas..."
          />
        </form>
        <div aria-label="Catalog type" className={browseStyles.typeTabs} role="tablist">
          <button onClick={() => navigate('discover')} role="tab" type="button">
            All
          </button>
          <button onClick={() => navigate('active')} role="tab" type="button">
            Projects
          </button>
          <button
            aria-selected="true"
            className={browseStyles.typeTabActive}
            role="tab"
            type="button"
          >
            Schemas
          </button>
        </div>
      </header>

      <div className={browseStyles.body}>
        <aside aria-label="Catalog filters" className={browseStyles.sidebar}>
          <div className={browseStyles.resultCount}>
            <strong>Search results</strong>
            <span>{visibleItems.length}</span>
          </div>
          <BrowseFilterSection title="Publisher">
            <BrowseCheck
              checked={publisherScope === 'official'}
              count={officialCount}
              label="Official"
              onChange={() =>
                setPublisherScope((value) => (value === 'official' ? undefined : 'official'))
              }
            />
            <BrowseCheck
              checked={publisherScope === 'team'}
              count={teamCount}
              label="Verified teams"
              onChange={() => setPublisherScope((value) => (value === 'team' ? undefined : 'team'))}
            />
            <BrowseCheck
              checked={publisherScope === 'community'}
              count={communityCount}
              label="Community"
              onChange={() =>
                setPublisherScope((value) => (value === 'community' ? undefined : 'community'))
              }
            />
          </BrowseFilterSection>
          <BrowseFilterSection title="Category">
            {collections.slice(0, 5).map((collection) => (
              <BrowseCheck
                checked={activeCollection === collection.id}
                count={categoryCounts.get(collection.id) ?? 0}
                key={collection.id}
                label={collection.title}
                onChange={() =>
                  navigate('browse', {
                    collection: activeCollection === collection.id ? undefined : collection.id,
                  })
                }
              />
            ))}
          </BrowseFilterSection>
          <BrowseFilterSection title="Compatible with">
            <BrowseCheck
              checked={compatible}
              count={items.length}
              label="YSchema"
              onChange={() => setCompatible((value) => !value)}
            />
          </BrowseFilterSection>
          <BrowseFilterSection title="Status">
            <BrowseCheck
              checked={usable}
              count={items.length}
              label="Usable"
              onChange={() => setUsable((value) => !value)}
            />
            <BrowseCheck checked={false} count={0} label="Draft" onChange={() => undefined} />
            <BrowseCheck checked={false} count={0} label="Deprecated" onChange={() => undefined} />
          </BrowseFilterSection>
        </aside>

        <main className={browseStyles.main}>
          <div className={browseStyles.headingRow}>
            <h1>Browse schemas</h1>
            <div className={browseStyles.sortControls}>
              <span>{visibleItems.length} schemas</span>
              <i aria-hidden="true" />
              <button type="button">
                Sort: Most relevant <ChevronDown aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className={browseStyles.chips}>
            {usable ? (
              <button onClick={() => setUsable(false)} type="button">
                Usable schemas <X aria-hidden="true" />
              </button>
            ) : null}
            {compatible ? (
              <button onClick={() => setCompatible(false)} type="button">
                YSchema <X aria-hidden="true" />
              </button>
            ) : null}
            {activeTags ? (
              <button onClick={() => navigate('browse', { tags: undefined })} type="button">
                {activeTags} <X aria-hidden="true" />
              </button>
            ) : null}
            {activeCollection ? (
              <button onClick={() => navigate('browse', { collection: undefined })} type="button">
                {collections.find((item) => item.id === activeCollection)?.title ??
                  activeCollection}
                <X aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {catalog.loading ? (
            <output className={browseStyles.feedback}>Loading schemas…</output>
          ) : null}
          {catalog.error ? (
            <div className={browseStyles.feedback} role="alert">
              <span>{catalog.error}</span>
              <button onClick={catalog.retry} type="button">
                Retry
              </button>
            </div>
          ) : null}
          {!catalog.loading && !catalog.error && visibleItems.length === 0 ? (
            <div className={browseStyles.feedback}>No schemas match these filters.</div>
          ) : null}
          <div className={browseStyles.cardGrid}>
            {visibleItems.map((item) => (
              <BrowseSchemaCard
                item={item}
                key={item.release.artifactVersionId}
                onOpen={() => onOpen(item)}
              />
            ))}
          </div>
          {catalog.data?.has_more ? (
            <button
              className={browseStyles.loadMore}
              disabled={catalog.morePending}
              onClick={catalog.loadMore}
              type="button"
            >
              {catalog.morePending ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function BrowseFilterSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <details className={browseStyles.filterSection} open>
      <summary>
        <strong>{title}</strong>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div>{children}</div>
    </details>
  );
}

function BrowseCheck({
  checked,
  count,
  label,
  onChange,
}: {
  checked: boolean;
  count: number;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className={browseStyles.filterOption}>
      <span>
        <input checked={checked} onChange={onChange} type="checkbox" />
        <i aria-hidden="true">{checked ? <Check /> : null}</i>
        <b>{label}</b>
      </span>
      <em>{count}</em>
    </label>
  );
}

function BrowseSchemaCard({ item, onOpen }: { item: SchemaCatalogItem; onOpen: () => void }) {
  const name = item.identity.displayName || item.identity.canonicalName;
  const tags = item.identity.tags.filter((tag) => !tag.startsWith('ecosystem:')).slice(0, 3);
  return (
    <button
      aria-label={`Explore ${name} ${item.release.version}`}
      className={browseStyles.schemaCard}
      onClick={onOpen}
      type="button"
    >
      <span className={browseStyles.cardTop}>
        <CatalogLogo item={item} size="large" />
        <span className={browseStyles.cardIdentity}>
          <strong>{name}</strong>
          <small>{item.identity.description || 'Structured schema definition.'}</small>
        </span>
        <span className={browseStyles.cardMeta}>
          <b>{item.release.version}</b>
          <span className={browseStyles.publisher}>
            <i>{item.identity.publisher.slice(0, 1).toUpperCase()}</i>
            {item.identity.publisher}
          </span>
          <ArrowRight aria-hidden="true" />
        </span>
      </span>
      <span className={browseStyles.cardLower}>
        <span className={browseStyles.tagLine}>
          <SchemaRelationIcon />
          <span>
            {(tags.length ? tags : [item.release.kind]).map((tag, index) => (
              <span key={tag}>
                {index ? <i aria-hidden="true" /> : null}
                <b>{tag}</b>
              </span>
            ))}
          </span>
        </span>
      </span>
    </button>
  );
}

function SchemaRelationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M12 7 7 16M12 7l5 9"
        fill="none"
        stroke="#cbd5e1"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="7" fill="#2563eb" r="3" />
      <circle cx="7" cy="16" fill="#2563eb" r="3" />
      <circle cx="17" cy="16" fill="#2563eb" r="3" />
    </svg>
  );
}
