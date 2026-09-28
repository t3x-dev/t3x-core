'use client';

import type { SchemaCatalogItem } from '@t3x-dev/api-client';
import type { FormEvent } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CatalogLogo } from './CatalogLogo';
import styles from './ExploreDiscoverySurface.module.css';

type IconWeight = 'regular' | 'fill' | 'bold';

type SchemaItem = {
  name: string;
  version: string;
  owner: string;
  avatar: string;
  description: string;
  icon: string;
  iconWeight?: IconWeight;
  iconBackground: string;
  iconColor?: string;
};

type CuratedSchema = {
  owner: string;
  name: string;
  description: string;
  tags: readonly string[];
  icon: string;
  iconWeight?: IconWeight;
  iconBackground: string;
  iconColor: string;
  cover: string;
};

const curatedSchemas: CuratedSchema[] = [
  {
    owner: 'orbit-labs',
    name: 'Release plan',
    description: 'Plan and track software releases with confidence.',
    tags: ['overview', 'requirements', 'rollout'],
    icon: 'planet',
    iconBackground: 'var(--text-primary)',
    iconColor: 'var(--status-warning)',
    cover: styles.cardOne,
  },
  {
    owner: 'fern-team',
    name: 'Service contract',
    description: 'Define and manage service agreements.',
    tags: ['service', 'terms', 'owners'],
    icon: 'leaf',
    iconWeight: 'fill',
    iconBackground: 'var(--status-success)',
    iconColor: 'var(--on-accent)',
    cover: styles.cardTwo,
  },
  {
    owner: 'maya',
    name: 'Agent policy',
    description: 'Set boundaries and behaviors for AI agents.',
    tags: ['policy', 'permissions', 'checks'],
    icon: 'sparkle',
    iconWeight: 'fill',
    iconBackground: 'var(--status-info)',
    iconColor: 'var(--on-accent)',
    cover: styles.cardThree,
  },
];

const discoveredSchemas: SchemaItem[] = [
  {
    name: 'Release plan',
    version: 'v1.2',
    owner: 'orbit-labs',
    avatar: 'O',
    description: 'Plan and great software releases.',
    icon: 'planet',
    iconBackground: 'var(--text-primary)',
    iconColor: 'var(--status-warning)',
  },
  {
    name: 'Feature flag',
    version: 'v1.1',
    owner: 'launchdarkly',
    avatar: 'L',
    description: 'Manage feature rollouts and targeting.',
    icon: 'lightning',
    iconWeight: 'fill',
    iconBackground: 'var(--status-warning)',
    iconColor: 'var(--text-primary)',
  },
  {
    name: 'Service contract',
    version: 'v1.0',
    owner: 'fern-team',
    avatar: 'F',
    description: 'Define and manage service agreements.',
    icon: 'leaf',
    iconWeight: 'fill',
    iconBackground: 'var(--status-success)',
  },
  {
    name: 'Environment',
    version: 'v1.0',
    owner: 'cloudroll',
    avatar: 'C',
    description: 'Define deployment environments.',
    icon: 'cube',
    iconWeight: 'fill',
    iconBackground: 'var(--color-brand)',
  },
  {
    name: 'Agent policy',
    version: 'v1.1',
    owner: 'maya',
    avatar: 'M',
    description: 'Set boundaries for AI agents.',
    icon: 'sparkle',
    iconWeight: 'fill',
    iconBackground: 'var(--status-info)',
  },
  {
    name: 'Access control',
    version: 'v1.3',
    owner: 'openmind',
    avatar: 'O',
    description: 'Model users, teams, and permissions.',
    icon: 'users',
    iconWeight: 'fill',
    iconBackground: 'var(--status-info)',
  },
  {
    name: 'Data catalog',
    version: 'v0.9',
    owner: 'neon',
    avatar: 'N',
    description: 'Organize and share data assets.',
    icon: 'database',
    iconWeight: 'fill',
    iconBackground: 'var(--status-info)',
  },
  {
    name: 'Integration',
    version: 'v1.0',
    owner: 'apidocs',
    avatar: 'A',
    description: 'Define third-party integrations.',
    icon: 'arrows-left-right',
    iconWeight: 'bold',
    iconBackground: 'var(--status-success)',
  },
  {
    name: 'Security control',
    version: 'v1.0',
    owner: 'safeguard',
    avatar: 'S',
    description: 'Standardize security requirements.',
    icon: 'shield-check',
    iconWeight: 'fill',
    iconBackground: 'var(--status-error)',
  },
  {
    name: 'Audit log',
    version: 'v0.8',
    owner: 'everlog',
    avatar: 'E',
    description: 'Capture and query system events.',
    icon: 'file-text',
    iconWeight: 'fill',
    iconBackground: 'var(--status-warning)',
  },
];

