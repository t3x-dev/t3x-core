'use client';
import type { SchemaCatalogItem } from '@t3x-dev/api-client';
import {
  ArrowRight,
  BookOpen,
  Box,
  Code2,
  FlaskConical,
  Layers3,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Workflow,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { resourceUrl, StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useSchemaCatalog,
  useSchemaCollections,
  useSchemaIntroduction,
  useSchemaReleaseReading,
} from '@/hooks/schemas/useSchemaCatalog';
import { useProjectWorkspaces } from '@/hooks/workspaces/useProjectWorkspaces';
import { cn } from '@/utils/cn';
import { ActiveSchemaBindings } from './ActiveSchemaBindings';
import { AddToStudio } from './AddToStudio';
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
const icons = {
  infrastructure: Layers3,
  'ai-agents': Sparkles,
  science: FlaskConical,
  security: Shield,
  devices: Workflow,
  data: Box,
  'work-life': BookOpen,
};
type View = 'discover' | 'browse' | 'studio' | 'active';
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
  const hasBinding = workspaces.workspaces.some((item) => item.schemaBindings.length > 0);
  const view: View =
    requestedView === 'browse' ||
    requestedView === 'studio' ||
    requestedView === 'discover' ||
    requestedView === 'active'
      ? requestedView
      : params.get('mode') === 'compose'
        ? 'studio'
        : hasBinding
          ? 'active'
          : 'discover';
  const filters = new URLSearchParams();
  if (view === 'browse')
    for (const key of filterKeys) {
      const value = params.get(key);
      if (value) filters.set(key, value);
    }
  filters.set('limit', view === 'discover' ? '12' : '24');
  const catalog = useSchemaCatalog(
    projectId,
    filters.toString(),
    view === 'discover' || view === 'browse'
  );
  const collections = useSchemaCollections();
  const [selected, setSelected] = useState<SchemaCatalogItem>();
  const [showFilters, setShowFilters] = useState(false);
  function navigate(nextView: View, updates: Record<string, string | undefined> = {}) {
    const next = new URLSearchParams(search?.toString() ?? '');
    next.set('schemaView', nextView);
    for (const key of ['mode', 'module', 'version', 'catalogName', 'catalogVersion'])
      next.delete(key);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSelected(undefined);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }
  function searchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate('browse', { q: String(new FormData(event.currentTarget).get('q') ?? '').trim() });
  }
  function openRelease(item: SchemaCatalogItem) {
    const href = introductionHref(item, projectId, `${pathname}?${params.toString()}`);
    if (href) router.push(href);
    else setSelected(item);
  }
  function openStudio(item: SchemaCatalogItem) {
    navigate(
      'studio',
      item.release.kind === 'schema'
        ? {
            mode: 'versions',
            catalogName: item.identity.canonicalName,
            catalogVersion: item.release.version,
          }
        : {
            mode: 'compose',
            module: item.identity.canonicalName,
            version: item.release.version,
            family: ['prd', 'prompt', 'skill', 'esphome-device'].includes(item.identity.family)
              ? item.identity.family
              : undefined,
          }
    );
  }
  const items = catalog.data?.items ?? [];
  const searchForm = (large = false) => (
    <form
      onSubmit={searchSubmit}
      className={cn('flex min-w-0 gap-2', large ? 'w-full lg:max-w-lg' : 'flex-1')}
      aria-label="Search schema catalog"
    >
      <Input
        key={params.get('q') ?? ''}
        name="q"
        aria-label="Search definitions"
        placeholder="Search templates, tools, or ideas"
        defaultValue={params.get('q') ?? ''}
        className={large ? 'h-12 bg-[var(--surface-card)]' : 'h-10 bg-[var(--surface-card)]'}
      />
      <Button
        type="submit"
        variant="default"
        className={large ? 'h-12 w-12 shrink-0' : 'h-10 w-10 shrink-0'}
        aria-label="Search"
      >
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
  return (
    <section className="min-w-0 text-[var(--text-primary)]" aria-label="Schema experience">
      <nav
        aria-label="Schema views"
        className="flex gap-6 border-b border-[var(--stroke-divider)] px-4 sm:px-6"
      >
        {(
          [
            ...(hasBinding ? [['active', Box, 'Active'] as const] : []),
            ['discover', Search, 'Discover'],
            ['browse', BookOpen, 'Browse'],
            ['studio', Code2, 'Studio'],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => navigate(id)}
            aria-current={view === id ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 border-b-2 py-4 text-sm font-medium',
              view === id
                ? 'border-[var(--status-info)] text-[var(--status-info)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
      {view === 'active' ? (
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
        <div className="p-4 sm:p-6">
          {view === 'discover' ? (
            <>
              <header className="flex flex-col justify-between gap-6 py-5 lg:flex-row lg:items-center">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  What will you define next?
                </h1>
                {searchForm(true)}
              </header>
              <fieldset
                className="mb-7 flex flex-wrap gap-x-6 gap-y-3 border-y border-[var(--stroke-divider)] py-4"
                aria-label="Editorial collections"
              >
                {collections.map((collection) => {
                  const Icon = icons[collection.id as keyof typeof icons] ?? Box;
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => navigate('browse', { collection: collection.id })}
                      className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--status-info)]"
                    >
                      <Icon className="size-4" />
                      {collection.title}
                    </button>
                  );
                })}
              </fieldset>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold">Recently published</h2>
                <button
                  type="button"
                  onClick={() => navigate('browse')}
                  className="text-sm text-[var(--status-info)]"
                >
                  Browse all <ArrowRight className="ml-1 inline size-4" />
                </button>
              </div>
            </>
          ) : null}
          <div
            className={
              view === 'browse' ? 'grid min-w-0 gap-6 md:grid-cols-[230px_minmax(0,1fr)]' : ''
            }
          >
            {view === 'browse' ? (
              <>
                <Button
                  variant="canvas-outline"
                  onClick={() => setShowFilters((value) => !value)}
                  aria-expanded={showFilters}
                  className="md:hidden"
                >
                  <SlidersHorizontal className="size-4" />
                  Filters
                </Button>
                <aside
                  aria-label="Catalog filters"
                  className={cn(
                    'min-w-0 space-y-5 md:border-r md:border-[var(--stroke-divider)] md:pr-5',
                    showFilters ? 'block' : 'hidden md:block'
                  )}
                >
                  <h2 className="text-sm font-semibold">Collections</h2>
                  <div className="space-y-1">
                    {collections.map((collection) => {
                      const Icon = icons[collection.id as keyof typeof icons] ?? Box;
                      return (
                        <button
                          key={collection.id}
                          type="button"
                          aria-pressed={params.get('collection') === collection.id}
                          onClick={() =>
                            navigate('browse', {
                              collection:
                                params.get('collection') === collection.id
                                  ? undefined
                                  : collection.id,
                            })
                          }
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
                            params.get('collection') === collection.id
                              ? 'bg-[var(--status-info-muted)] text-[var(--status-info)]'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]'
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          {collection.title}
                        </button>
                      );
                    })}
                  </div>
                  <form
                    key={filters.toString()}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      navigate(
                        'browse',
                        Object.fromEntries(
                          ['tags', 'ecosystem', 'publisher', 'capability', 'kind', 'format'].map(
                            (key) => [key, String(form.get(key) ?? '').trim() || undefined]
                          )
                        )
                      );
                    }}
                    className="space-y-4 border-t border-[var(--stroke-divider)] pt-4"
                  >
                    {(
                      [
                        ['tags', 'Tags', 'research, custom-tag'],
                        ['ecosystem', 'Ecosystem', 'Declared ecosystem'],
                        ['publisher', 'Publisher', 'Publisher namespace'],
                        ['capability', 'Provides', 'Declared capability'],
                      ] as const
                    ).map(([key, label, placeholder]) => (
                      <label
                        key={key}
                        htmlFor={`catalog-filter-${key}`}
                        className="block space-y-2 text-xs font-medium"
                      >
                        {label}
                        <Input
                          id={`catalog-filter-${key}`}
                          name={key}
                          aria-label={label}
                          defaultValue={params.get(key) ?? ''}
                          placeholder={placeholder}
                          className="h-9 text-xs"
                        />
                      </label>
                    ))}
                    <label className="block space-y-2 text-xs font-medium">
                      Definition
                      <select
                        name="kind"
                        aria-label="Definition kind"
                        defaultValue={params.get('kind') ?? ''}
                        className="h-9 w-full rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2"
                      >
                        <option value="">All definitions</option>
                        <option value="core">Core</option>
                        <option value="module">Module</option>
                        <option value="schema">Schema</option>
                      </select>
                    </label>
                    <label className="block space-y-2 text-xs font-medium">
                      Format
                      <select
                        name="format"
                        aria-label="Serialization format"
                        defaultValue={params.get('format') ?? ''}
                        className="h-9 w-full rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2"
                      >
                        <option value="">YAML & JSON</option>
                        <option value="yaml">YAML</option>
                        <option value="json">JSON</option>
                      </select>
                    </label>
                    <Button type="submit" variant="canvas-outline" className="w-full">
                      Apply filters
                    </Button>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          'browse',
                          Object.fromEntries(filterKeys.map((key) => [key, undefined]))
                        )
                      }
                      className="w-full text-xs text-[var(--text-secondary)]"
                    >
                      Clear filters
                    </button>
                  </form>
                </aside>
              </>
            ) : null}
            <main className="min-w-0">
              {view === 'browse' ? (
                <>
                  <div className="mb-6 flex items-center gap-3">
                    {searchForm()}
                    <span className="hidden shrink-0 text-xs text-[var(--text-tertiary)] lg:block">
                      Latest releases
                    </span>
                  </div>
                  <h1 className="mb-4 text-lg font-semibold">
                    Explore definitions{' '}
                    <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">
                      {items.length} loaded
                    </span>
                  </h1>
                </>
              ) : null}
              {catalog.loading ? (
                <output className="block py-10 text-sm text-[var(--text-secondary)]">
                  Loading definitions…
                </output>
              ) : null}
              {catalog.error ? (
                <div
                  role="alert"
                  className="mb-4 flex flex-wrap items-center gap-3 text-sm text-[var(--status-error)]"
                >
                  <span>{catalog.error}</span>
                  <Button variant="canvas-outline" onClick={catalog.retry}>
                    Retry
                  </Button>
                </div>
              ) : null}
              {!catalog.loading && !catalog.error && items.length === 0 ? (
                <div className="border-y border-[var(--stroke-divider)] py-12">
                  <h2 className="font-medium">No matching definitions</h2>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Try another search or clear a filter.
                  </p>
                </div>
              ) : null}
              <div
                className={
                  view === 'discover'
                    ? 'grid gap-5 lg:grid-cols-2'
                    : 'divide-y divide-[var(--stroke-divider)] overflow-hidden rounded-lg border border-[var(--stroke-divider)]'
                }
              >
                {items.map((item) =>
                  view === 'discover' ? (
                    <DiscoveryCard
                      key={item.release.artifactVersionId}
                      item={item}
                      onOpen={() => openRelease(item)}
                    />
                  ) : (
                    <button
                      key={item.release.artifactVersionId}
                      type="button"
                      onClick={() => openRelease(item)}
                      className="flex w-full min-w-0 items-center gap-3 bg-[var(--surface-card)] px-3 py-3 text-left hover:bg-[var(--hover-bg)]"
                      aria-label={`Explore ${item.identity.displayName || item.identity.canonicalName} ${item.release.version}`}
                    >
                      <Box className="size-8 shrink-0 rounded-md bg-[var(--status-info-muted)] p-1.5 text-[var(--status-info)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {item.identity.displayName || item.identity.canonicalName}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">
                          {item.identity.publisher} · {item.release.version}
                        </span>
                      </span>
                      <span className="hidden min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)] xl:block">
                        {item.identity.description}
                      </span>
                      <span className="hidden rounded border border-[var(--stroke-divider)] px-2 py-1 text-[11px] text-[var(--text-secondary)] sm:inline">
                        {item.release.kind}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-[var(--text-tertiary)]" />
                    </button>
                  )
                )}
              </div>
              {catalog.data?.has_more ? (
                <div className="mt-5 text-center">
                  <Button
                    variant="canvas-outline"
                    disabled={catalog.morePending}
                    onClick={view === 'browse' ? catalog.loadMore : () => navigate('browse')}
                  >
                    {catalog.morePending
                      ? 'Loading…'
                      : view === 'browse'
                        ? 'Load more'
                        : 'Browse all definitions'}
                  </Button>
                </div>
              ) : null}
            </main>
          </div>
        </div>
      )}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? (
            <ReleaseDetail
              key={selected.release.artifactVersionId}
              item={selected}
              projectId={projectId}
              returnTo={`${pathname}?${params.toString()}`}
              onStudio={() => openStudio(selected)}
              onAdded={() => setSelected(undefined)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
function DiscoveryCard({ item, onOpen }: { item: SchemaCatalogItem; onOpen: () => void }) {
  const intro = useSchemaIntroduction(item.presentationRef);
  const cover = intro.data?.document.resources.find(
    (resource) => resource.path === item.presentationRef?.coverPath
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Explore ${item.identity.displayName || item.identity.canonicalName} ${item.release.version}`}
      className="overflow-hidden rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-left transition-colors hover:border-[var(--status-info)]"
    >
      <div className="flex min-h-44 flex-col sm:flex-row">
        <div
          className={cn(
            'relative shrink-0 items-center justify-center bg-[var(--status-info-muted)] text-[var(--status-info)] sm:flex sm:w-2/5',
            item.identity.tags.includes('care')
              ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
              : item.identity.tags.includes('planning')
                ? 'bg-[var(--accent-conversation-soft)] text-[var(--accent-conversation)]'
                : '',
            cover ? 'flex h-36 sm:h-auto' : 'hidden'
          )}
        >
          {cover ? (
            <Image
              src={resourceUrl(cover)}
              alt={cover.alt}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <div className="w-full space-y-3 p-5">
              <div className="mb-5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest">
                <Layers3 className="size-3.5" /> Definition
              </div>
              {(item.definition.nodes ?? []).length ? (
                item.definition.nodes.map((node) => (
                  <div key={node.path} className="relative border-l border-current/20 pl-3">
                    <div className="absolute -left-1 top-2 size-2 rounded-full bg-current" />
                    <div className="rounded-md border border-current/10 bg-[var(--surface-card)]/80 p-3 shadow-sm">
                      <p className="truncate font-mono text-xs font-semibold">{node.path}</p>
                      <p className="mt-1 truncate text-[10px] text-[var(--text-secondary)]">
                        {node.slots.join(' · ') || 'Nested structure'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-3">
                  <Box className="size-8 stroke-1" />
                  <span className="text-sm">{item.definition.pathCount} declared paths</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 p-5">
          <p className="mb-3 text-xs font-medium text-[var(--status-info)]">
            {item.identity.tags[0] || item.release.kind}
          </p>
          <h3 className="text-xl font-semibold leading-tight">
            {item.identity.displayName || item.identity.canonicalName}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm text-[var(--text-secondary)]">
            {item.identity.description}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
            <span>{item.definition.pathCount} paths</span>
            <span aria-hidden="true">·</span>
            <span>{item.formats.join(' / ').toUpperCase()}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--stroke-divider)] px-4 py-3 text-xs">
        <span className="min-w-0 truncate text-[var(--text-secondary)]">
          {item.identity.publisher} · {item.release.version}
        </span>
        <span className="ml-3 flex shrink-0 items-center gap-2 text-[var(--status-info)]">
          Explore release <ArrowRight className="size-3" />
        </span>
      </div>
    </button>
  );
}
function ReleaseDetail({
  item,
  projectId,
  returnTo,
  onStudio,
  onAdded,
}: {
  item: SchemaCatalogItem;
  projectId: string;
  returnTo: string;
  onStudio: () => void;
  onAdded: () => void;
}) {
  const intro = useSchemaIntroduction(item.presentationRef);
  const reference = item.presentationRef;
  const releaseReading = useSchemaReleaseReading(
    projectId,
    {
      canonicalName: item.identity.canonicalName,
      version: item.release.version,
      hash: item.release.hash,
      sourceProjectId: item.identity.ownerProjectId ?? undefined,
    },
    item.release.kind !== 'schema' && !reference
  );
  const readme =
    typeof releaseReading.data?.readme === 'string' ? releaseReading.data.readme : undefined;
  const cover = intro.data?.document.resources.find(
    (resource) => resource.path === reference?.coverPath
  );
  const canOpenStudio =
    item.release.kind !== 'schema' || item.identity.ownerProjectId === projectId;
  return (
    <>
      <SheetHeader>
        <SheetTitle>{item.identity.displayName || item.identity.canonicalName}</SheetTitle>
        <SheetDescription>
          {item.identity.publisher} · {item.release.version}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-5 px-4 pb-6">
        <p className="text-sm text-[var(--text-secondary)]">{item.identity.description}</p>
        {cover ? (
          <Image
            src={resourceUrl(cover)}
            alt={cover.alt}
            width={640}
            height={360}
            unoptimized
            className="max-h-64 w-full rounded-lg object-cover"
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {item.identity.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-[var(--status-info-muted)] px-2 py-1 text-xs text-[var(--status-info)]"
            >
              {tag}
            </span>
          ))}
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 border-y border-[var(--stroke-divider)] py-4 text-xs">
          <dt className="text-[var(--text-tertiary)]">Release</dt>
          <dd className="break-all font-mono">{item.release.hash}</dd>
          <dt className="text-[var(--text-tertiary)]">Definition</dt>
          <dd>
            {item.release.kind} · {item.definition.pathCount} declared paths
          </dd>
          <dt className="text-[var(--text-tertiary)]">License</dt>
          <dd>{item.license ?? 'Not declared'}</dd>
        </dl>
        {intro.loading ? (
          <output className="block text-sm">Loading author introduction…</output>
        ) : null}
        {intro.error ? (
          <p role="alert" className="text-sm text-[var(--status-error)]">
            {intro.error}
          </p>
        ) : null}
        {intro.data ? (
          <StateAuthorReadme author={intro.data.document} />
        ) : readme ? (
          <StateAuthorReadme author={{ readme, resources: [] }} />
        ) : null}
        {releaseReading.loading ? (
          <output className="block text-sm">Loading release introduction…</output>
        ) : null}
        {releaseReading.error ? (
          <p role="alert" className="text-sm text-[var(--status-error)]">
            {releaseReading.error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <AddToStudio
            onAdded={onAdded}
            defaultProjectId={projectId}
            title={item.identity.displayName ?? item.identity.canonicalName}
            source={{
              ...(item.identity.ownerProjectId
                ? { sourceProjectId: item.identity.ownerProjectId }
                : {}),
              canonicalName: item.identity.canonicalName,
              version: item.release.version,
              expectedHash: item.release.hash,
            }}
          />
          {canOpenStudio ? (
            <Button variant="default" onClick={onStudio}>
              Open in Studio <ArrowRight className="size-4" />
            </Button>
          ) : null}
          {reference ? (
            <Button variant="canvas-outline" asChild>
              <Link
                href={`/project/${encodeURIComponent(reference.projectId)}?${new URLSearchParams({ view: 'overview', commit: reference.commitDigest, returnTo, schemaRelease: item.identity.canonicalName, schemaVersion: item.release.version, schemaHash: item.release.hash, studioTarget: projectId }).toString()}`}
              >
                Project introduction
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function introductionHref(item: SchemaCatalogItem, projectId: string, returnTo: string) {
  const reference = item.presentationRef;
  if (!reference) return null;
  return `/project/${encodeURIComponent(reference.projectId)}?${new URLSearchParams({ view: 'overview', commit: reference.commitDigest, returnTo, schemaRelease: item.identity.canonicalName, schemaVersion: item.release.version, schemaHash: item.release.hash, studioTarget: projectId })}`;
}
