/**
 * Horrible YAML E2E — test the full stack with the worst input possible.
 *
 * Proves every layer catches its class of problem:
 *   js-yaml    → parse errors (malformed YAML)
 *   applyYOps  → operation errors (can't traverse, type mismatch)
 *   validateTree → structural + domain errors (bad shape, wrong values)
 *
 * No silent failures. Every bad input gets a clear error.
 */

import type { YOp, YValue } from '@t3x-dev/yops';
import { applyYOps } from '@t3x-dev/yops';
import { parseSchemaObject } from '@t3x-dev/yschema';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { treesToYValue, yvalueToTrees } from '../../t3x-yops/convert';
import { validateTree } from '../validateTree';

// ── Helpers ──

function node(
  key: string,
  slots: Record<string, unknown> = {},
  children: TreeNode[] = []
): TreeNode {
  return { key, slots: slots as TreeNode['slots'], children };
}

function sc(trees: TreeNode[]): SemanticContent {
  return { trees, relations: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Level 1: js-yaml parser — catches completely broken YAML
// ═══════════════════════════════════════════════════════════════════════════════

describe('Level 1: YAML parser rejects garbage', () => {
  it('rejects unclosed brackets', () => {
    expect(() => yaml.load('{ broken: [}')).toThrow();
  });

  it('rejects tab indentation in block style', () => {
    const tabYaml = 'parent:\n\tchild: value';
    expect(() => yaml.load(tabYaml)).toThrow();
  });

  it('rejects duplicate keys', () => {
    const dup = 'a: 1\na: 2';
    // js-yaml throws on duplicate keys by default
    expect(() => yaml.load(dup)).toThrow(/duplicated mapping key/);
  });

  it('rejects completely invalid content', () => {
    expect(() => yaml.load(':\n  :\n    : : :')).toThrow();
  });

  it('handles empty string as null', () => {
    const result = yaml.load('');
    expect(result).toBeUndefined();
  });

  it('handles just whitespace as null', () => {
    const result = yaml.load('   \n  \n  ');
    expect(result).toBeNull();
  });

  it('parses valid but ugly YAML', () => {
    const ugly = `
a:    1
b:        "quoted with    spaces"
c:
  - item1
  -    item2
  -       item3
`;
    const result = yaml.load(ugly) as Record<string, unknown>;
    expect(result.a).toBe(1);
    expect(result.b).toBe('quoted with    spaces');
    expect(result.c).toEqual(['item1', 'item2', 'item3']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Level 2: YOps engine — catches operation errors on bad documents
// ═══════════════════════════════════════════════════════════════════════════════

describe('Level 2: YOps rejects bad operations', () => {
  it('errors when setting through a scalar intermediate', () => {
    const doc: YValue = { config: 'i am a string not a mapping' };
    const result = applyYOps(doc, [{ set: { path: 'config/host', value: 'localhost' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('INVALID_PATH');
  });

  it('errors when appending to a scalar', () => {
    const doc: YValue = { items: 'not an array' };
    const result = applyYOps(doc, [{ append: { path: 'items', value: 'new item' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_SEQUENCE');
  });

  it('errors when dropping a path that does not exist', () => {
    const doc: YValue = { a: 1 };
    const result = applyYOps(doc, [{ drop: { path: 'nonexistent/deep/path' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PATH_NOT_FOUND');
  });

  it('errors when folding a multi-child node', () => {
    const doc: YValue = { wrapper: { child1: 1, child2: 2 } };
    const result = applyYOps(doc, [{ fold: { path: 'wrapper' } }]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_FOLDABLE');
  });

  it('errors when merging non-mapping siblings', () => {
    const doc: YValue = { parent: { a: 'scalar', b: { x: 1 } } };
    const result = applyYOps(doc, [
      { merge: { path: 'parent', keys: ['a', 'b'], into: 'merged' } },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NOT_A_MAPPING');
  });

  it('errors on unknown operation', () => {
    const doc: YValue = { a: 1 };
    const result = applyYOps(doc, [{ frobnicate: { path: 'a' } } as unknown as YOp]);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_OP');
  });

  it('stops at first error (fail-fast), preserves partial state', () => {
    const doc: YValue = {};
    const result = applyYOps(doc, [
      { set: { path: 'a', value: 1 } }, // succeeds
      { set: { path: 'b', value: 2 } }, // succeeds
      { drop: { path: 'nonexistent' } }, // fails
      { set: { path: 'c', value: 3 } }, // never reached
    ]);
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(2);
    expect((result.doc as Record<string, unknown>).a).toBe(1);
    expect((result.doc as Record<string, unknown>).b).toBe(2);
    expect((result.doc as Record<string, unknown>).c).toBeUndefined();
  });

  it('rejects operations on null document', () => {
    const doc: YValue = null;
    const result = applyYOps(doc, [{ set: { path: 'a', value: 1 } }]);
    expect(result.ok).toBe(false);
  });

  it('handles empty ops array (no-op)', () => {
    const doc: YValue = { a: 1 };
    const result = applyYOps(doc, []);
    expect(result.ok).toBe(true);
    expect(result.doc).toEqual({ a: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Level 3: validateTree — catches structural and domain problems
// ═══════════════════════════════════════════════════════════════════════════════

describe('Level 3: validateTree catches bad trees', () => {
  const schema = parseSchemaObject({
    name: 'test-schema',
    strict: true,
    nodes: {
      config: {
        required: true,
        slots: {
          name: 'scalar',
          env: ['production', 'staging', 'development'],
        },
      },
    },
  });

  it('catches everything on a maximally bad tree', () => {
    const horrible: TreeNode[] = [
      // Bad key: verb + too long (ylint form 1)
      node(
        'get_all_the_important_data_items',
        {
          // Bad scalar: compound + multi-fact + too long (ylint form 2)
          description: `${'x'.repeat(150)} and also y, plus z, with a, b, c`,
          // Bad list: single item (ylint form 3)
          tags: ['lonely'],
        },
        [
          // Bad structure: single-child chain (ylint form 4)
          node('wrapper', {}, [
            // Bad key: generic (ylint form 4)
            node('data', {
              value: 'nested deep',
            }),
          ]),
        ]
      ),
      // Undeclared node (yschema strict)
      node('random_junk', { trash: true }),
    ];
    // Missing: config (yschema required)

    const result = validateTree(sc(horrible), { schema });
    expect(result.valid).toBe(false);

    // Should have warnings from BOTH layers
    const generalWarnings = result.warnings.filter((w) => typeof w.form === 'number');
    const schemaWarnings = result.warnings.filter((w) => w.form === 'schema');

    // General: verb key, long key, compound scalar, multi-fact, long scalar, single-item list, single-child chain, generic key
    expect(generalWarnings.length).toBeGreaterThanOrEqual(5);

    // Schema: missing required (config), unexpected (get_all_..., random_junk)
    expect(schemaWarnings.length).toBeGreaterThanOrEqual(2);

    // Some fixes available
    expect(result.fixes.length).toBeGreaterThan(0);

    // Some issues need human
    expect(result.manual_count).toBeGreaterThan(0);
  });

  it('catches wrong enum values', () => {
    const trees: TreeNode[] = [
      node('config', { name: 'myapp', env: 'prod' }), // 'prod' not in enum
    ];
    const result = validateTree(sc(trees), { schema });
    expect(result.valid).toBe(false);
    const enumV = result.warnings.find((w) => w.rule === 'INVALID_ENUM');
    expect(enumV).toBeDefined();
    expect(enumV!.fix).toBeDefined();
  });

  it('catches missing required nodes', () => {
    const result = validateTree(sc([]), { schema });
    expect(result.valid).toBe(false);
    const missing = result.warnings.find((w) => w.rule === 'REQUIRED_NODE');
    expect(missing).toBeDefined();
    expect(missing!.path).toBe('config');
  });

  it('passes clean tree', () => {
    const clean: TreeNode[] = [node('config', { name: 'myapp', env: 'production' })];
    const result = validateTree(sc(clean), { schema });
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Full stack: horrible input → parse → YOps fail → fix → validate → commit-ready
// ═══════════════════════════════════════════════════════════════════════════════

describe('Full stack: horrible input to clean commit', () => {
  const schema = parseSchemaObject({
    name: 'project',
    strict: true,
    nodes: {
      project_info: {
        required: true,
        slots: {
          name: 'scalar',
          status: ['active', 'archived'],
        },
      },
      stack: {
        required: true,
        children: 'any',
        each_child: {
          slots: {
            version: 'scalar',
          },
        },
      },
    },
  });

  it('scenario: user pastes garbage YAML, we guide them to clean', () => {
    // Step 1: User pastes raw YAML string — parser handles it
    const rawYaml = `
project_info:
  name: My Project
  status: wip
  notes: "this is a long note and it has conjunctions and also commas, lots, of, them"
stack:
  react:
    version: "18"
  vue:
    version: "3"
junk_node:
  temp: true
another_junk:
  scratch: delete me
`;
    // Parse succeeds — YAML is valid, just has bad content
    const parsed = yaml.load(rawYaml) as YValue;
    expect(parsed).toBeDefined();

    // Step 2: Try a bad YOps operation — engine catches it
    const badOp = applyYOps(parsed, [
      { set: { path: 'project_info/status/nested', value: 'cant set through scalar' } },
    ]);
    expect(badOp.ok).toBe(false);
    expect(badOp.error?.code).toBe('INVALID_PATH');
    // User sees error, tries a valid op instead

    // Step 3: Apply valid YOps to fix what they can manually
    const manualFix = applyYOps(parsed, [
      { set: { path: 'project_info/status', value: 'active' } }, // fix enum
    ]);
    expect(manualFix.ok).toBe(true);

    // Step 4: validateTree catches remaining issues
    const trees = yvalueToTrees(manualFix.doc);
    const r1 = validateTree(sc(trees), { schema });
    // valid is true because undeclared nodes are warn (not error),
    // and ylint compound/multi-fact are also warn/info
    expect(r1.warnings.length).toBeGreaterThan(0);

    // General: compound scalar ("and"), multi-fact scalar (",")
    const compounds = r1.warnings.filter((w) => w.rule === 'scalar-compound');
    expect(compounds.length).toBeGreaterThanOrEqual(1);

    const multiFacts = r1.warnings.filter((w) => w.rule === 'scalar-multi-fact');
    expect(multiFacts.length).toBeGreaterThanOrEqual(1);

    // Schema: undeclared nodes (junk_node, another_junk)
    const undeclared = r1.warnings.filter((w) => w.rule === 'UNEXPECTED_NODE');
    expect(undeclared.length).toBe(2);
    expect(undeclared.every((w) => w.fix !== undefined)).toBe(true);

    // Step 5: Apply auto-fixes iteratively
    let current = manualFix.doc;
    for (let i = 0; i < 3; i++) {
      const currentTrees = yvalueToTrees(current);
      const validation = validateTree(sc(currentTrees), { schema });
      if (validation.fixes.length === 0) break;

      for (const fix of validation.fixes) {
        const r = applyYOps(current, [fix]);
        if (r.ok) current = r.doc;
      }
    }

    // Step 6: Re-validate
    const finalTrees = yvalueToTrees(current);
    const rFinal = validateTree(sc(finalTrees), { schema });

    // Undeclared nodes gone
    const finalUndeclared = rFinal.warnings.filter((w) => w.rule === 'UNEXPECTED_NODE');
    expect(finalUndeclared).toHaveLength(0);

    // Verify the doc
    const finalDoc = current as Record<string, unknown>;
    expect(finalDoc.junk_node).toBeUndefined();
    expect(finalDoc.another_junk).toBeUndefined();
    expect((finalDoc.project_info as Record<string, unknown>).name).toBe('My Project');
    expect((finalDoc.project_info as Record<string, unknown>).status).toBe('active');

    // Step 7: What remains for human? Compound scalar, multi-fact
    const humanTasks = rFinal.warnings.filter(
      (w) => w.fix === undefined && (w.severity === 'warn' || w.severity === 'info')
    );
    expect(humanTasks.length).toBeGreaterThanOrEqual(1);

    // Schema errors should be zero now — commit-ready
    const schemaErrors = rFinal.warnings.filter(
      (w) => w.form === 'schema' && w.severity === 'error'
    );
    expect(schemaErrors).toHaveLength(0);
  });

  it('scenario: completely empty input — build from nothing', () => {
    const empty: YValue = {};

    // validateTree tells us what's needed
    const r1 = validateTree(sc([]), { schema });
    expect(r1.valid).toBe(false);

    // Missing: info, stack
    const missing = r1.warnings.filter((w) => w.rule === 'REQUIRED_NODE');
    expect(missing.length).toBe(2);

    // Auto-fix: create required nodes
    let current: YValue = empty;
    for (const fix of r1.fixes) {
      const r = applyYOps(current, [fix]);
      if (r.ok) current = r.doc;
    }

    // Now fill slots manually
    const withSlots = applyYOps(current, [
      { set: { path: 'project_info/name', value: 'New Project' } },
      { set: { path: 'project_info/status', value: 'active' } },
    ]);
    expect(withSlots.ok).toBe(true);

    // Add a tech stack entry
    const withStack = applyYOps(withSlots.doc, [
      { set: { path: 'stack/typescript', value: { version: '5.9' } } },
    ]);
    expect(withStack.ok).toBe(true);

    // Final validation
    const finalTrees = yvalueToTrees(withStack.doc);
    const rFinal = validateTree(sc(finalTrees), { schema });
    expect(rFinal.valid).toBe(true);
    expect(rFinal.warnings).toHaveLength(0);
  });

  it('scenario: valid YAML but every value is wrong type', () => {
    // All values are the wrong type for the schema
    const wrongTypes: YValue = {
      project_info: {
        name: ['should', 'be', 'scalar'], // array instead of scalar
        status: { nested: 'mapping' }, // mapping instead of enum scalar
      },
      stack: {
        react: {
          version: 18, // number — technically scalar, schema says scalar, so ok
        },
      },
    };

    const trees = yvalueToTrees(wrongTypes);
    const result = validateTree(sc(trees), { schema });

    // name is a list in a slot position — after YValue→TreeNode conversion,
    // arrays become slot values (not children), so type check should catch it
    // status is a mapping — becomes a child node, not a slot
    // These structural mismatches will show up as missing required slots
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('scenario: deeply nested garbage — 10 levels deep', () => {
    // Build a 10-level deep single-child chain
    let current: TreeNode = node('leaf', { value: 'deep' });
    for (let i = 9; i >= 0; i--) {
      current = node(`level_${i}`, {}, [current]);
    }

    const result = validateTree(sc([current]), { schema });

    // ylint should catch: depth exceeded, single-child chains
    const depthWarnings = result.warnings.filter((w) => w.rule === 'depth-exceeded');
    expect(depthWarnings.length).toBeGreaterThan(0);

    const chainWarnings = result.warnings.filter((w) => w.rule === 'single-child-chain');
    expect(chainWarnings.length).toBeGreaterThan(0);
    // Chains should have fold fixes
    expect(chainWarnings.every((w) => w.fix !== undefined)).toBe(true);

    // Schema should catch: level_0 is undeclared (strict)
    const undeclared = result.warnings.filter((w) => w.rule === 'UNEXPECTED_NODE');
    expect(undeclared.length).toBeGreaterThan(0);
  });

  it('scenario: 100 undeclared nodes — strict mode cleans all', () => {
    const junkNodes: TreeNode[] = [];
    for (let i = 0; i < 100; i++) {
      junkNodes.push(node(`junk_${i}`, { value: i }));
    }
    // Add required nodes too
    junkNodes.push(node('project_info', { name: 'test', status: 'active' }));
    junkNodes.push(node('stack', {}, [node('node', { version: '22' })]));

    const result = validateTree(sc(junkNodes), { schema });

    // 100 undeclared nodes
    const undeclared = result.warnings.filter((w) => w.rule === 'UNEXPECTED_NODE');
    expect(undeclared.length).toBe(100);

    // All have drop fixes
    expect(undeclared.every((w) => w.fix !== undefined)).toBe(true);

    // Apply all fixes
    let current = treesToYValue(junkNodes);
    for (const fix of result.fixes) {
      const r = applyYOps(current, [fix]);
      if (r.ok) current = r.doc;
    }

    // Re-validate — should be clean
    const finalTrees = yvalueToTrees(current);
    const rFinal = validateTree(sc(finalTrees), { schema });

    const remaining = rFinal.warnings.filter((w) => w.rule === 'UNEXPECTED_NODE');
    expect(remaining).toHaveLength(0);

    // Only info and stack remain
    const doc = current as Record<string, unknown>;
    expect(Object.keys(doc).sort()).toEqual(['project_info', 'stack']);
  });
});
