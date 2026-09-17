'use client';
import type { SchemaCatalogItem } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  Layers3,
  Network,
  Search,
  Shield,
  Sparkles,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { resourceUrl, StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
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
import { ExploreDiscoverySurface } from './ExploreDiscoverySurface';
import browseStyles from './SchemaCatalogBrowse.module.css';
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
  const view: View =
    requestedView === 'browse' ||
    requestedView === 'studio' ||
    requestedView === 'discover' ||
    requestedView === 'active'
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
  filters.set('limit', '24');
  const catalog = useSchemaCatalog(projectId, filters.toString(), view === 'browse');
  const collections = useSchemaCollections();
  const [selected, setSelected] = useState<SchemaCatalogItem>();
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
  const items = catalog.data?.items ?? [];
  const visibleView = view === 'active' ? 'browse' : view;
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
        (view === 'browse' || view === 'studio') && 'flex h-full min-h-0 flex-col overflow-hidden'
      )}
      aria-label="Schema experience"
    >
      <div className="shrink-0 border-b border-[var(--stroke-divider)] bg-white">
        {viewNavigation}
      </div>
      {String(view) === 'browse' ? (
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
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {selected ? (
            <ReleaseDetail
              key={selected.release.artifactVersionId}
              item={selected}
              projectId={projectId}
              returnTo={`${pathname}?${params.toString()}`}
              onAdded={() => setSelected(undefined)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
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
            {visibleItems.map((item, index) => (
              <BrowseSchemaCard
                expanded={index === 0}
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

function BrowseSchemaCard({
  expanded,
  item,
  onOpen,
}: {
  expanded: boolean;
  item: SchemaCatalogItem;
  onOpen: () => void;
}) {
  const name = item.identity.displayName || item.identity.canonicalName;
  const tags = item.identity.tags.filter((tag) => !tag.startsWith('ecosystem:')).slice(0, 3);
  const nodes = item.definition.nodes ?? [];
  const featuredNode = nodes[0];
  return (
    <button
      aria-label={`Explore ${name} ${item.release.version}`}
      className={cn(browseStyles.schemaCard, expanded && browseStyles.schemaCardExpanded)}
      onClick={onOpen}
      type="button"
    >
      <span className={browseStyles.cardTop}>
        <CatalogLogo item={item} large />
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
        {expanded ? <ChevronUp aria-hidden="true" className={browseStyles.expandIcon} /> : null}
      </span>
      {expanded ? (
        <span className={browseStyles.nodePreview}>
          <span className={browseStyles.nodeTitle}>
            <ChevronDown aria-hidden="true" />
            <b>{featuredNode?.path?.split('/').at(-1) || 'definition'}</b>
            <em>object</em>
          </span>
          {(featuredNode?.slots ?? []).slice(0, 2).map((slot) => (
            <span className={browseStyles.nodeRow} key={slot}>
              <b>{slot}</b>
              <em>string</em>
            </span>
          ))}
          {!featuredNode?.slots?.length ? (
            <span className={browseStyles.nodeRow}>
              <b>paths</b>
              <em>{item.definition.pathCount} declared</em>
            </span>
          ) : null}
        </span>
      ) : null}
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

const logoTones = [
  'bg-[var(--status-info)]',
  'bg-[var(--accent-branch)]',
  'bg-[var(--status-success)]',
  'bg-[var(--accent-pending)]',
  'bg-[var(--accent-conversation)]',
];
const starterLogos = new Set(['t3x/product-brief', 't3x/care-checklist', 't3x/compose-services']);

function CatalogLogo({ item, large = false }: { item: SchemaCatalogItem; large?: boolean }) {
  const intro = useSchemaIntroduction(item.presentationRef);
  const avatar = intro.data?.document.resources.find(
    (resource) => resource.path === intro.data?.document.avatarPath
  );
  const name = item.identity.canonicalName;
  if (avatar) {
    return (
      <Image
        src={resourceUrl(avatar)}
        alt=""
        width={large ? 48 : 40}
        height={large ? 48 : 40}
        unoptimized
        className={cn(
          'shrink-0 object-cover shadow-sm',
          large ? 'size-12 rounded-lg' : 'size-10 rounded-xl'
        )}
      />
    );
  }
  // Only unowned built-ins receive T3X artwork. Similar community names do not
  // inherit an official identity. Other glyphs are decorative, not capabilities.
  if (
    !item.identity.ownerProjectId &&
    item.identity.visibility === 'official' &&
    starterLogos.has(name)
  ) {
    return (
      <Image
        src={`/schema-logos/${name.split('/')[1]}.png`}
        unoptimized
        alt=""
        width={large ? 48 : 40}
        height={large ? 48 : 40}
        className={cn('shrink-0 shadow-sm', large ? 'size-12 rounded-lg' : 'size-10 rounded-xl')}
      />
    );
  }
  const hash = Array.from(name).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
  const Icon = /power|energy/.test(name)
    ? Zap
    : /network|api/.test(name)
      ? Network
      : /sensor|hardware|actuator|device/.test(name)
        ? Cpu
        : /evaluat|experiment|research/.test(name)
          ? FlaskConical
          : /security|safety|policy|guardrail/.test(name)
            ? Shield
            : /database|data/.test(name)
              ? Database
              : /agent|prompt|context/.test(name)
                ? Sparkles
                : /workflow|automation|rollout|delivery/.test(name)
                  ? Workflow
                  : /prd|requirement|plan|brief/.test(name)
                    ? FileText
                    : Layers3;
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center ${large ? 'size-12 rounded-lg' : 'size-10 rounded-xl'} ${logoTones[hash % logoTones.length]} text-[var(--on-status)] shadow-sm`}
    >
      <Icon className={large ? 'size-6' : 'size-5'} strokeWidth={1.8} />
    </span>
  );
}

function ReleaseDetail({
  item,
  projectId,
  returnTo,
  onAdded,
}: {
  item: SchemaCatalogItem;
  projectId: string;
  returnTo: string;
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
    true
  );
  const readme =
    typeof releaseReading.data?.readme === 'string' ? releaseReading.data.readme : undefined;
  const yaml = releaseYaml(releaseReading.data?.manifest);
  const cover = intro.data?.document.resources.find(
    (resource) => resource.path === reference?.coverPath
  );
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
          <dd>
            <span className="font-mono">{item.release.version}</span>
            <details className="mt-2">
              <summary className="cursor-pointer text-[var(--text-secondary)]">
                Exact source
              </summary>
              <p className="mt-2 break-all font-mono">{item.release.hash}</p>
            </details>
          </dd>
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
          <output className="block text-sm">Loading release YAML…</output>
        ) : null}
        {releaseReading.error ? (
          <p role="alert" className="text-sm text-[var(--status-error)]">
            {releaseReading.error}
          </p>
        ) : null}
        {yaml ? (
          <section aria-label="Release YAML" className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              Release YAML
            </h3>
            <pre className="max-h-[28rem] overflow-auto rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-3 font-mono text-[11px] leading-5 text-[var(--text-primary)]">
              <code>{yaml}</code>
            </pre>
          </section>
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

const RELEASE_YAML_LEAD_KEYS = [
  'apiVersion',
  'canonicalName',
  'version',
  'title',
  'description',
  'contribution',
  'schema',
  'starter',
] as const;

function releaseYaml(manifest: Record<string, unknown> | undefined): string | null {
  if (!manifest) return null;
  const { readme: _readme, ...rest } = manifest;
  const ordered: Record<string, unknown> = {};
  for (const key of RELEASE_YAML_LEAD_KEYS) {
    if (key in rest) ordered[key] = rest[key];
  }
  for (const [key, value] of Object.entries(rest)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return dump(ordered, { lineWidth: 100, noRefs: true, sortKeys: false }).trimEnd();
}
