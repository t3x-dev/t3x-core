/**
 * Spec ↔ schema ↔ runtime contract for op path-field metadata.
 *
 * `yops.yaml` declares which fields on each op carry YOps paths via the
 * `path_fields:` block (primary / source / destination). Three things must
 * agree:
 *
 *   1. Every op declares at least one entry in `path_fields:`. An op with
 *      no path fields is allowed in principle (e.g. a future read-only
 *      op against the document root) but every op shipped today has at
 *      least one.
 *   2. Each declared field name appears in the same op's `fields:` block —
 *      otherwise the metadata names a non-existent field and consumers
 *      will silently skip it.
 *   3. `OpRegistry.getOpPaths()` returns the right paths and roles when
 *      driven against a representative op for each `path_fields` shape.
 *
 * Together these checks make sure cross-language consumers (and the
 * extractor compiler in `@t3x-dev/core`) can rely on `path_fields` as
 * the single source of truth for which fields name paths.
 */

import { describe, expect, it } from 'vitest';
import { registry, spec } from '../src/index';
import type { PathFields } from '../src/spec';

describe('every op declares path_fields and references real fields', () => {
  for (const [opName, opSpec] of Object.entries(spec.operations)) {
    it(`${opName}: path_fields is non-empty and every entry names a real field`, () => {
      const declared = opSpec.path_fields;
      expect(declared, `${opName} is missing path_fields metadata`).toBeDefined();

      const roles = Object.keys(declared) as Array<keyof PathFields>;
      expect(roles.length, `${opName}: path_fields must declare at least one role`).toBeGreaterThan(
        0
      );

      for (const role of roles) {
        const fieldName = declared[role];
        expect(
          fieldName,
          `${opName}.path_fields.${role} must name a string field, got ${fieldName}`
        ).toBeTypeOf('string');
        expect(
          opSpec.fields[fieldName as string],
          `${opName}.path_fields.${role} = "${fieldName}" but that field is not declared in ${opName}.fields`
        ).toBeDefined();
      }
    });
  }
});

describe('only known roles appear in path_fields', () => {
  const allowed = new Set(['primary', 'source', 'destination']);

  for (const [opName, opSpec] of Object.entries(spec.operations)) {
    it(`${opName}: path_fields uses only the documented roles`, () => {
      const roles = Object.keys(opSpec.path_fields ?? {});
      const unknown = roles.filter((r) => !allowed.has(r));
      expect(unknown, `${opName} declared unknown roles: ${unknown.join(',')}`).toEqual([]);
    });
  }
});

describe('OpRegistry.getOpPaths returns correctly tagged paths', () => {
  it('returns a primary path for a single-path op', () => {
    expect(registry.getOpPaths({ define: { path: 'config' } })).toEqual([
      { role: 'primary', path: 'config' },
    ]);
  });

  it('returns source and destination for move', () => {
    expect(registry.getOpPaths({ move: { from: 'old', to: 'new' } })).toEqual([
      { role: 'source', path: 'old' },
      { role: 'destination', path: 'new' },
    ]);
  });

  it('returns source and destination for clone', () => {
    expect(registry.getOpPaths({ clone: { from: 'src', to: 'dst' } })).toEqual([
      { role: 'source', path: 'src' },
      { role: 'destination', path: 'dst' },
    ]);
  });

  it('ignores `source` metadata sibling — it is not a path', () => {
    const op = {
      source: { type: 'human', author: 'tester' },
      set: { path: 'a', value: 1 },
    };
    expect(registry.getOpPaths(op)).toEqual([{ role: 'primary', path: 'a' }]);
  });

  it('returns [] for unknown ops', () => {
    expect(registry.getOpPaths({ frobnicate: { path: 'x' } })).toEqual([]);
  });

  it('returns [] for malformed ops (non-mapping payload)', () => {
    expect(registry.getOpPaths({ define: null as unknown as object })).toEqual([]);
    expect(registry.getOpPaths({ define: 'x' as unknown as object })).toEqual([]);
  });

  it('skips path fields whose value is not a non-empty string', () => {
    expect(registry.getOpPaths({ define: { path: '' } as unknown as { path: string } })).toEqual(
      []
    );
    expect(registry.getOpPaths({ define: { path: 42 } as unknown as { path: string } })).toEqual(
      []
    );
  });
});
