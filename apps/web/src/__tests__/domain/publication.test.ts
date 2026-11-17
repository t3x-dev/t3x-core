import { describe, expect, it } from 'vitest';
import { commitStructureHref } from '@/domain/project/objectLocation';
import {
  DEFAULT_PUBLICATION,
  PUBLICATION_LAYOUTS,
  type PublicationConfig,
  type PublicationSource,
  publicationAt,
  publicationHref,
  publicationItems,
  publicationMappingIssue,
  publicationMarkdown,
  publicationPaths,
  publicationValue,
  readPublicationConfig,
} from '@/domain/project/publication';

const source: PublicationSource = {
  project: '周末安排',
  projectId: 'proj-a',
  branch: 'main',
  stage: 'Committed State',
  version: `sha256:${'a'.repeat(64)}`,
  subject: 'Content',
  value: {
    events: Array.from({ length: 25 }, (_, i) => ({
      title: `活动${i}`,
      time: '09:00',
      done: i === 0,
      body: '```\n</script><img src=x onerror=alert(1)>\n中文',
      extra: { absent: null, count: 0, values: [false, '', {}] },
    })),
    unrelated: { keep: '全量' },
  },
};
const fields = {
  collection: '/events',
  title: '/title',
  time: '/time',
  done: '/done',
  body: '/body',
};

describe('Publication reading copy', () => {
  it.each(
    PUBLICATION_LAYOUTS
  )('preserves complete content and exact identity in %s Markdown', (layout) => {
    const md = publicationMarkdown(source, { layout, fields });
    expect(md).toContain(source.version);
    expect(md).toContain(source.stage);
    expect(md).toContain('活动24');
    const appendix = md.split('## Complete content\n\n')[1];
    const fence = appendix.split('\n')[0].replace('json', '');
    expect(
      JSON.parse(appendix.slice(fence.length + 5, appendix.indexOf(`\n${fence}`, fence.length)))
    ).toEqual(source.value);
    expect(md).not.toContain('\n<img');
    if (layout === 'checklist') expect(md).toContain('- [x] Complete');
  });
  it('uses actual JSON pointers, including escaped and prototype-named own keys', () => {
    const value = JSON.parse('{"a/b":{"~":{"deep":false}},"__proto__":{"title":"own"}}');
    expect(publicationAt(value, '/a~1b/~0/deep')).toBe(false);
    expect(publicationAt(value, '/__proto__/title')).toBe('own');
    expect(publicationAt(value, '/constructor')).toBeUndefined();
    expect(publicationPaths(value)).toContain('/a~1b/~0/deep');
  });
  it('supports a whole document as one brief without inventing values', () => {
    const config: PublicationConfig = {
      layout: 'brief',
      itemMode: 'single',
      fields: { collection: '', title: '/title', body: '/nested/body' },
    };
    expect(publicationItems({ title: 'One', nested: { body: null } }, config)).toEqual([
      ['1', { title: 'One', nested: { body: null } }],
    ]);
    expect(publicationMarkdown({ ...source, value: { title: 'One' } }, config)).toContain(
      'Not present'
    );
    expect(
      publicationMappingIssue(source.value, { layout: 'brief', fields: { collection: '' } })
    ).toContain('Choose');
    expect(
      publicationMappingIssue(source.value, {
        layout: 'brief',
        fields: { ...fields, collection: '/missing' },
      })
    ).toContain('not present');
  });
  it('keeps semantic relations in the full document when projecting trees for reading', () => {
    const value = {
      domain: 't3x.dev/semantic-content',
      version: 1,
      content: { trees: [{ key: 'doc', slots: { title: 'A' }, children: [] }], relations: [] },
    };
    expect(publicationValue(value)).toEqual({ projected: true, value: { doc: { title: 'A' } } });
    expect(publicationMarkdown({ ...source, value }, DEFAULT_PUBLICATION)).toContain(
      '"relations": []'
    );
    const ordinary = { domain: 'other', version: 1, content: { a: 1 } };
    expect(publicationValue(ordinary)).toEqual({ projected: false, value: ordinary });
  });
  it('pins links to numbered or digest commits and round-trips layout and mappings', () => {
    const commit = {
      project_id: source.projectId,
      branch: 'dev',
      hash: source.version,
      address_number: '42',
    };
    const config: PublicationConfig = { layout: 'schedule', fields, itemMode: 'collection' };
    for (const base of [
      commitStructureHref('/team/repo', commit),
      commitStructureHref(undefined, commit),
    ]) {
      const url = new URL(publicationHref(base, config), 'https://example.test');
      expect(
        url.pathname.endsWith('/commits/42') || url.searchParams.get('commit') === source.version
      ).toBe(true);
      expect(readPublicationConfig(url.searchParams)).toEqual({ config });
      expect(url.searchParams.get('view')).toBe('publication');
    }
  });
  it.each([
    'fields=%7Bbad',
    'layout=unknown',
    'itemMode=guess',
    `fields=${encodeURIComponent('{"collection":"/x~2"}')}`,
    `fields=${encodeURIComponent('{"collection":"","__proto__":"/x"}')}`,
  ])('rejects malformed shared config: %s', (query) => {
    expect(readPublicationConfig(new URLSearchParams(query))).toEqual({
      config: DEFAULT_PUBLICATION,
      error: expect.any(String),
    });
  });
});
