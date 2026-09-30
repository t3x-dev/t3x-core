'use client';
import type { SchemaCatalogItem } from '@t3x-dev/api-client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSchemaCatalog, useSchemaCollections } from '@/hooks/schemas/useSchemaCatalog';
import { DiscoverHeader } from './DiscoverHeader';
import { ReferenceIcon } from './DiscoverReference';
import { ExploreDiscoverySurface } from './ExploreDiscoverySurface';
import shared from './ExploreDiscoverySurface.module.css';
import { SchemaBrowse } from './SchemaBrowse';
import headerStyles from './SchemaCatalogHeader.module.css';
import { SchemaStudioSurface } from './SchemaStudioSurface';
import { SchemaToolbarContext } from './SchemaToolbarSlot';
import { type SchemaView, SchemaViewNavigation } from './SchemaViewNavigation';

export function TemplatesCatalogExperience() {
  const router = useRouter();
  const search = useSearchParams();
  const params = new URLSearchParams(search.toString());
  const requested = params.get('schemaView');
  const view: SchemaView =
    requested === 'browse' || requested === 'studio' ? requested : 'discover';
  const query = new URLSearchParams({ limit: '48' });
  for (const key of [
    'q',
    'tags',
    'collection',
    'publisher',
    'ecosystem',
    'family',
    'kind',
    'format',
    'capability',
  ]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  const catalog = useSchemaCatalog(null, query.toString(), view === 'browse');
  const collections = useSchemaCollections();
  const [selected, setSelected] = useState<SchemaCatalogItem>();
  function navigate(next: string, updates: Record<string, string | undefined> = {}) {
    if (next === 'active') {
      router.push('/');
      return;
    }
    const nextParams = new URLSearchParams(params);
    nextParams.set('schemaView', next);
    for (const [key, value] of Object.entries(updates)) {
      if (value) nextParams.set(key, value);
      else nextParams.delete(key);
    }
    router.push(`/templates?${nextParams}`, { scroll: false });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate('browse', {
      q: String(new FormData(event.currentTarget).get('q') ?? '').trim() || undefined,
    });
  }
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null);
  const [queryText, setQueryText] = useState(params.get('q') ?? '');
  const navigation = <SchemaViewNavigation value={view} onChange={navigate} />;
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-white">
      <DiscoverHeader />
      <SchemaToolbarContext.Provider value={toolbarTarget}>
        <div className={shared.surface}>
          <header className={headerStyles.header}>
            {navigation}
            <form
              className={headerStyles.search}
              hidden={view === 'studio'}
              onSubmit={submit}
              aria-label="Search schema catalog"
            >
              <ReferenceIcon name="search" size={15} />
              <input
                name="q"
                type="search"
                aria-label="Search definitions"
                placeholder="Search projects and schemas…"
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
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
              <button role="tab" aria-selected={false} onClick={() => navigate('active')}>
                Projects
              </button>
              <button role="tab" aria-selected={true} onClick={() => navigate('browse')}>
                Schemas
              </button>
            </div>
            <div className={headerStyles.slot} hidden={view !== 'studio'} ref={setToolbarTarget} />
          </header>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {view === 'discover' ? (
            <ExploreDiscoverySurface
              hideNavigation
              onBrowse={() => navigate('browse')}
              onStudio={() => navigate('studio')}
              onImport={() => navigate('studio')}
              onSearch={(q) => navigate('browse', { q: q || undefined })}
            />
          ) : view === 'browse' ? (
            <SchemaBrowse
              catalog={catalog}
              collections={collections}
              items={catalog.data?.items ?? []}
              navigate={navigate}
              onOpen={setSelected}
              params={params}
            />
          ) : (
            <SchemaStudioSurface navigation={null} browseHref="/templates?schemaView=browse" />
          )}
        </div>
      </SchemaToolbarContext.Provider>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected?.identity.displayName || selected?.identity.canonicalName}
            </DialogTitle>
          </DialogHeader>
          <p>{selected?.identity.description}</p>
          <p className="text-sm text-muted-foreground">
            {selected?.identity.publisher} · {selected?.release.version}
          </p>
          <p className="text-sm">
            Choose a project to inspect and adopt this release in its Workspace.
          </p>
          <Link className="text-sm underline" href="/">
            Choose a project
          </Link>
        </DialogContent>
      </Dialog>
    </div>
  );
}
