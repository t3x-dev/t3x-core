import { applyYOps } from '@t3x-dev/yops';
import { parseSchemaObject } from '@t3x-dev/yschema';
import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
import { treesToYValue, yvalueToTrees } from '../../t3x-yops/convert';
import { validateTree } from '../validateTree';

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

describe('validateTree', () => {
  it('returns valid: true for clean tree without schema', () => {
    const content = sc([node('budget', { amount: 'fifty' })]);
    const result = validateTree(content);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.fixes).toHaveLength(0);
    expect(result.manual_count).toBe(0);
  });

  it('catches ylint general issues without schema', () => {
    // single-child chain: a → b
    const content = sc([node('a', {}, [node('b')])]);
    const result = validateTree(content);
    expect(result.warnings.length).toBeGreaterThan(0);
    const chain = result.warnings.find((w) => w.rule === 'single-child-chain');
    expect(chain).toBeDefined();
    expect(chain!.fix).toBeDefined();
    expect(result.fixes.length).toBeGreaterThan(0);
  });

  it('catches yschema violations when schema provided', () => {
    const schema = parseSchemaObject({
      name: 'test',
      nodes: {
        config: {
          required: true,
          slots: { theme: ['dark', 'light'] },
        },
      },
    });

    const content = sc([node('config', { theme: 'blue' })]);
    const result = validateTree(content, { schema });
    expect(result.valid).toBe(false);

    const enumWarning = result.warnings.find((w) => w.rule === 'INVALID_ENUM');
    expect(enumWarning).toBeDefined();
    expect(enumWarning!.form).toBe('schema');
    expect(result.fixes.length).toBeGreaterThan(0);
  });

  it('combines ylint + yschema warnings in one result', () => {
    const schema = parseSchemaObject({
      name: 'test',
      nodes: {
        config: {
          required: true,
          slots: { mode: ['fast', 'slow'] },
        },
      },
    });

    // ylint issue: single-item list + yschema issue: wrong enum
    const content = sc([node('config', { mode: 'turbo', tags: ['only'] })]);
    const result = validateTree(content, { schema });

    const generalWarnings = result.warnings.filter((w) => typeof w.form === 'number');
    const schemaWarnings = result.warnings.filter((w) => w.form === 'schema');

    expect(generalWarnings.length).toBeGreaterThan(0);
    expect(schemaWarnings.length).toBeGreaterThan(0);
  });

  it('fixes from both layers can be applied via applyYOps', () => {
    const schema = parseSchemaObject({
      name: 'test',
      nodes: {
        config: {
          required: true,
          slots: {
            theme: { type: 'scalar', enum: ['dark', 'light'], default: 'dark' },
          },
        },
      },
    });

    const content = sc([node('config', { theme: 'blue', items: ['only'] })]);
    const result = validateTree(content, { schema });
    expect(result.fixes.length).toBeGreaterThan(0);

    // Apply all fixes
    const doc = treesToYValue(content.trees);
    const fixed = applyYOps(doc, result.fixes);
    expect(fixed.ok).toBe(true);

    // Re-validate
    const fixedTrees = yvalueToTrees(fixed.doc);
    const reResult = validateTree(sc(fixedTrees), { schema });

    // Enum should be fixed
    const enumWarning = reResult.warnings.find((w) => w.rule === 'INVALID_ENUM');
    expect(enumWarning).toBeUndefined();
  });

  it('counts manual issues correctly', () => {
    const schema = parseSchemaObject({
      name: 'test',
      nodes: {
        config: {
          required: true,
          slots: { url: 'scalar' }, // no default, not fixable
        },
      },
    });

    const content = sc([node('config', {})]); // url missing
    const result = validateTree(content, { schema });
    expect(result.manual_count).toBeGreaterThan(0);
  });

  it('missing required node detected via schema', () => {
    const schema = parseSchemaObject({
      name: 'test',
      nodes: {
        required_node: { required: true },
      },
    });

    const content = sc([]); // empty
    const result = validateTree(content, { schema });
    expect(result.valid).toBe(false);

    const missing = result.warnings.find((w) => w.rule === 'REQUIRED_NODE');
    expect(missing).toBeDefined();
    expect(missing!.fix).toBeDefined();
  });
});
