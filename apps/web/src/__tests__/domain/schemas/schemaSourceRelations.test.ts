import type { StudioCandidate, StudioPreview } from '@t3x-dev/api-client';
import { describe, expect, it } from 'vitest';
import { schemaFieldRows } from '@/domain/schemas/schemaFieldEditing';
import {
  isSourceBase,
  schemaSourceRelations,
  sourceContainsRelation,
} from '@/domain/schemas/schemaSourceRelations';

const pin = {
  projectId: 'p',
  canonicalName: 'tasks',
  version: 'v1',
  artifactVersionId: 'v1',
  hash: `sha256:${'a'.repeat(64)}`,
};
const schema = { nodes: { task: { slots: { title: { type: 'string' } } } } };
const preview = {
  schema,
  schemaHash: 'source-hash',
  sources: [pin],
  origins: {
    task: { kind: 'module', artifact: 'tasks', version: 'v1', source: pin },
    'task/title': { kind: 'module', artifact: 'tasks', version: 'v1', source: pin },
  },
} as unknown as StudioPreview;
const candidate = { id: 'tasks-source', source: pin } as StudioCandidate;
const sourceRow = schemaFieldRows(schema)[0];

describe('Schema selection associations', () => {
  it('keeps repeated imports associated after rename and move without linking a new local field', () => {
    const rows = schemaFieldRows({
      nodes: {
        renamed: { slots: { copied: { type: 'string' }, local: { type: 'string' } } },
        other: { slots: { copied: { type: 'string' } } },
      },
    });
    const imported = rows.filter((row) => row.name === 'copied');
    const mappings = imported.map((row) => ({
      path: row.location,
      from: ['nodes', 'task', 'slots', 'title'],
      source: { candidateId: candidate.id, schemaHash: preview.schemaHash },
    }));
    const links = schemaSourceRelations(rows, mappings);
    const matches = rows.filter((row) =>
      links
        .get(row.path)
        ?.some((link) => sourceContainsRelation(link, candidate, sourceRow, preview, false))
    );
    expect(matches.map((row) => row.semanticPath)).toEqual(['renamed/copied', 'other/copied']);
    expect(
      sourceContainsRelation(
        links.get(imported[0].path)![0],
        candidate,
        sourceRow,
        { ...preview, schemaHash: 'another-version' },
        false
      )
    ).toBe(false);
  });

  it('requires an exact Base before using its path for a whole-release association', () => {
    const rows = schemaFieldRows(schema);
    const links = schemaSourceRelations(rows, [], preview, schema, pin).get(rows[1].path)!;
    expect(isSourceBase(structuredClone(schema), preview)).toBe(true);
    expect(sourceContainsRelation(links[0], candidate, sourceRow, preview, true)).toBe(true);
    expect(sourceContainsRelation(links[0], candidate, sourceRow, preview, false)).toBe(false);
    expect(
      sourceContainsRelation(
        links[0],
        { ...candidate, source: { ...pin, hash: 'other' } },
        sourceRow,
        preview,
        true
      )
    ).toBe(false);
  });

  it('follows a recorded source path and retains all contributing sources', () => {
    const rows = schemaFieldRows({ nodes: { renamed: { slots: {} } } });
    const second = { ...pin, artifactVersionId: 'second', hash: `sha256:${'b'.repeat(64)}` };
    const evidence = {
      ...preview,
      schema: { nodes: { renamed: { slots: {} } } },
      origins: {},
      nodeProvenance: {
        byPath: {
          renamed: [pin, second].map((source) => ({
            source,
            commitRef: {
              projectId: 'p',
              commitDigest: `sha256:${'c'.repeat(64)}`,
              schemaHash: source.hash,
              sourcePath: 'task',
            },
          })),
        },
      },
    } as unknown as StudioPreview;
    const links = schemaSourceRelations(rows, [], evidence).get(rows[0].path)!;
    expect(links).toHaveLength(2);
    expect(sourceContainsRelation(links[0], candidate, sourceRow, preview, false)).toBe(true);
    expect(sourceContainsRelation(links[1], candidate, sourceRow, preview, false)).toBe(false);
  });
});
