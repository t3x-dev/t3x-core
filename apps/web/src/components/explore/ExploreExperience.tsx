'use client';
import type { PublicProject, SchemaCatalogItem } from '@t3x-dev/api-client';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  Compass,
  FolderGit2,
  Grid2X2,
  Layers,
  List,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { CatalogLogo } from '@/components/schemas/CatalogLogo';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
import { SchemaReleasePage } from '@/components/schemas/SchemaReleasePage';
import {
  useExploreRelease,
  usePublicProject,
  usePublicProjects,
} from '@/hooks/explore/useExploreData';
import { useSchemaCatalog, useSchemaCollections } from '@/hooks/schemas/useSchemaCatalog';
import palette from '@/styles/management-palette.module.css';
import styles from './ExploreExperience.module.css';

const schemaFilters = [
  'tags',
  'ecosystem',
  'publisher',
  'family',
  'kind',
  'format',
  'capability',
  'collection',
] as const;
const releaseKeys = [
  'catalogName',
  'catalogVersion',
  'catalogHash',
  'sourceProjectId',
  'catalogProjectId',
  'schemaView',
] as const;
export function ExploreExperience() {
  const search = useSearchParams();
  const router = useRouter();
  const query = search.toString();
  const params = new URLSearchParams(query);
  const view = params.get('view') === 'browse' ? 'browse' : 'discover';
  const type =
    params.get('type') === 'projects'
      ? 'projects'
      : params.get('type') === 'schemas'
        ? 'schemas'
        : 'all';
  const layout = params.get('layout') === 'list' ? 'list' : 'grid';
  const release = params.has('catalogName');
  const project = params.get('project');
  const [searchText, setSearchText] = useState(params.get('q') ?? '');
  const routeSearch = params.get('q') ?? '';
  useEffect(() => setSearchText(routeSearch), [routeSearch]);
  const browseQuery = new URLSearchParams({ limit: view === 'discover' ? '8' : '24' });
  if (routeSearch) browseQuery.set('q', routeSearch);
  for (const key of schemaFilters) if (params.get(key)) browseQuery.set(key, params.get(key)!);
  const catalog = useSchemaCatalog(
    null,
    browseQuery.toString(),
    !release && !project && type !== 'projects'
  );
  const picks = useSchemaCatalog(
    null,
    'selection=editor-picks&limit=3',
    !release && !project && view === 'discover' && type !== 'projects'
  );
  const collections = useSchemaCollections();
  const projectQuery = new URLSearchParams({ limit: view === 'discover' ? '6' : '24' });
  if (routeSearch) projectQuery.set('q', routeSearch);
  if (params.get('projectTag')) projectQuery.set('tag', params.get('projectTag')!);
  const projects = usePublicProjects(
    projectQuery.toString(),
    !release && !project && type !== 'schemas'
  );
  function navigate(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(query);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`/explore${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  function openRelease(item: SchemaCatalogItem) {
    navigate({
      catalogName: item.identity.canonicalName,
      catalogVersion: item.release.version,
      catalogHash: item.release.hash,
      sourceProjectId: item.identity.ownerProjectId ?? undefined,
      schemaView: 'release',
    });
  }
  function back() {
    navigate(Object.fromEntries([...releaseKeys, 'project'].map((key) => [key, undefined])));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    navigate({ view: 'browse', q: searchText.trim() || undefined });
  }
  function reset() {
    navigate(
      Object.fromEntries([...schemaFilters, 'projectTag', 'q'].map((key) => [key, undefined]))
    );
  }
  const returnTo = `/explore?${query}`;
  return (
    <div className={`${palette.scope} ${styles.shell}`}>
      <DiscoverHeader />
      {release ? (
        <ExactRelease params={params} returnTo={returnTo} onBack={back} />
      ) : project ? (
        <PublicProjectReading projectId={project} onBack={back} />
      ) : (
        <main className={styles.scroll} aria-label="Explore">
          <div className={styles.page}>
            <header className={styles.toolbar}>
              <nav className={styles.segmented} aria-label="Explore views">
                <button
                  type="button"
                  aria-current={view === 'discover' ? 'page' : undefined}
                  onClick={() => navigate({ view: 'discover' })}
                >
                  <Compass size={16} />
                  Discover
                </button>
                <button
                  type="button"
                  aria-current={view === 'browse' ? 'page' : undefined}
                  onClick={() => navigate({ view: 'browse' })}
                >
                  <Grid2X2 size={16} />
                  Browse
                </button>
              </nav>
              <form className={styles.search} onSubmit={submit}>
                <Search size={17} aria-hidden="true" />
                <input
                  aria-label="Search projects and schemas"
                  placeholder="Search projects and schemas…"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  type="search"
                />
                <button type="submit" aria-label="Search">
                  <ArrowRight size={17} />
                </button>
              </form>
              <nav className={styles.types} aria-label="Catalog type">
                {(['all', 'projects', 'schemas'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-current={type === value ? 'page' : undefined}
                    onClick={() => navigate({ type: value })}
                  >
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </nav>
            </header>
            {view === 'discover' ? (
              <>
                <div className={styles.heading}>
                  <div>
                    <span className={styles.eyebrow}>EXPLORE T3X</span>
                    <h1>Find a starting point.</h1>
                    <p>Discover schemas to shape your next project, and projects to learn from.</p>
                  </div>
                  <Link href="/" className={styles.textLink}>
                    Your repositories <ArrowRight size={15} />
                  </Link>
                </div>
                {type !== 'projects' ? (
                  <section className={styles.section} aria-label="Curated schemas">
                    <SectionHeading
                      title="Curated schemas"
                      note="Selected by T3X"
                      action={() => navigate({ view: 'browse', type: 'schemas' })}
                    />
                    <Feedback data={picks} empty="No curated releases are available right now." />
                    <div className={styles.featureGrid}>
                      {picks.data?.items.map((item) => (
                        <SchemaCard
                          key={item.release.artifactVersionId}
                          item={item}
                          featured
                          onOpen={openRelease}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
                <div className={styles.discoveryBody}>
                  <div className={styles.sections}>
                    {type !== 'projects' ? (
                      <section aria-label="Recently published schemas">
                        <SectionHeading
                          title="Recently published"
                          note="Schemas"
                          action={() => navigate({ view: 'browse', type: 'schemas' })}
                        />
                        <Feedback data={catalog} empty="No schemas match this search." />
                        <div className={styles.rows}>
                          {catalog.data?.items.map((item) => (
                            <SchemaCard
                              key={item.release.artifactVersionId}
                              item={item}
                              row
                              onOpen={openRelease}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}
                    {type !== 'schemas' ? (
                      <section aria-label="Public projects">
                        <SectionHeading
                          title="Public projects"
                          note="From the community"
                          action={() => navigate({ view: 'browse', type: 'projects' })}
                        />
                        <Feedback
                          data={projects}
                          empty="No public projects yet. Projects appear here after their owners publish them."
                        />
                        <div className={styles.projectGrid}>
                          {projects.data?.items.map((item) => (
                            <ProjectCard
                              key={item.projectId}
                              item={item}
                              onOpen={() => navigate({ project: item.projectId })}
                            />
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                  <aside className={styles.collections}>
                    <span className={styles.eyebrow}>FIND YOUR NEXT IDEA</span>
                    <h2>Explore by topic</h2>
                    <p>A few places to start. Follow the topic that fits your project.</p>
                    {collections.map((collection, index) => (
                      <button
                        type="button"
                        key={collection.id}
                        onClick={() =>
                          navigate({ view: 'browse', type: 'schemas', collection: collection.id })
                        }
                      >
                        <span className={styles.topicIcon} data-tone={index % 4}>
                          <Layers size={18} />
                        </span>
                        <span>{collection.title}</span>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                    <div className={styles.tip}>
                      <Braces size={22} />
                      <h3>From discovery to your Studio</h3>
                      <p>
                        Choose a release, save it to a project, then review it with your Workspace.
                      </p>
                    </div>
                  </aside>
                </div>
              </>
            ) : (
              <div className={styles.browseLayout}>
                <aside className={styles.filters} aria-label="Filters">
                  <div className={styles.filterHeading}>
                    <h2>
                      <SlidersHorizontal size={15} />
                      Filters
                    </h2>
                    <button type="button" onClick={reset}>
                      Reset
                    </button>
                  </div>
                  {type !== 'projects' ? (
                    <>
                      <fieldset>
                        <legend>TOPIC · SCHEMAS</legend>
                        <button
                          className={styles.filterOption}
                          type="button"
                          aria-pressed={!params.has('collection')}
                          onClick={() => navigate({ collection: undefined })}
                        >
                          All topics {!params.has('collection') && <Check size={14} />}
                        </button>
                        {collections.map((item) => (
                          <button
                            className={styles.filterOption}
                            key={item.id}
                            type="button"
                            aria-pressed={params.get('collection') === item.id}
                            onClick={() => navigate({ collection: item.id })}
                          >
                            {item.title}
                            {params.get('collection') === item.id && <Check size={14} />}
                          </button>
                        ))}
                      </fieldset>
                      <label className={styles.filterLabel}>
                        KIND · SCHEMAS
                        <select
                          value={params.get('kind') ?? ''}
                          onChange={(event) => navigate({ kind: event.target.value || undefined })}
                        >
                          <option value="">All definitions</option>
                          <option value="schema">Schema</option>
                          <option value="core">Core</option>
                          <option value="module">Module</option>
                        </select>
                      </label>
                      <FilterInput
                        label="Publisher · schemas"
                        value={params.get('publisher') ?? ''}
                        onApply={(value) => navigate({ publisher: value || undefined })}
                      />
                    </>
                  ) : null}
                  {type !== 'schemas' ? (
                    <FilterInput
                      label="Tag · projects"
                      value={params.get('projectTag') ?? ''}
                      onApply={(value) => navigate({ projectTag: value || undefined })}
                    />
                  ) : null}
                  <p className={styles.filterNote}>
                    Published schemas and public projects. Newest releases and projects appear
                    first.
                  </p>
                </aside>
                <div className={styles.results}>
                  <div className={styles.resultHeading}>
                    <h1>Browse {type === 'all' ? 'Explore' : type}</h1>
                    <fieldset className={styles.viewSwitch} aria-label="Display">
                      <button
                        type="button"
                        aria-label="Card view"
                        aria-pressed={layout === 'grid'}
                        onClick={() => navigate({ layout: 'grid' })}
                      >
                        <Grid2X2 size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="List view"
                        aria-pressed={layout === 'list'}
                        onClick={() => navigate({ layout: 'list' })}
                      >
                        <List size={17} />
                      </button>
                    </fieldset>
                  </div>
                  <div className={styles.applied}>
                    {[
                      'q',
                      ...(type === 'projects' ? [] : schemaFilters),
                      ...(type === 'schemas' ? [] : ['projectTag']),
                    ]
                      .filter((key) => params.has(key))
                      .map((key) => (
                        <button
                          type="button"
                          key={key}
                          onClick={() => navigate({ [key]: undefined })}
                        >
                          {key === 'q' ? 'Search' : key}: {params.get(key)}
                          <X size={12} />
                        </button>
                      ))}
                  </div>
                  {type !== 'projects' ? (
                    <section aria-label="Schema results">
                      <SectionHeading
                        title="Schemas"
                        note={`Loaded ${catalog.data?.items.length ?? 0}`}
                      />
                      <Feedback
                        data={catalog}
                        empty="No schemas match these filters. Try another topic or clear the filters."
                      />
                      <div className={layout === 'list' ? styles.rows : styles.cardGrid}>
                        {catalog.data?.items.map((item) => (
                          <SchemaCard
                            item={item}
                            key={item.release.artifactVersionId}
                            row={layout === 'list'}
                            onOpen={openRelease}
                          />
                        ))}
                      </div>
                      <LoadMore data={catalog} />
                    </section>
                  ) : null}
                  {type !== 'schemas' ? (
                    <section aria-label="Project results">
                      <SectionHeading
                        title="Public projects"
                        note={`Loaded ${projects.data?.items.length ?? 0}`}
                      />
                      <Feedback data={projects} empty="No public projects match these filters." />
                      <div className={layout === 'list' ? styles.rows : styles.cardGrid}>
                        {projects.data?.items.map((item) => (
                          <ProjectCard
                            key={item.projectId}
                            item={item}
                            row={layout === 'list'}
                            onOpen={() => navigate({ project: item.projectId })}
                          />
                        ))}
                      </div>
                      <LoadMore data={projects} />
                    </section>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
function SectionHeading({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: () => void;
}) {
  return (
    <div className={styles.sectionHeading}>
      <h2>{title}</h2>
      {note && <span>{note}</span>}
      {action && (
        <button type="button" onClick={action}>
          Browse all <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
function FilterInput({
  label,
  value,
  onApply,
}: {
  label: string;
  value: string;
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <form
      className={styles.filterLabel}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft.trim());
      }}
    >
      <label>
        {label}
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Any" />
      </label>
      <button type="submit">
        Apply <ArrowRight size={13} />
      </button>
    </form>
  );
}
function SchemaCard({
  item,
  featured = false,
  row = false,
  onOpen,
}: {
  item: SchemaCatalogItem;
  featured?: boolean;
  row?: boolean;
  onOpen: (item: SchemaCatalogItem) => void;
}) {
  const name = item.identity.displayName || item.identity.canonicalName;
  const covers: Record<string, string> = {
    't3x/compose-services': 'compose',
    't3x/care-checklist': 'care',
    't3x/product-brief': 'product',
  };
  const cover =
    !item.identity.ownerProjectId && item.identity.visibility === 'official'
      ? covers[item.identity.canonicalName]
      : undefined;
  return (
    <article
      className={`${styles.card} ${featured ? styles.featured : ''} ${row ? styles.row : ''}`}
    >
      {featured ? (
        <div className={styles.cover}>
          {cover ? (
            <Image
              src={`/schema-covers/${cover}.jpg`}
              alt=""
              fill
              sizes="(max-width: 560px) 100vw, (max-width: 850px) 50vw, 33vw"
            />
          ) : (
            <div className={styles.coverPattern}>
              <Braces size={64} />
            </div>
          )}
          <span>
            <Sparkles size={13} />
            Editor’s pick
          </span>
        </div>
      ) : null}
      <div className={styles.cardBody}>
        <div className={styles.cardHead}>
          <CatalogLogo item={item} />
          <div className={styles.titleBlock}>
            <button type="button" className={styles.title} onClick={() => onOpen(item)}>
              {name}
            </button>
            <span>{item.identity.publisher}</span>
          </div>
          <span className={styles.version}>{item.release.version}</span>
        </div>
        <p className={styles.description}>
          {item.identity.description || item.editorial?.reason || 'A published schema definition.'}
        </p>
        <div className={styles.tags}>
          {item.identity.tags
            .filter((tag) => !tag.startsWith('ecosystem:'))
            .slice(0, 3)
            .map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
        </div>
        <div className={styles.cardFoot}>
          <span>
            <Braces size={13} />
            {item.definition.pathCount} paths
          </span>
          <button type="button" aria-label={`Explore ${name}`} onClick={() => onOpen(item)}>
            Explore <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
function ProjectCard({
  item,
  row = false,
  onOpen,
}: {
  item: PublicProject;
  row?: boolean;
  onOpen: () => void;
}) {
  const tone = Array.from(item.name).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  return (
    <article
      className={`${styles.card} ${styles.projectCard} ${row ? styles.row : ''}`}
      data-tone={tone}
    >
      {!row && (
        <div className={styles.projectPattern} aria-hidden="true">
          <span />
          <span />
          <FolderGit2 size={32} />
        </div>
      )}
      <div className={styles.cardBody}>
        <div className={styles.cardHead}>
          <span className={styles.projectIcon}>
            <FolderGit2 size={22} />
          </span>
          <div className={styles.titleBlock}>
            <button type="button" className={styles.title} onClick={onOpen}>
              {item.name}
            </button>
            <span>{item.namespace || 'Community'}</span>
          </div>
          <span className={styles.version}>Public</span>
        </div>
        <p className={styles.description}>
          {item.description || 'Explore this public project and its introduction.'}
        </p>
        <div className={styles.tags}>
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className={styles.cardFoot}>
          <span>
            <BookOpen size={13} />
            Project
          </span>
          <button type="button" onClick={onOpen} aria-label={`Explore ${item.name}`}>
            Explore <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
type FeedbackData = {
  loading: boolean;
  error?: string;
  data?: { items: unknown[] };
  retry: () => void;
};
function Feedback({ data, empty }: { data: FeedbackData; empty: string }) {
  return (
    <>
      {data.loading && <output className={styles.feedback}>Loading…</output>}
      {data.error && (
        <div role="alert" className={styles.feedback}>
          {data.error}
          <button type="button" onClick={data.retry}>
            Try again
          </button>
        </div>
      )}
      {!data.loading && !data.error && data.data?.items.length === 0 && (
        <p className={styles.empty}>{empty}</p>
      )}
    </>
  );
}
function LoadMore({
  data,
}: {
  data: { data?: { has_more: boolean }; morePending: boolean; loadMore: () => Promise<void> };
}) {
  return data.data?.has_more ? (
    <button
      className={styles.loadMore}
      type="button"
      disabled={data.morePending}
      onClick={() => void data.loadMore()}
    >
      {data.morePending ? 'Loading…' : 'Load more'}
      <ArrowRight size={14} />
    </button>
  ) : null;
}
function ExactRelease({
  params,
  returnTo,
  onBack,
}: {
  params: URLSearchParams;
  returnTo: string;
  onBack: () => void;
}) {
  const query = new URLSearchParams({
    canonicalName: params.get('catalogName') ?? '',
    version: params.get('catalogVersion') ?? '',
    expectedHash: params.get('catalogHash') ?? '',
  });
  if (params.get('sourceProjectId')) query.set('sourceProjectId', params.get('sourceProjectId')!);
  if (params.get('catalogProjectId'))
    query.set('catalogProjectId', params.get('catalogProjectId')!);
  const valid = !!params.get('catalogVersion') && !!params.get('catalogHash');
  const result = useExploreRelease(query.toString(), valid);
  return (
    <div className={styles.detail}>
      <SchemaReleasePage
        item={result.data?.item}
        loading={result.loading}
        error={
          valid
            ? result.error
            : 'This link needs an exact release version and hash. Return to Browse to choose a release.'
        }
        projectId={null}
        targetProjectId={params.get('studioTarget') ?? undefined}
        workspaceId={params.get('workspace') ?? undefined}
        branch={params.get('branch') ?? undefined}
        returnTo={returnTo}
        onBack={onBack}
      />
    </div>
  );
}
function PublicProjectReading({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const result = usePublicProject(projectId);
  const project = result.data;
  return (
    <main className={styles.scroll}>
      <div className={styles.projectDetail}>
        <button className={styles.textLink} type="button" onClick={onBack}>
          <ArrowLeft size={15} />
          Back to Explore
        </button>
        {result.loading && <output className={styles.feedback}>Loading project…</output>}
        {result.error && (
          <div role="alert" className={styles.feedback}>
            {result.error}
            <button onClick={result.retry} type="button">
              Try again
            </button>
          </div>
        )}
        {project && (
          <>
            <header className={styles.projectHero}>
              <div className={styles.projectHeroArt}>
                <FolderGit2 size={64} />
              </div>
              <span className={styles.eyebrow}>
                PUBLIC PROJECT · {project.namespace || 'COMMUNITY'}
              </span>
              <h1>{project.name}</h1>
              <p>{project.description}</p>
              <div className={styles.tags}>
                {project.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              {project.repositoryPath ? (
                <Link className={styles.primaryLink} href={project.repositoryPath}>
                  Open project <ArrowRight size={16} />
                </Link>
              ) : (
                <p className={styles.accessNote}>
                  This introduction is public. Project contents require access from its owner.
                </p>
              )}
            </header>
            <section className={styles.readme}>
              <h2>
                <BookOpen size={18} />
                Introduction
              </h2>
              {project.readme ? (
                <StateAuthorReadme author={{ readme: project.readme, resources: [] }} embedded />
              ) : (
                <p>The owner hasn’t added an introduction yet.</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
