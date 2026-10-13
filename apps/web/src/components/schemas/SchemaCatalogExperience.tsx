'use client';
import type { SchemaCatalogItem } from '@t3x-dev/api-client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useSchemaCatalog, useSchemaCollections } from '@/hooks/schemas/useSchemaCatalog';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { cn } from '@/utils/cn';
import { ActiveSchemaBindings } from './ActiveSchemaBindings';
import { ReferenceIcon } from './DiscoverReference';
import { ExploreDiscoverySurface } from './ExploreDiscoverySurface';
import shared from './ExploreDiscoverySurface.module.css';
import { SchemaBrowse } from './SchemaBrowse';
import headerStyles from './SchemaCatalogHeader.module.css';
import { SchemaReleasePage } from './SchemaReleasePage';
import { SchemaStudioExperience } from './SchemaStudioExperience';
import { SchemaToolbarContext } from './SchemaToolbarSlot';
import { SchemaViewNavigation } from './SchemaViewNavigation';

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
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const routeQuery = params.get('q') ?? '';
  useEffect(() => setQuery(routeQuery), [routeQuery]);
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
  filters.set('limit', '48');
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
  const viewNavigation = <SchemaViewNavigation value={visibleView} onChange={navigate} />;
  return (
    <SchemaToolbarContext.Provider value={toolbarTarget}>
      <section
        className={cn(
          `${shared.surface} min-w-0 bg-white text-[var(--text-primary)]`,
          (view === 'browse' || view === 'studio' || view === 'release') &&
            'flex h-full min-h-0 flex-col overflow-hidden'
        )}
        aria-label="Schema experience"
      >
        <header className={headerStyles.header}>
          {viewNavigation}
          <form
            className={headerStyles.search}
            hidden={view === 'studio'}
            onSubmit={searchSubmit}
            aria-label="Search schema catalog"
          >
            <ReferenceIcon name="search" size={15} />
            <input
              name="q"
              type="search"
              aria-label="Search definitions"
              placeholder="Search projects and schemas…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>/</kbd>
          </form>
          <div
            className={headerStyles.scope}
            hidden={view === 'studio'}
            role="tablist"
            aria-label="Catalog type"
          >
            <button role="tab" aria-selected={false} onClick={() => navigate('discover')}>
              All
            </button>
            <button role="tab" aria-selected={view === 'active'} onClick={() => navigate('active')}>
              Projects
            </button>
            <button role="tab" aria-selected={view !== 'active'} onClick={() => navigate('browse')}>
              Schemas
            </button>
          </div>
          <div className={headerStyles.slot} hidden={view !== 'studio'} ref={setToolbarTarget} />
        </header>
        {view === 'release' ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            {!selectedRelease && !catalog.loading && !catalog.error && catalog.data?.has_more ? (
              <button
                disabled={catalog.morePending}
                onClick={() => void catalog.loadMore()}
                type="button"
              >
                {catalog.morePending ? 'Loading more releases…' : 'Search more releases'}
              </button>
            ) : null}
            <SchemaReleasePage
              error={catalog.error}
              item={selectedRelease}
              loading={catalog.loading || (!selectedRelease && !!catalog.data?.has_more)}
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
          <SchemaStudioExperience key={projectId} projectId={projectId} navigation={null}>
            {children}
          </SchemaStudioExperience>
        ) : (
          <ExploreDiscoverySurface
            hideNavigation
            onBrowse={() => navigate('browse')}
            onStudio={() => navigate('studio')}
            onImport={() => navigate('studio')}
            onSearch={(query) => navigate('browse', { q: query || undefined })}
          />
        )}
      </section>
    </SchemaToolbarContext.Provider>
  );
}
