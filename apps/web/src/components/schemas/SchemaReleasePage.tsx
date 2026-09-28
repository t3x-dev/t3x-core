'use client';
import type { SchemaCatalogItem } from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { StateAuthorReadme } from '@/components/project/StateAuthorReadme';
import { AddToStudio } from '@/components/schemas/AddToStudio';
import { CatalogLogo } from '@/components/schemas/CatalogLogo';
import { useSchemaIntroduction, useSchemaReleaseReading } from '@/hooks/schemas/useSchemaCatalog';
import styles from './SchemaReleasePage.module.css';

export function SchemaReleasePage({
  item,
  loading,
  error,
  projectId,
  returnTo,
  onBack,
}: {
  item?: SchemaCatalogItem;
  loading: boolean;
  error?: string;
  projectId: string;
  returnTo: string;
  onBack: () => void;
}) {
  const name = item?.identity.displayName || item?.identity.canonicalName || 'Schema';
  return (
    <div className={styles.root}>
      <header className={styles.topbar}>
        <button className={styles.back} onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Browse schemas
        </button>
      </header>
      <div className={styles.scroll}>
        {loading && !item ? <output className={styles.feedback}>Loading schema…</output> : null}
        {error && !item ? (
          <p className={styles.feedback} role="alert">
            {error}
          </p>
        ) : null}
        {item ? (
          <ReleaseReading
            item={item}
            name={name}
            onAdded={onBack}
            projectId={projectId}
            returnTo={returnTo}
          />
        ) : null}
      </div>
    </div>
  );
}

