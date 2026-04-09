import type { YValue } from '@t3x-dev/yops';
import { applyYOps } from '@t3x-dev/yops';
import { describe, expect, it } from 'vitest';
import type { Schema } from '../src/index';
import { buildFixPlan, parseSchema, parseSchemaObject, validateSchema } from '../src/index';

// ── Helper: quick schema ──

function schema(
  nodes: Schema['nodes'],
  opts?: { strict?: boolean; rules?: Schema['rules'] }
): Schema {
  return parseSchemaObject({
    name: 'test',
    nodes,
    strict: opts?.strict ?? false,
    rules: opts?.rules ?? [],
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Required nodes
// ═══════════════════════════════════════════════════════════════════════════════

describe('required nodes', () => {
  const s = schema({
    preferences: { required: true, slots: { theme: 'scalar' } },
    metadata: { required: false },
  });

  it('passes when required node exists', () => {
    const doc: YValue = { preferences: { theme: 'dark' } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('fails when required node is missing', () => {
    const doc: YValue = { metadata: {} };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].code).toBe('REQUIRED_NODE');
    expect(r.violations[0].path).toBe('preferences');
  });

  it('emits define fix for missing required node', () => {
    const doc: YValue = {};
    const r = validateSchema(doc, s);
    expect(r.violations[0].fix).toEqual([{ define: { path: 'preferences' } }]);
  });

  it('does not fail when optional node is missing', () => {
    const doc: YValue = { preferences: { theme: 'x' } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Slot validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('slot validation', () => {
  const s = schema({
    config: {
      slots: {
        theme: ['dark', 'light', 'system'],
        language: 'scalar',
        tags: 'list',
      },
    },
  });

  it('passes with valid enum value', () => {
    const doc: YValue = { config: { theme: 'dark', language: 'en', tags: ['a'] } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
  });

  it('fails on invalid enum value', () => {
    const doc: YValue = { config: { theme: 'blue', language: 'en', tags: [] } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    const v = r.violations.find((v) => v.code === 'INVALID_ENUM');
    expect(v).toBeDefined();
    expect(v!.path).toBe('config/theme');
  });

  it('emits set fix for invalid enum', () => {
    const doc: YValue = { config: { theme: 'blue', language: 'en', tags: [] } };
    const r = validateSchema(doc, s);
    const v = r.violations.find((v) => v.code === 'INVALID_ENUM');
    expect(v!.fix).toEqual([{ set: { path: 'config/theme', value: 'dark' } }]);
  });

  it('fails when required slot is missing', () => {
    const doc: YValue = { config: { language: 'en', tags: [] } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    const v = r.violations.find((v) => v.code === 'REQUIRED_SLOT');
    expect(v).toBeDefined();
    expect(v!.path).toBe('config/theme');
  });

  it('fails when scalar expected but got list', () => {
    const doc: YValue = { config: { theme: 'dark', language: ['en', 'fr'], tags: [] } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    const v = r.violations.find((v) => v.code === 'INVALID_TYPE');
    expect(v).toBeDefined();
    expect(v!.path).toBe('config/language');
  });

  it('fails when list expected but got scalar', () => {
    const doc: YValue = { config: { theme: 'dark', language: 'en', tags: 'not-a-list' } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    const v = r.violations.find((v) => v.code === 'INVALID_TYPE');
    expect(v!.path).toBe('config/tags');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Slot defaults and ranges
// ═══════════════════════════════════════════════════════════════════════════════

describe('slot defaults and ranges', () => {
  it('emits default value in fix for missing required slot', () => {
    const s = schema({
      config: {
        slots: {
          theme: { type: 'scalar', required: true, default: 'system' },
        },
      },
    });
    const doc: YValue = { config: {} };
    const r = validateSchema(doc, s);
    expect(r.violations[0].fix).toEqual([{ set: { path: 'config/theme', value: 'system' } }]);
  });

  it('detects value below min', () => {
    const s = schema({
      config: {
        slots: {
          timeout: { type: 'scalar', min: 1, max: 300 },
        },
      },
    });
    const doc: YValue = { config: { timeout: 0 } };
    const r = validateSchema(doc, s);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].code).toBe('INVALID_RANGE');
  });

  it('detects value above max', () => {
    const s = schema({
      config: {
        slots: {
          timeout: { type: 'scalar', min: 1, max: 300 },
        },
      },
    });
    const doc: YValue = { config: { timeout: 999 } };
    const r = validateSchema(doc, s);
    expect(r.violations[0].code).toBe('INVALID_RANGE');
  });

  it('detects list below min length', () => {
    const s = schema({
      config: {
        slots: {
          tags: { type: 'list', min: 2 },
        },
      },
    });
    const doc: YValue = { config: { tags: ['only-one'] } };
    const r = validateSchema(doc, s);
    expect(r.violations[0].code).toBe('INVALID_RANGE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Children and each_child
// ═══════════════════════════════════════════════════════════════════════════════

describe('children and each_child', () => {
  it('validates declared children recursively', () => {
    const s = schema({
      config: {
        children: {
          database: {
            required: true,
            slots: { host: 'scalar' },
          },
        },
      },
    });
    const doc: YValue = { config: {} };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    expect(r.violations[0].code).toBe('REQUIRED_NODE');
    expect(r.violations[0].path).toBe('config/database');
  });

  it('validates each_child template against all dynamic children', () => {
    const s = schema({
      decisions: {
        children: 'any',
        each_child: {
          slots: {
            choice: 'scalar',
            reason: 'scalar',
          },
        },
      },
    });
    const doc: YValue = {
      decisions: {
        pick_db: { choice: 'postgres', reason: 'reliability' },
        pick_lang: { choice: 'typescript' }, // missing reason
      },
    };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    const v = r.violations.find((v) => v.path === 'decisions/pick_lang/reason');
    expect(v).toBeDefined();
    expect(v!.code).toBe('REQUIRED_SLOT');
  });

  it('passes when all dynamic children match template', () => {
    const s = schema({
      decisions: {
        children: 'any',
        each_child: {
          slots: { choice: 'scalar' },
        },
      },
    });
    const doc: YValue = {
      decisions: {
        a: { choice: 'x' },
        b: { choice: 'y' },
      },
    };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Strict mode
// ═══════════════════════════════════════════════════════════════════════════════

describe('strict mode', () => {
  it('allows undeclared nodes when strict is false', () => {
    const s = schema({ config: {} }, { strict: false });
    const doc: YValue = { config: {}, extra: 'stuff' };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
  });

  it('flags undeclared nodes when strict is true', () => {
    const s = schema({ config: {} }, { strict: true });
    const doc: YValue = { config: {}, extra: 'stuff' };
    const r = validateSchema(doc, s);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].code).toBe('UNEXPECTED_NODE');
    expect(r.violations[0].path).toBe('extra');
  });

  it('emits drop fix for unexpected nodes', () => {
    const s = schema({ config: {} }, { strict: true });
    const doc: YValue = { config: {}, extra: 'stuff' };
    const r = validateSchema(doc, s);
    expect(r.violations[0].fix).toEqual([{ drop: { path: 'extra' } }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rules
// ═══════════════════════════════════════════════════════════════════════════════

describe('rules', () => {
  it('must_have: fails when slot is missing', () => {
    const s = schema(
      { decisions: { children: 'any' } },
      {
        rules: [
          {
            id: 'needs-reason',
            if: 'decisions/*',
            must_have: ['reason'],
            severity: 'error',
            message: "Decision '{{path}}' needs a reason",
          },
        ],
      }
    );
    const doc: YValue = { decisions: { pick_db: { choice: 'pg' } } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    expect(r.violations[0].code).toBe('RULE_VIOLATION');
    expect(r.violations[0].message).toContain('decisions/pick_db');
  });

  it('must_have: passes when slot exists', () => {
    const s = schema(
      { decisions: { children: 'any' } },
      {
        rules: [
          {
            id: 'needs-reason',
            if: 'decisions/*',
            must_have: ['reason'],
          },
        ],
      }
    );
    const doc: YValue = { decisions: { pick_db: { choice: 'pg', reason: 'fast' } } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
  });

  it('must_not_have: fails when forbidden slot exists', () => {
    const s = schema(
      { config: {} },
      {
        rules: [
          {
            id: 'no-secrets',
            if: 'config',
            must_not_have: ['password', 'secret'],
            severity: 'error',
          },
        ],
      }
    );
    const doc: YValue = { config: { host: 'x', password: '123' } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
  });

  it('requires: fails when dependency is missing', () => {
    const s = schema(
      { preferences: {}, decisions: {} },
      {
        rules: [
          {
            id: 'deps',
            if: 'decisions',
            requires: ['preferences'],
            severity: 'warn',
            fix: [{ define: { path: 'preferences' } }],
          },
        ],
      }
    );
    const doc: YValue = { decisions: {} };
    const r = validateSchema(doc, s);
    expect(r.violations[0].code).toBe('RULE_VIOLATION');
    expect(r.violations[0].fix).toEqual([{ define: { path: 'preferences' } }]);
  });

  it('requires: passes when dependency exists', () => {
    const s = schema(
      { preferences: {}, decisions: {} },
      {
        rules: [
          {
            id: 'deps',
            if: 'decisions',
            requires: ['preferences'],
          },
        ],
      }
    );
    const doc: YValue = { preferences: {}, decisions: {} };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
  });

  it('max_children: fails when exceeded', () => {
    const s = schema(
      { tags: {} },
      {
        rules: [
          {
            id: 'max-tags',
            if: 'tags',
            max_children: 3,
            severity: 'warn',
          },
        ],
      }
    );
    const doc: YValue = { tags: { a: 1, b: 2, c: 3, d: 4 } };
    const r = validateSchema(doc, s);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].code).toBe('RULE_VIOLATION');
  });

  it('not_empty: fails on empty node', () => {
    const s = schema(
      { config: {} },
      {
        rules: [
          {
            id: 'no-empty',
            if: 'config',
            not_empty: true,
            severity: 'warn',
          },
        ],
      }
    );
    const doc: YValue = { config: {} };
    const r = validateSchema(doc, s);
    expect(r.violations).toHaveLength(1);
  });

  it('wildcard matches all children', () => {
    const s = schema(
      { items: { children: 'any' } },
      {
        rules: [
          {
            id: 'all-need-name',
            if: 'items/*',
            must_have: ['name'],
          },
        ],
      }
    );
    const doc: YValue = { items: { a: { name: 'x' }, b: { name: 'y' }, c: {} } };
    const r = validateSchema(doc, s);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].message).toContain('items/c');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fix plan + YOps integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('fix plan + YOps integration', () => {
  it('buildFixPlan collects fixable violations', () => {
    const s = schema({
      preferences: { required: true, slots: { theme: ['dark', 'light'] } },
    });
    const doc: YValue = {};
    const r = validateSchema(doc, s);
    const plan = buildFixPlan(r);
    expect(plan.fixes_count).toBeGreaterThan(0);
    expect(plan.ops.length).toBeGreaterThan(0);
  });

  it('buildFixPlan counts manual violations', () => {
    const s = schema({
      config: {
        slots: {
          host: 'scalar',
          tags: { type: 'list' },
        },
      },
    });
    // host is missing (fixable with enum/default), tags is wrong type (not fixable)
    const doc: YValue = { config: { tags: 'not-a-list' } };
    const r = validateSchema(doc, s);
    const plan = buildFixPlan(r);
    expect(plan.manual_count).toBeGreaterThan(0);
  });

  it('applying fix plan resolves violations', () => {
    const s = schema({
      preferences: {
        required: true,
        slots: {
          theme: { type: 'scalar', enum: ['dark', 'light'], default: 'dark' },
        },
      },
    });
    const doc: YValue = {};

    // Validate → get violations
    const r1 = validateSchema(doc, s);
    expect(r1.valid).toBe(false);

    // Build fix plan
    const plan = buildFixPlan(r1);
    expect(plan.ops.length).toBeGreaterThan(0);

    // Apply fixes via YOps
    const fixed = applyYOps(doc, plan.ops);
    expect(fixed.ok).toBe(true);

    // Re-validate → should pass (or have fewer violations)
    const r2 = validateSchema(fixed.doc, s);
    // The define creates the node but doesn't populate slots,
    // so we may still have REQUIRED_SLOT — but REQUIRED_NODE is gone
    const nodeViolations = r2.violations.filter((v) => v.code === 'REQUIRED_NODE');
    expect(nodeViolations).toHaveLength(0);
  });

  it('full round-trip: validate → fix → validate → clean', () => {
    const s = schema({
      config: {
        required: true,
        slots: {
          theme: { type: 'scalar', enum: ['dark', 'light'], default: 'light' },
          lang: { type: 'scalar', default: 'en' },
        },
      },
    });

    // Start with invalid doc
    const doc: YValue = { config: { theme: 'blue' } };

    // First pass: find violations
    const r1 = validateSchema(doc, s);
    expect(r1.valid).toBe(false);

    // Build and apply fixes
    const plan = buildFixPlan(r1);
    const fixed = applyYOps(doc, plan.ops);
    expect(fixed.ok).toBe(true);

    // Second pass: all fixed
    const r2 = validateSchema(fixed.doc, s);
    expect(r2.valid).toBe(true);
    expect(r2.violations).toHaveLength(0);

    // Verify the actual values
    expect((fixed.doc as Record<string, Record<string, unknown>>).config.theme).toBe('dark'); // first enum value
    expect((fixed.doc as Record<string, Record<string, unknown>>).config.lang).toBe('en'); // default
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('empty schema passes any doc', () => {
    const s = schema({});
    const doc: YValue = { anything: { goes: true } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
  });

  it('empty doc against empty schema passes', () => {
    const s = schema({});
    const doc: YValue = {};
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
  });

  it('node exists but is not a mapping — emits INVALID_TYPE', () => {
    const s = schema({
      config: { slots: { host: 'scalar' } },
    });
    const doc: YValue = { config: 'just-a-string' };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].code).toBe('INVALID_TYPE');
    expect(r.violations[0].path).toBe('config');
  });

  it('multiple violations in one pass', () => {
    const s = schema({
      a: { required: true },
      b: { required: true },
      c: { required: true },
    });
    const doc: YValue = {};
    const r = validateSchema(doc, s);
    expect(r.violations).toHaveLength(3);
    expect(r.violations.every((v) => v.code === 'REQUIRED_NODE')).toBe(true);
  });

  it('deeply nested children validation', () => {
    const s = schema({
      a: {
        children: {
          b: {
            children: {
              c: {
                required: true,
                slots: { val: 'scalar' },
              },
            },
          },
        },
      },
    });
    const doc: YValue = { a: { b: {} } };
    const r = validateSchema(doc, s);
    expect(r.violations[0].path).toBe('a/b/c');
  });

  it('boolean and number slot values pass scalar check', () => {
    const s = schema({
      config: {
        slots: {
          enabled: 'scalar',
          count: 'scalar',
        },
      },
    });
    const doc: YValue = { config: { enabled: true, count: 42 } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
  });

  it('null slot value passes scalar check', () => {
    const s = schema({
      config: {
        slots: { value: 'scalar' },
      },
    });
    const doc: YValue = { config: { value: null } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(true);
  });

  it('node with children declared but value is a list — emits INVALID_TYPE', () => {
    const s = schema({
      config: { children: { sub: { slots: { x: 'scalar' } } } },
    });
    const doc: YValue = { config: ['a', 'b'] };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    expect(r.violations[0].code).toBe('INVALID_TYPE');
    expect(r.violations[0].message).toContain('list');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHILD_MISMATCH (each_child with non-mapping children)
// ═══════════════════════════════════════════════════════════════════════════════

describe('CHILD_MISMATCH', () => {
  it('emits CHILD_MISMATCH when each_child child is a scalar', () => {
    const s = schema({
      items: {
        children: 'any',
        each_child: { slots: { name: 'scalar' } },
      },
    });
    const doc: YValue = { items: { a: { name: 'x' }, b: 'just-a-string' } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    const v = r.violations.find((v) => v.code === 'CHILD_MISMATCH');
    expect(v).toBeDefined();
    expect(v!.path).toBe('items/b');
  });

  it('emits CHILD_MISMATCH when each_child child is a list', () => {
    const s = schema({
      items: {
        children: 'any',
        each_child: { slots: { val: 'scalar' } },
      },
    });
    const doc: YValue = { items: { a: { val: 1 }, b: [1, 2, 3] } };
    const r = validateSchema(doc, s);
    const v = r.violations.find((v) => v.code === 'CHILD_MISMATCH');
    expect(v).toBeDefined();
    expect(v!.path).toBe('items/b');
    expect(v!.message).toContain('list');
  });

  it('does not emit CHILD_MISMATCH for valid mapping children', () => {
    const s = schema({
      items: {
        children: 'any',
        each_child: { slots: { val: 'scalar' } },
      },
    });
    const doc: YValue = { items: { a: { val: 1 }, b: { val: 2 } } };
    const r = validateSchema(doc, s);
    expect(r.violations.filter((v) => v.code === 'CHILD_MISMATCH')).toHaveLength(0);
  });

  it('emits CHILD_MISMATCH when each_child child is null', () => {
    const s = schema({
      items: {
        children: 'any',
        each_child: { slots: { val: 'scalar' } },
      },
    });
    const doc: YValue = { items: { a: { val: 1 }, b: null } };
    const r = validateSchema(doc, s);
    const v = r.violations.find((v) => v.code === 'CHILD_MISMATCH');
    expect(v).toBeDefined();
    expect(v!.message).toContain('null');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// must_have on non-mapping values
// ═══════════════════════════════════════════════════════════════════════════════

describe('must_have on non-mapping', () => {
  it('fails when must_have target is a scalar', () => {
    const s = schema(
      { items: { children: 'any' } },
      {
        rules: [{ id: 'need-name', if: 'items/*', must_have: ['name'], severity: 'error' }],
      }
    );
    const doc: YValue = { items: { a: { name: 'x' }, b: 'just-a-string' } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    const v = r.violations.find((v) => v.message.includes('not a mapping'));
    expect(v).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Wildcard pattern validation (M1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('wildcard patterns', () => {
  it('rejects mid-path wildcard "a/*/b"', () => {
    const s = schema(
      { items: { children: 'any' } },
      {
        rules: [{ id: 'mid-wild', if: 'items/*/sub', must_have: ['x'] }],
      }
    );
    const doc: YValue = { items: { a: { sub: {} } } };
    const r = validateSchema(doc, s);
    // Should not match anything — pattern is unsupported
    expect(r.violations.filter((v) => v.code === 'RULE_VIOLATION')).toHaveLength(0);
  });

  it('rejects double wildcard "a/*/b/*"', () => {
    const s = schema(
      { items: { children: 'any' } },
      {
        rules: [{ id: 'double-wild', if: 'items/*/sub/*', must_have: ['x'] }],
      }
    );
    const doc: YValue = { items: { a: { sub: { c: {} } } } };
    const r = validateSchema(doc, s);
    expect(r.violations.filter((v) => v.code === 'RULE_VIOLATION')).toHaveLength(0);
  });

  it('accepts valid trailing wildcard "items/*"', () => {
    const s = schema(
      { items: { children: 'any' } },
      {
        rules: [{ id: 'need-name', if: 'items/*', must_have: ['name'], severity: 'error' }],
      }
    );
    const doc: YValue = { items: { a: { name: 'x' }, b: {} } };
    const r = validateSchema(doc, s);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].message).toContain('items/b');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// one_of type guard (L1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('one_of type guard', () => {
  it('reports clear error when one_of applied to a mapping', () => {
    const s = schema(
      { config: {} },
      {
        rules: [{ id: 'check-val', if: 'config', one_of: ['a', 'b'], severity: 'error' }],
      }
    );
    const doc: YValue = { config: { nested: true } };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    const v = r.violations[0];
    expect(v.code).toBe('RULE_VIOLATION');
    expect(v.message).toContain('mapping');
    expect(v.message).toContain('scalar');
  });

  it('reports clear error when one_of applied to a list', () => {
    const s = schema(
      { tags: {} },
      {
        rules: [{ id: 'check-val', if: 'tags', one_of: ['x', 'y'], severity: 'error' }],
      }
    );
    const doc: YValue = { tags: ['a', 'b'] };
    const r = validateSchema(doc, s);
    expect(r.valid).toBe(false);
    expect(r.violations[0].message).toContain('list');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// parseSchema YAML input validation (L2 + L3)
// ═══════════════════════════════════════════════════════════════════════════════

describe('parseSchema from YAML string', () => {
  it('parses valid YAML schema', () => {
    const s = parseSchema('name: test\nnodes:\n  config:\n    slots:\n      x: scalar\n');
    expect(s.name).toBe('test');
    expect(s.nodes.config).toBeDefined();
  });

  it('throws on empty string', () => {
    expect(() => parseSchema('')).toThrow('mapping');
  });

  it('throws on scalar YAML', () => {
    expect(() => parseSchema('just a string')).toThrow('mapping');
  });

  it('throws on array YAML', () => {
    expect(() => parseSchema('- item1\n- item2')).toThrow('mapping');
  });

  it('throws on YAML with missing name', () => {
    expect(() => parseSchema('nodes:\n  config: {}\n')).toThrow('name');
  });

  it('throws on YAML with missing nodes', () => {
    expect(() => parseSchema('name: test\n')).toThrow('nodes');
  });

  it('throws when nodes is an array', () => {
    expect(() => parseSchema('name: test\nnodes:\n  - a\n  - b\n')).toThrow('mapping');
  });

  it('throws on invalid slot definition (number)', () => {
    expect(() =>
      parseSchemaObject({
        name: 'test',
        nodes: { config: { slots: { x: 42 } } },
      })
    ).toThrow('Invalid slot definition');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Rule fix {{path}} interpolation (L4)
// ═══════════════════════════════════════════════════════════════════════════════

describe('rule fix {{path}} interpolation', () => {
  it('replaces {{path}} in fix ops with matched path', () => {
    const s = schema(
      { items: { children: 'any' } },
      {
        rules: [
          {
            id: 'needs-status',
            if: 'items/*',
            must_have: ['status'],
            severity: 'error',
            fix: [{ set: { path: '{{path}}/status', value: 'pending' } }],
          },
        ],
      }
    );
    const doc: YValue = { items: { task_a: { name: 'x' }, task_b: { name: 'y' } } };
    const r = validateSchema(doc, s);

    // Both tasks missing status → 2 violations with interpolated fix paths
    expect(r.violations).toHaveLength(2);
    const fixes = r.violations.map((v) => v.fix);
    const fixPaths = fixes.map((f) => (f![0] as { set: { path: string } }).set.path).sort();
    expect(fixPaths).toEqual(['items/task_a/status', 'items/task_b/status']);
  });

  it('leaves fix ops unchanged when no {{path}} placeholder', () => {
    const s = schema(
      { config: {} },
      {
        rules: [
          {
            id: 'need-dep',
            if: 'config',
            requires: ['database'],
            fix: [{ define: { path: 'database' } }],
          },
        ],
      }
    );
    const doc: YValue = { config: {} };
    const r = validateSchema(doc, s);
    expect(r.violations[0].fix).toEqual([{ define: { path: 'database' } }]);
  });
});
