import { describe, expect, it } from 'vitest';
import type { SemanticContent, TreeNode } from '../../semantic/types';
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
  it('returns valid: true for clean tree', () => {
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

  it('honors ylint config overrides', () => {
    const content = sc([node('data', { tags: ['only'] })]);
    const result = validateTree(content, { lint: { enabled_forms: [3] } });

    expect(result.warnings.map((warning) => warning.form)).toEqual([3]);
    expect(result.warnings.map((warning) => warning.rule)).toEqual(['list-single-item']);
  });
});
