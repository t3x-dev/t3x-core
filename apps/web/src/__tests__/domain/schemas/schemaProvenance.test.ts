import { describe, expect, it } from 'vitest';
import { schemaFieldRows } from '@/domain/schemas/schemaFieldEditing';
import {
  type SchemaSourcePin,
  schemaNodeProvenance,
  schemaSourceKey,
  schemaSourceReleaseHref,
} from '@/domain/schemas/schemaProvenance';

const pin: SchemaSourcePin = {
  projectId: 'source-project',
  canonicalName: '@team/tasks',
  version: '1.0.0',
  artifactVersionId: 'tasks-v1',
  hash: `sha256:${'a'.repeat(64)}`,
};
const rows = schemaFieldRows({ nodes: { tasks: { slots: { title: { type: 'string' } } } } });
const origin = { kind: 'module', artifact: pin.canonicalName, version: pin.version };

describe('node provenance', () => {
  it('resolves only an unambiguous exact version, including its project and hash', () => {
    const result = schemaNodeProvenance(rows[0], rows[0], { tasks: origin }, [pin]);
    expect(result).toMatchObject({ local: false, unknown: false, pending: false });
    expect(result.sources[0].pin).toEqual(pin);
    for (const sources of [
      [{ ...pin, version: '2.0.0' }],
      [pin, { ...pin, projectId: 'another-project', hash: `sha256:${'b'.repeat(64)}` }],
    ]) {
      const ambiguous = schemaNodeProvenance(rows[0], rows[0], { tasks: origin }, sources);
      expect(ambiguous.sources[0].pin).toBeUndefined();
      expect(ambiguous.unknown).toBe(true);
    }
  });

  it('keeps mixed sources and local edits without duplicating a source', () => {
    const second = { ...pin, canonicalName: '@team/owner', artifactVersionId: 'owner-v1' };
    const result = schemaNodeProvenance(
      rows[0],
      rows[0],
      {
        tasks: {
          kind: 'derived',
          sources: [
            origin,
            origin,
            { kind: 'module', artifact: second.canonicalName, version: second.version },
            { kind: 'local', contributionId: 'edit', revision: 2 },
          ],
        },
      },
      [pin, second]
    );
    expect(result.sources).toHaveLength(2);
    expect(result.local).toBe(true);
  });

  it('does not inherit a parent source or use obsolete paths after a move', () => {
    expect(schemaNodeProvenance(rows[1], rows[1], { tasks: origin }, [pin]).unknown).toBe(true);
    expect(schemaNodeProvenance(rows[0], undefined, { tasks: origin }, [pin])).toMatchObject({
      sources: [],
      local: true,
    });
  });

  it('marks unpreviewed modifications and waits when provenance is unavailable', () => {
    const changed = { ...rows[0], definition: { ...rows[0].definition, required: true } };
    const result = schemaNodeProvenance(changed, rows[0], { tasks: origin }, [pin]);
    expect(result.local).toBe(true);
    expect(result.sources[0].pin).toEqual(pin);
    expect(schemaNodeProvenance(changed, rows[0], undefined, [pin])).toMatchObject({
      pending: true,
      sources: [],
    });
  });

  it('falls back to an explicitly selected whole Schema only when its origin map is empty', () => {
    expect(schemaNodeProvenance(rows[0], rows[0], {}, [pin], pin).sources[0].pin).toEqual(pin);
    expect(schemaNodeProvenance(rows[0], rows[0], {}, [pin]).unknown).toBe(true);
    expect(schemaNodeProvenance(rows[1], rows[1], { tasks: origin }, [pin], pin).unknown).toBe(
      true
    );
  });

  it('pins the release route and never treats a content hash as a Commit', () => {
    const destination = new URL(schemaSourceReleaseHref(pin), 'https://example.test');
    expect(destination.pathname).toBe('/explore');
    expect(destination.searchParams.get('catalogHash')).toBe(pin.hash);
    expect(destination.searchParams.get('catalogVersion')).toBe(pin.version);
    expect(destination.searchParams.get('sourceProjectId')).toBe(pin.projectId);
    expect(destination.searchParams.has('commit')).toBe(false);
    expect(schemaSourceKey(pin)).not.toBe(schemaSourceKey({ ...pin, projectId: null }));
  });
});
