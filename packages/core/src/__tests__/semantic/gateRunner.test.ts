import { describe, expect, it } from 'vitest';
import { GateRunner } from '../../semantic/gateRunner';
import type { SemanticContent, TreeNode } from '../../semantic/types';

const t = (
  key: string,
  slots: Record<string, unknown> = { a: 1 },
  children: TreeNode[] = []
): TreeNode => ({
  key,
  slots,
  children,
});

describe('GateRunner', () => {
  const runner = new GateRunner();

  describe('structure gate (Gate 1)', () => {
    it('passes with valid content', async () => {
      const content: SemanticContent = {
        trees: [t('topic_a'), t('topic_b')],
        relations: [{ from: 'topic_a', to: 'topic_b', type: 'causes' }],
      };
      const result = await runner.run(content);
      expect(result.passed).toBe(true);
      expect(result.structure.passed).toBe(true);
      expect(result.structure.checks.schema_valid).toBe(true);
      expect(result.structure.checks.refs_intact).toBe(true);
      expect(result.structure.checks.relations_valid).toBe(true);
      expect(result.structure.checks.no_cycles).toBe(true);
      expect(result.structure.checks.no_duplicate_keys).toBe(true);
      expect(result.structure.checks.no_self_relations).toBe(true);
    });

    it('fails with broken relation', async () => {
      const content: SemanticContent = {
        trees: [t('topic_a')],
        relations: [{ from: 'topic_a', to: 'nonexistent', type: 'causes' }],
      };
      const result = await runner.run(content);
      expect(result.passed).toBe(false);
      expect(result.structure.passed).toBe(false);
      expect(result.structure.checks.relations_valid).toBe(false);
    });

    it('fails with duplicate keys', async () => {
      const content: SemanticContent = {
        trees: [t('topic_a'), t('topic_a')],
        relations: [],
      };
      const result = await runner.run(content);
      expect(result.passed).toBe(false);
      expect(result.structure.checks.no_duplicate_keys).toBe(false);
    });

    it('fails with self-relation', async () => {
      const content: SemanticContent = {
        trees: [t('topic_a')],
        relations: [{ from: 'topic_a', to: 'topic_a', type: 'causes' }],
      };
      const result = await runner.run(content);
      expect(result.passed).toBe(false);
      expect(result.structure.checks.no_self_relations).toBe(false);
    });

    it('fails with cycle', async () => {
      const content: SemanticContent = {
        trees: [t('topic_a'), t('topic_b')],
        relations: [
          { from: 'topic_a', to: 'topic_b', type: 'causes' },
          { from: 'topic_b', to: 'topic_a', type: 'causes' },
        ],
      };
      const result = await runner.run(content);
      expect(result.passed).toBe(false);
      expect(result.structure.checks.no_cycles).toBe(false);
    });
  });

  describe('full run with skip options', () => {
    it('runs only structure gate when semantic and business are skipped', async () => {
      const content: SemanticContent = {
        trees: [t('topic_a'), t('topic_b')],
        relations: [{ from: 'topic_a', to: 'topic_b', type: 'causes' }],
      };
      const result = await runner.run(content, {
        skipSemantic: true,
        skipBusiness: true,
      });
      expect(result.passed).toBe(true);
      expect(result.structure.passed).toBe(true);
      expect(result.semantic).toBeUndefined();
      expect(result.business).toBeUndefined();
    });

    it('skips Gate 2 when no provider is given', async () => {
      const content: SemanticContent = {
        trees: [t('topic_a')],
        relations: [],
      };
      const result = await runner.run(content, {
        turns: [{ role: 'user', content: 'hello' }],
      });
      expect(result.passed).toBe(true);
      expect(result.semantic).toBeUndefined();
    });

    it('skips Gate 3 when no business rules are given', async () => {
      const content: SemanticContent = {
        trees: [t('topic_a')],
        relations: [],
      };
      const result = await runner.run(content, {
        businessRules: [],
      });
      expect(result.passed).toBe(true);
      expect(result.business).toBeUndefined();
    });
  });

  describe('result shape', () => {
    it('returns correct GateResult shape', async () => {
      const content: SemanticContent = {
        trees: [t('topic_a')],
        relations: [],
      };
      const result = await runner.run(content);

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('structure');
      expect(typeof result.passed).toBe('boolean');

      expect(result.structure).toHaveProperty('passed');
      expect(result.structure).toHaveProperty('checks');
      expect(result.structure.checks).toHaveProperty('schema_valid');
      expect(result.structure.checks).toHaveProperty('refs_intact');
      expect(result.structure.checks).toHaveProperty('relations_valid');
      expect(result.structure.checks).toHaveProperty('no_cycles');
      expect(result.structure.checks).toHaveProperty('no_duplicate_keys');
      expect(result.structure.checks).toHaveProperty('no_self_relations');
    });

    it('still runs Gate 2/3 when Gate 1 fails (structure failure does not block)', async () => {
      const content: SemanticContent = {
        trees: [t('topic_a'), t('topic_a')], // duplicate
        relations: [],
      };
      const result = await runner.run(content, {
        turns: [{ role: 'user', content: 'test' }],
        businessRules: [{ id: 'r1', type: 'rule', rule: 'true', severity: 'error' }],
      });
      expect(result.passed).toBe(false);
      // Semantic and business still run — structure failure no longer blocks
      // (semantic may be undefined if no provider, business evaluates rules)
    });
  });
});