const schemaPicks: Array<Omit<SchemaItem, 'owner' | 'avatar'>> = [
  {
    name: 'Agent policy',
    version: 'v1.1',
    description: 'A great starting point for AI products.',
    icon: 'sparkle',
    iconWeight: 'fill',
    iconBackground: 'var(--status-info)',
  },
  {
    name: 'Release plan',
    version: 'v1.2',
    description: 'Popular with product teams.',
    icon: 'planet',
    iconBackground: 'var(--text-primary)',
    iconColor: 'var(--status-warning)',
  },
  {
    name: 'Service contract',
    version: 'v1.0',
    description: 'Trusted by growing teams.',
    icon: 'leaf',
    iconWeight: 'fill',
    iconBackground: 'var(--status-success)',
  },
  {
    name: 'Data catalog',
    version: 'v0.9',
    description: 'Essential for data-driven teams.',
    icon: 'database',
    iconWeight: 'fill',
    iconBackground: 'var(--status-info)',
  },
  {
    name: 'Security control',
    version: 'v1.0',
    description: 'A foundation for safer systems.',
    icon: 'shield-check',
    iconWeight: 'fill',
    iconBackground: 'var(--status-error)',
  },
];

function PhosphorIcon({
  name,
  weight = 'regular',
  className = '',
}: {
  name: string;
  weight?: IconWeight;
  className?: string;
}) {
  const family = weight === 'regular' ? 'ph' : weight === 'fill' ? 'ph-fill' : 'ph-bold';
  return <i aria-hidden="true" className={`${family} ph-${name} ${className}`} />;
}
export function ExploreDiscoverySurface({
  onBrowse,
  onSearch,
  items,
  onOpen,
  loading,
  error,
}: {
  items?: SchemaCatalogItem[];
  onOpen?: (item: SchemaCatalogItem) => void;
  loading?: boolean;
  error?: string;
  onBrowse?: () => void;
  onSearch?: (query: string) => void;
}) {
  return (
    <>
      <link
        href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css"
        rel="stylesheet"
      />
      <link
        href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css"
        rel="stylesheet"
      />
      <link
        href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/bold/style.css"
        rel="stylesheet"
      />

      <main
        className={`${styles.page} min-h-0 w-full bg-[var(--surface-panel)] p-4 text-[var(--text-primary)] selection:bg-[var(--color-brand-muted)] selection:text-[var(--color-brand)] md:p-6`}
      >
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <form
            className="flex h-[45px] w-full min-w-0 items-center rounded-[8px] border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-3.5 md:max-w-[800px] md:flex-1"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              onSearch?.(String(new FormData(event.currentTarget).get('q') ?? '').trim());
            }}
          >
            <PhosphorIcon
              className="text-[17px] text-[var(--text-primary)]"
              name="magnifying-glass"
            />
            <input
              aria-label="Search projects and schemas"
              name="q"
              className="ml-3 h-full w-full bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
              placeholder="Search projects and schemas..."
              type="text"
            />
          </form>

          <SegmentedControl
            ariaLabel="Catalog type"
            itemClassName="min-w-[96px] px-5 text-[14px]"
            items={[
              { label: 'All', value: 'all' },
              { label: 'Projects', value: 'projects' },
              { label: 'Schemas', value: 'schemas' },
            ]}
            onValueChange={() => undefined}
            value="schemas"
          />
        </header>

        {items ? (
          <section aria-label="Published schemas">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-bold">Curated schemas</h1>
              <button type="button" onClick={onBrowse}>
                Browse all
              </button>
            </div>
            {loading ? <output>Loading schemas…</output> : null}
            {error ? <p role="alert">{error}</p> : null}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <button
                  key={`${item.identity.canonicalName}:${item.release.hash}`}
                  type="button"
                  onClick={() => onOpen?.(item)}
                  aria-label={`Explore ${item.identity.displayName || item.identity.canonicalName} ${item.release.version}`}
                  className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-5 text-left shadow-sm"
                >
                  <CatalogLogo item={item} size="large" />
                  <h2 className="text-lg font-bold">
                    {item.identity.displayName || item.identity.canonicalName}
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {item.identity.description}
                  </p>
                  <p className="text-xs">
                    {item.identity.publisher} · {item.release.version}
                  </p>
                </button>
              ))}
            </div>
            {!loading && !error && items.length === 0 ? <p>No published schemas found.</p> : null}
          </section>
        ) : (
          <>
            <section className="mb-7">
              <div className="mb-4 flex items-center gap-3">
                <h1 className="text-[24px] font-bold tracking-tight text-[var(--text-primary)]">
                  Curated schemas
                </h1>
                <div className="flex items-center gap-1.5 rounded-full border border-[var(--stroke-default)] bg-[var(--color-brand-muted)] px-3 py-1 text-[13px] font-medium text-[var(--color-brand)]">
                  <PhosphorIcon className="text-base" name="cube" />
                  <span>Usable schemas</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {curatedSchemas.map((schema) => (
                  <article
                    className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] shadow-[var(--fx-shadow-sm)] transition-shadow hover:shadow-md"
                    key={schema.name}
                  >
                    <div className={`h-24 w-full ${schema.cover}`} />
                    <div className="relative flex flex-1 flex-col p-4 pt-8">
                      <div
                        className="absolute -top-7 left-4 flex h-14 w-14 items-center justify-center rounded-[14px] border-4 border-[var(--surface-panel)] shadow-sm"
                        style={{ background: schema.iconBackground, color: schema.iconColor }}
                      >
                        <PhosphorIcon
                          className="text-[28px]"
                          name={schema.icon}
                          weight={schema.iconWeight}
                        />
                      </div>
                      <div className="mb-0.5 text-[12px] font-medium text-[var(--text-secondary)]">
                        {schema.owner}
                      </div>
                      <div className="mb-1 flex items-center justify-between">
                        <h3 className="text-[18px] font-bold text-[var(--text-primary)]">
                          {schema.name}
                        </h3>
                        <PhosphorIcon
                          className="-translate-x-2 text-xl text-[var(--color-brand)] opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                          name="arrow-right"
                        />
                      </div>
                      <p className="mb-4 flex-1 text-[13px] leading-5 text-[var(--text-secondary)]">
                        {schema.description}
                      </p>
                      <div className="mt-auto flex items-center gap-2 border-t border-[var(--stroke-divider)] pt-3 text-[12px] text-[var(--text-secondary)]">
                        <PhosphorIcon className="text-lg text-[var(--color-brand)]" name="graph" />
                        <span className="flex items-center gap-2">
                          {schema.tags.map((tag, index) => (
                            <span className="flex items-center gap-2" key={tag}>
                              {index > 0 ? (
                                <i className="h-[3px] w-[3px] rounded-full bg-[var(--text-tertiary)]" />
                              ) : null}
                              {tag}
                            </span>
                          ))}
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[21px] font-bold tracking-tight text-[var(--text-primary)]">
                    Discover schemas
                  </h2>
                  <button
                    className="flex items-center gap-1 text-[15px] font-medium text-[var(--color-brand)] hover:underline"
                    onClick={onBrowse}
                    style={{ color: 'var(--color-brand)' }}
                    type="button"
                  >
                    Browse all <PhosphorIcon name="arrow-right" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                  {discoveredSchemas.map((schema) => (
                    <DiscoveredSchema key={schema.name} schema={schema} />
                  ))}
                </div>
              </div>

              <aside className="h-fit rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-5 shadow-[var(--fx-shadow-sm)] xl:col-span-1">
                <h2 className="mb-4 text-[18px] font-bold tracking-tight text-[var(--text-primary)]">
                  Schema picks
                </h2>
                <div className="flex flex-col gap-4">
                  {schemaPicks.map((schema, index) => (
                    <SchemaPick
                      isLast={index === schemaPicks.length - 1}
                      key={schema.name}
                      schema={schema}
                    />
                  ))}
                </div>
              </aside>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function SchemaIcon({
  schema,
  compact = false,
}: {
  schema: Pick<SchemaItem, 'icon' | 'iconWeight' | 'iconBackground' | 'iconColor'>;
  compact?: boolean;
}) {
  return (
    <div
      className={`mt-1 flex shrink-0 items-center justify-center rounded-xl ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}
      style={{ background: schema.iconBackground, color: schema.iconColor ?? 'var(--on-accent)' }}
    >
      <PhosphorIcon
        className={compact ? 'text-[18px]' : 'text-[21px]'}
        name={schema.icon}
        weight={schema.iconWeight}
      />
    </div>
  );
}

function DiscoveredSchema({ schema }: { schema: SchemaItem }) {
  return (
    <article className="group -m-2 flex cursor-pointer items-start gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--surface-hover)]">
      <SchemaIcon schema={schema} />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <h4 className="truncate text-[15px] font-bold text-[var(--text-primary)]">
            {schema.name}
          </h4>
          <div className="flex shrink-0 items-center gap-3">
            <span className="rounded bg-[var(--color-brand-muted)] px-2 py-0.5 text-[12px] font-bold tracking-wide text-[var(--color-brand)]">
              {schema.version}
            </span>
            <span className="flex w-[90px] items-center gap-1.5">
              <i className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-card)] text-[10px] font-bold not-italic text-[var(--text-primary)]">
                {schema.avatar}
              </i>
              <span className="truncate text-[13px] text-[var(--text-secondary)]">
                {schema.owner}
              </span>
            </span>
          </div>
        </div>
        <p className="truncate pr-2 text-[13px] text-[var(--text-secondary)]">
          {schema.description}
        </p>
      </div>
    </article>
  );
}

function SchemaPick({
  schema,
  isLast,
}: {
  schema: Omit<SchemaItem, 'owner' | 'avatar'>;
  isLast: boolean;
}) {
  return (
    <article className="group flex cursor-pointer items-start gap-3">
      <SchemaIcon compact schema={schema} />
      <div
        className={
          isLast
            ? 'min-w-0 flex-1 pb-1'
            : 'min-w-0 flex-1 border-b border-[var(--stroke-divider)] pb-3 transition-colors group-hover:border-transparent'
        }
      >
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <h4 className="truncate text-[15px] font-bold text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-brand)]">
            {schema.name}
          </h4>
          <span className="shrink-0 rounded bg-[var(--color-brand-muted)] px-2 py-0.5 text-[12px] font-bold tracking-wide text-[var(--color-brand)]">
            {schema.version}
          </span>
        </div>
        <p className="line-clamp-1 text-[13px] text-[var(--text-secondary)]">
          {schema.description}
        </p>
      </div>
    </article>
  );
}
