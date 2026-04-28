/**
 * Spec ↔ schema ↔ runtime contract for op path-field metadata.
 *
 * `yops.yaml` declares which fields on each op carry YOps paths via the
 * `path_fields:` block (primary / source / destination). Four things must
 * agree:
 *
 *   1. Every op declares at least one entry in `path_fields:`. An op with
 *      no path fields is allowed in principle (e.g. a future read-only
 *      op against the document root) but every op shipped today has at
 *      least one.
 *   2. Each declared field name appears in the same op's `fields:` block,
 *      and that field is declared as `type: string`. A name that points
 *      at a non-string field (e.g. `nest.path_fields.primary: keys`,
 *      where `keys` is a sequence) would silently mis-route consumers
 *      because `getOpPaths` skips non-string runtime values.
 *   3. Only the three documented roles (`primary`, `source`,
 *      `destination`) appear in `path_fields:`.
 *   4. `OpRegistry.getOpPaths()` actually resolves each declared
 *      (op, role) pair at runtime to the exact path the op carries.
 *      Generated per op/role from the spec — not just for representative
 *      ops — so a metadata edit on, say, `populate` that breaks runtime
 *      lookup fails this test by name.
 *
 * Together these checks make sure cross-language consumers (and the
 * extractor compiler in `@t3x-dev/core`) can rely on `path_fields` as
 * the single source of truth for which fields name paths.
 */

import { describe, expect, it } from 'vitest';
import { registry, spec } from '../src/index';
import type { PathFields } from '../src/spec';

const PATH_ROLES = ['primary', 'source', 'destination'] as const;

describe('every op declares path_fields, names real string fields, and uses known roles', () => {
  for (const [opName, opSpec] of Object.entries(spec.operations)) {
    it(`${opName}: path_fields shape is well-formed`, () => {
      const declared = opSpec.path_fields;
      expect(declared, `${opName} is missing path_fields metadata`).toBeDefined();

      const roles = Object.keys(declared) as Array<keyof PathFields>;
      expect(roles.length, `${opName}: path_fields must declare at least one role`).toBeGreaterThan(
        0
      );

      const allowed = new Set<string>(PATH_ROLES);
      const unknownRoles = roles.filter((r) => !allowed.has(r));
      expect(
        unknownRoles,
        `${opName}: path_fields declares unknown role(s): ${unknownRoles.join(',')}`
      ).toEqual([]);

      for (const role of roles) {
        const fieldName = declared[role];
        expect(
          fieldName,
          `${opName}.path_fields.${role} must name a string field, got ${fieldName}`
        ).toBeTypeOf('string');

        const fieldSpec = opSpec.fields[fieldName as string];
        expect(
          fieldSpec,
          `${opName}.path_fields.${role} = "${fieldName}" but that field is not declared in ${opName}.fields`
        ).toBeDefined();

        // Path metadata that points at a non-string field would silently
        // mis-route — `getOpPaths` only emits string values, so a typo
        // like `nest.path_fields.primary: keys` (an array field) would
        // pass earlier checks but produce zero paths at runtime.
        expect(
          fieldSpec?.type,
          `${opName}.path_fields.${role} -> "${fieldName}" but ${opName}.fields.${fieldName}.type is "${fieldSpec?.type}", not "string"`
        ).toBe('string');
      }
    });
  }
});

describe('OpRegistry.getOpPaths resolves every declared op/role at runtime', () => {
  for (const [opName, opSpec] of Object.entries(spec.operations)) {
    const declared = opSpec.path_fields ?? {};
    const roles = Object.keys(declared) as Array<keyof PathFields>;

    for (const role of roles) {
      const fieldName = declared[role] as string;
      it(`${opName}.${role} (${fieldName}) resolves to the runtime path`, () => {
        const samplePath = `t_${opName}_${role}`;
        // Minimal op: only the path field for this role is set. getOpPaths
        // ignores fields not in path_fields, so other required fields can
        // be omitted — schema validation isn't part of this helper's
        // contract.
        const op = { [opName]: { [fieldName]: samplePath } };
        const result = registry.getOpPaths(op);
        expect(
          result,
          `${opName}.${role}: getOpPaths missed the declared path field`
        ).toContainEqual({
          role,
          path: samplePath,
        });
      });
    }
  }
});

describe('OpRegistry.getOpPaths op-key resolution semantics', () => {
  it('returns a primary path for a single-path op', () => {
    expect(registry.getOpPaths({ define: { path: 'config' } })).toEqual([
      { role: 'primary', path: 'config' },
    ]);
  });

  it('returns source and destination for two-path ops in declaration order', () => {
    expect(registry.getOpPaths({ move: { from: 'old', to: 'new' } })).toEqual([
      { role: 'source', path: 'old' },
      { role: 'destination', path: 'new' },
    ]);
    expect(registry.getOpPaths({ clone: { from: 'src', to: 'dst' } })).toEqual([
      { role: 'source', path: 'src' },
      { role: 'destination', path: 'dst' },
    ]);
  });

  it('skips the `source` metadata sibling when picking the op key', () => {
    const op = {
      source: { type: 'human', author: 'tester' },
      set: { path: 'a', value: 1 },
    };
    expect(registry.getOpPaths(op)).toEqual([{ role: 'primary', path: 'a' }]);
  });

  it('returns [] when the resolved op key is unknown — does NOT fall through to a later known op', () => {
    // Engine semantics: resolveOpName picks the first non-metadata key
    // ("frobnicate"), registry lookup yields UNKNOWN_OP, the op never
    // executes. getOpPaths must agree — falling through to `set` here
    // would extract a path the engine refuses to apply, reintroducing
    // the op-key-drift class fixed for `source` ordering in #926.
    const op = { frobnicate: { x: 1 }, set: { path: 'a', value: 1 } };
    expect(registry.getOpPaths(op)).toEqual([]);
  });

  it('returns [] for an entirely unknown op', () => {
    expect(registry.getOpPaths({ frobnicate: { path: 'x' } })).toEqual([]);
  });

  it('returns [] for a non-mapping op (null, scalar, array)', () => {
    expect(registry.getOpPaths(null as unknown as Record<string, unknown>)).toEqual([]);
    expect(registry.getOpPaths('not-an-op' as unknown as Record<string, unknown>)).toEqual([]);
    expect(registry.getOpPaths([] as unknown as Record<string, unknown>)).toEqual([]);
  });

  it('returns [] for malformed payloads (non-mapping inner)', () => {
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
