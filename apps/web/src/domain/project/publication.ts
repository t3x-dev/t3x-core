import { SemanticContentSchema, type TreeNode, treesToYValue } from '@t3x-dev/core';

export const PUBLICATION_LAYOUTS = ['generic', 'schedule', 'checklist', 'brief'] as const;
export type PublicationLayout = (typeof PUBLICATION_LAYOUTS)[number];
export type PublicationFields = {
  collection: string;
  title?: string;
  time?: string;
  done?: string;
  body?: string;
};
export type PublicationConfig = {
  layout: PublicationLayout;
  fields: PublicationFields;
  itemMode?: 'collection' | 'single';
};
export type PublicationSource = {
  project: string;
  projectId: string;
  stage: 'Committed State' | 'Saved Draft' | 'Fixed Review';
  version: string;
  branch: string;
  subject: 'Content' | 'Schema';
  value: unknown;
};
export const DEFAULT_PUBLICATION: PublicationConfig = {
  layout: 'generic',
  fields: { collection: '' },
};

export function readPublicationConfig(search: { get: (key: string) => string | null }): {
  config: PublicationConfig;
  error?: string;
} {
  const layout = search.get('layout') ?? 'generic';
  const raw = search.get('fields');
  const itemMode = search.get('itemMode') ?? 'collection';
  try {
    if (itemMode !== 'collection' && itemMode !== 'single') throw new Error('Invalid item mode');
    if (!PUBLICATION_LAYOUTS.includes(layout as PublicationLayout) || (raw?.length ?? 0) > 12000)
      throw new Error('Invalid layout');
    const fields: unknown = raw ? JSON.parse(raw) : { collection: '' };
    if (!fields || typeof fields !== 'object' || Array.isArray(fields))
      throw new Error('Invalid fields');
    const entries = Object.entries(fields);
    if (
      !entries.some(([key]) => key === 'collection') ||
      entries.some(
        ([key, path]) =>
          !['collection', 'title', 'time', 'done', 'body'].includes(key) ||
          typeof path !== 'string' ||
          path.length > 2000 ||
          (path !== '' && !path.startsWith('/')) ||
          /~(?![01])/u.test(path)
      )
    )
      throw new Error('Invalid field path');
    return {
      config: {
        layout: layout as PublicationLayout,
        fields: fields as PublicationFields,
        itemMode,
      },
    };
  } catch {
    return {
      config: DEFAULT_PUBLICATION,
      error: 'This layout or field mapping is invalid. Showing general reading.',
    };
  }
}

export function publicationHref(commitHref: string, config: PublicationConfig) {
  const [path, query] = commitHref.split('?');
  const params = new URLSearchParams(query);
  params.delete('artifact');
  params.set('view', 'publication');
  params.set('layout', config.layout);
  params.set('fields', JSON.stringify(config.fields));
  params.set('itemMode', config.itemMode ?? 'collection');
  if (readPublicationConfig(params).error)
    throw new Error('Field paths are too long to share. Download a reading copy instead.');
  return `${path}?${params}`;
}

export function publicationValue(value: unknown): { value: unknown; projected: boolean } {
  if (
    value &&
    typeof value === 'object' &&
    'domain' in value &&
    value.domain === 't3x.dev/semantic-content' &&
    'version' in value &&
    value.version === 1 &&
    'content' in value
  ) {
    const result = SemanticContentSchema.safeParse(value.content);
    if (result.success)
      return { value: treesToYValue(result.data.trees as TreeNode[]), projected: true };
  }
  return { value, projected: false };
}

export function publicationAt(value: unknown, pointer: string): unknown {
  if (!pointer) return value;
  if (!pointer.startsWith('/')) return undefined;
  return pointer
    .slice(1)
    .split('/')
    .reduce<unknown>((node, key) => {
      const name = key.replaceAll('~1', '/').replaceAll('~0', '~');
      return node !== null && typeof node === 'object' && Object.hasOwn(node, name)
        ? (node as Record<string, unknown>)[name]
        : undefined;
    }, value);
}

export function publicationEntries(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((item, index) => [String(index + 1), item]);
  if (value !== null && typeof value === 'object') return Object.entries(value);
  return value === undefined ? [] : [['Value', value]];
}

export function publicationItems(value: unknown, config: PublicationConfig): [string, unknown][] {
  const selected = publicationAt(value, config.fields.collection);
  return selected === undefined
    ? []
    : config.itemMode === 'single'
      ? [['1', selected]]
      : publicationEntries(selected);
}

/** JSON pointers identify actual fields, including keys containing slash or tilde. */
export function publicationPaths(value: unknown, collectionsOnly = false): string[] {
  const paths: string[] = [];
  function visit(node: unknown, path: string) {
    if (!collectionsOnly || (node !== null && typeof node === 'object')) paths.push(path);
    if (node !== null && typeof node === 'object' && !Array.isArray(node))
      for (const [key, child] of Object.entries(node))
        visit(child, `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
  }
  visit(value, '');
  return paths;
}

export function publicationText(value: unknown) {
  if (value === undefined) return 'Not present';
  if (value === '') return 'Empty text';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function publicationMappingIssue(value: unknown, config: PublicationConfig): string | null {
  if (config.layout === 'generic') return null;
  const collection = publicationAt(value, config.fields.collection);
  if (collection === undefined) return 'The selected collection is not present in this version.';
  const required =
    config.layout === 'schedule' ? 'time' : config.layout === 'checklist' ? 'done' : 'body';
  if (config.fields.title === undefined || config.fields[required] === undefined)
    return 'Choose the fields for this layout, or use general reading.';
  return null;
}

const markdownText = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&');
function codeBlock(value: unknown) {
  const text = JSON.stringify(value, null, 2);
  const fence = '`'.repeat(
    Math.max(3, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length + 1))
  );
  return `${fence}json\n${text}\n${fence}`;
}

export function publicationMarkdown(source: PublicationSource, config: PublicationConfig) {
  const reading = publicationValue(source.value).value;
  const lines = [
    `# ${markdownText(source.project)} · ${source.subject}`,
    `${source.stage} · ${markdownText(source.version)}`,
    `Project: ${markdownText(source.projectId)} · Branch: ${markdownText(source.branch)} · Layout: ${config.layout}`,
  ];
  if (config.layout === 'generic') lines.push(codeBlock(reading));
  else {
    const issue = publicationMappingIssue(reading, config);
    if (issue) throw new Error(issue);
    for (const [key, item] of publicationEntries(
      publicationAt(reading, config.fields.collection)
    )) {
      const get = (field: keyof PublicationFields) =>
        publicationAt(item, config.fields[field] ?? '');
      lines.push(`## ${markdownText(publicationText(get('title')))} (${markdownText(key)})`);
      if (config.layout === 'schedule')
        lines.push(`Time: ${markdownText(publicationText(get('time')))}`);
      if (config.layout === 'checklist') {
        const done = get('done');
        lines.push(
          typeof done === 'boolean'
            ? `- [${done ? 'x' : ' '}] ${done ? 'Complete' : 'Open'}`
            : `Status (expected boolean): ${markdownText(publicationText(done))}`
        );
      }
      if (config.fields.body !== undefined) lines.push(markdownText(publicationText(get('body'))));
    }
  }
  lines.push(
    '## Field mapping',
    codeBlock(config),
    '## Complete content',
    codeBlock(source.value),
    'Downloaded reading copy. Repository access rules apply to online links.'
  );
  return `${lines.join('\n\n')}\n`;
}