function ReleaseReading({
  item,
  name,
  onAdded,
  projectId,
  returnTo,
}: {
  item: SchemaCatalogItem;
  name: string;
  onAdded: () => void;
  projectId: string;
  returnTo: string;
}) {
  const intro = useSchemaIntroduction(item.presentationRef);
  const reading = useSchemaReleaseReading(
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
    typeof reading.data?.readme === 'string'
      ? stripLeadingTitle(reading.data.readme, name)
      : undefined;
  const nodes = readDefinitionNodes(reading.data?.manifest, item.definition.nodes ?? []);
  const examples = readExamples(reading.data?.manifest?.starter, nodes);
  const yaml = releaseYaml(reading.data?.manifest);
  const reference = item.presentationRef;
  const tags = item.identity.tags.filter((tag) => !tag.startsWith('ecosystem:'));
  const ecosystem = item.identity.tags
    .find((tag) => tag.startsWith('ecosystem:'))
    ?.replace('ecosystem:', '');
  return (
    <div className={styles.layout}>
      <article className={styles.article}>
        <header className={styles.hero}>
          <CatalogLogo item={item} size="hero" />
          <div>
            <div className={styles.kicker}>
              <span className={`${styles.pill} ${styles.pillAccent}`}>
                {item.identity.visibility}
              </span>
              <span className={styles.pill}>{item.release.kind}</span>
              {item.license ? <span className={styles.pill}>{item.license}</span> : null}
              {ecosystem ? <span className={styles.pill}>{ecosystem}</span> : null}
            </div>
            <h1 className={styles.title}>{name}</h1>
            <p className={styles.subtitle}>
              {item.identity.canonicalName} · {item.release.version} · {item.identity.publisher}
            </p>
            {item.identity.description ? (
              <p className={styles.description}>{item.identity.description}</p>
            ) : null}
            {tags.length ? (
              <div className={styles.tags}>
                {tags.map((tag) => (
                  <span className={styles.tag} key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        {intro.loading || reading.loading ? (
          <output className={styles.lede}>Loading release reading…</output>
        ) : null}
        {intro.error ? (
          <p role="alert" className={styles.lede}>
            {intro.error}
          </p>
        ) : null}
        {reading.error ? (
          <p role="alert" className={styles.lede}>
            {reading.error}
          </p>
        ) : null}

        {intro.data ? (
          <section className={styles.section}>
            <h2>About</h2>
            <StateAuthorReadme author={intro.data.document} embedded />
          </section>
        ) : readme ? (
          <section className={styles.section}>
            <h2>About</h2>
            <StateAuthorReadme author={{ readme, resources: [] }} embedded />
          </section>
        ) : null}

        <section className={styles.section} aria-label="Definition">
          <div>
            <h2>What this schema defines</h2>
            <p className={styles.lede}>
              {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'} · {item.definition.pathCount}{' '}
              declared paths. Review the contract before adding it to Studio.
            </p>
          </div>
          {nodes.length ? (
            <div className={styles.nodeGrid}>
              {nodes.map((node) => (
                <section className={styles.nodeCard} key={node.path}>
                  <header className={styles.nodeHead}>
                    <div>
                      <strong>{node.path}</strong>
                      <span>
                        {node.slots.length} {node.slots.length === 1 ? 'field' : 'fields'}
                      </span>
                    </div>
                    <div className={styles.badges}>
                      {node.required ? (
                        <span className={`${styles.badge} ${styles.badgeRequired}`}>Required</span>
                      ) : null}
                      {node.repeated ? (
                        <span className={`${styles.badge} ${styles.badgeRepeat}`}>Named set</span>
                      ) : null}
                    </div>
                  </header>
                  {node.slots.length ? (
                    <table className={styles.fields}>
                      <caption className="sr-only">Fields in {node.path}</caption>
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Type</th>
                          <th>Use</th>
                        </tr>
                      </thead>
                      <tbody>
                        {node.slots.map((slot) => (
                          <tr key={slot.name}>
                            <td>{slot.name}</td>
                            <td>
                              <span className={styles.type}>{slot.type}</span>
                              {slot.enumValues?.length ? (
                                <span className={styles.enum}>
                                  {slot.enumValues.map((value) => (
                                    <i key={value}>{value}</i>
                                  ))}
                                </span>
                              ) : null}
                            </td>
                            <td>{slot.required ? 'required' : 'optional'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className={styles.lede} style={{ padding: '14px 16px' }}>
                      No declared fields.
                    </p>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <p className={styles.lede}>No structured nodes are published for this release.</p>
          )}
        </section>

        {examples.length ? (
          <section className={styles.section} aria-label="Example">
            <div>
              <h2>Example</h2>
              <p className={styles.lede}>A published starter, shown as reviewable values.</p>
            </div>
            {examples.map((group) => (
              <div className={styles.exampleGrid} key={group.title}>
                {group.items.map((example) => (
                  <article className={styles.exampleCard} key={`${group.title}:${example.name}`}>
                    <header>
                      <strong>{example.name}</strong>
                      <em>{group.title}</em>
                    </header>
                    <dl>
                      {example.fields.map((field) => (
                        <div key={field.label}>
                          <dt>{field.label}</dt>
                          <dd>{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </div>
            ))}
          </section>
        ) : null}

        {yaml ? (
          <details className={styles.source}>
            <summary>
              Inspect source YAML
              <ChevronDown aria-hidden="true" className="size-4" />
            </summary>
            <pre>
              <code>{yaml}</code>
            </pre>
          </details>
        ) : null}
      </article>

      <aside className={styles.aside}>
        <section className={styles.panel}>
          <h2>Add to Studio</h2>
          <p>Save this exact release as a candidate. Compare it before applying to a Workspace.</p>
          <AddToStudio
            layout="inline"
            onAdded={onAdded}
            defaultProjectId={projectId}
            title={name}
            source={{
              ...(item.identity.ownerProjectId
                ? { sourceProjectId: item.identity.ownerProjectId }
                : {}),
              canonicalName: item.identity.canonicalName,
              version: item.release.version,
              expectedHash: item.release.hash,
            }}
          />
        </section>
        <section className={styles.panel}>
          <h2>Release</h2>
          <dl className={styles.meta}>
            <div>
              <dt>Version</dt>
              <dd>{item.release.version}</dd>
            </div>
            <div>
              <dt>Publisher</dt>
              <dd>{item.identity.publisher}</dd>
            </div>
            <div>
              <dt>Definition</dt>
              <dd>
                {item.release.kind} · {item.definition.pathCount} paths
              </dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{item.license ?? 'Not declared'}</dd>
            </div>
            <div>
              <dt>Source hash</dt>
              <dd>
                <details>
                  <summary className="cursor-pointer text-[var(--text-secondary)]">
                    Exact source
                  </summary>
                  <p className="mt-2 break-all font-mono text-[11px] font-normal">
                    {item.release.hash}
                  </p>
                </details>
              </dd>
            </div>
          </dl>
          {reference ? (
            <Link
              className={styles.introLink}
              href={`/project/${encodeURIComponent(reference.projectId)}?${new URLSearchParams({ view: 'overview', commit: reference.commitDigest, returnTo, schemaRelease: item.identity.canonicalName, schemaVersion: item.release.version, schemaHash: item.release.hash, studioTarget: projectId }).toString()}`}
            >
              Project introduction
            </Link>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

type SlotView = { name: string; type: string; required: boolean; enumValues?: string[] };
type NodeView = { path: string; required: boolean; repeated: boolean; slots: SlotView[] };
type ExampleGroup = {
  title: string;
  items: Array<{ name: string; fields: Array<{ label: string; value: string }> }>;
};

function readDefinitionNodes(
  manifest: Record<string, unknown> | undefined,
  fallback: SchemaCatalogItem['definition']['nodes']
): NodeView[] {
  const contribution = asRecord(manifest?.contribution);
  const schema = asRecord(manifest?.schema);
  const nodes = asRecord(contribution?.nodes) ?? asRecord(schema?.nodes);
  if (nodes) {
    return Object.entries(nodes).map(([path, value]) => {
      const node = asRecord(value) ?? {};
      const slots = asRecord(node.slots) ?? {};
      const requiredSlots = asStringList(node.requiredSlots);
      return {
        path,
        required: node.required === true,
        repeated: node.repeated === true,
        slots: Object.entries(slots).map(([name, slot]) => {
          const spec = asRecord(slot) ?? {};
          return {
            name,
            type: typeof spec.type === 'string' ? spec.type : 'value',
            required: requiredSlots.includes(name),
            enumValues: asStringList(spec.enum),
          };
        }),
      };
    });
  }
  return fallback.map((node) => ({
    path: node.path.split('/').at(-1) || node.path,
    required: false,
    repeated: false,
    slots: node.slots.map((name) => ({ name, type: 'value', required: false })),
  }));
}

function readExamples(starter: unknown, nodes: NodeView[]): ExampleGroup[] {
  const record = asRecord(starter);
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => {
    const node = nodes.find((item) => item.path === key);
    if (node?.repeated && isNamedMap(value)) {
      return {
        title: key,
        items: Object.entries(asRecord(value) ?? {}).map(([name, instance]) => ({
          name,
          fields: flattenFields(instance),
        })),
      };
    }
    return { title: key, items: [{ name: key, fields: flattenFields(value) }] };
  });
}

function flattenFields(value: unknown): Array<{ label: string; value: string }> {
  const record = asRecord(value);
  if (!record) return [{ label: 'value', value: formatValue(value) }];
  return Object.entries(record).map(([label, field]) => ({ label, value: formatValue(field) }));
}

function isNamedMap(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  const values = Object.values(record);
  return values.length > 0 && values.every((item) => !!asRecord(item));
}

function formatValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(', ');
  return JSON.stringify(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function stripLeadingTitle(readme: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return readme.replace(new RegExp(`^#\\s+${escaped}\\s*\\n+`, 'i'), '').trim();
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
