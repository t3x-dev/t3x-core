import { describe, expect, it } from 'vitest';
import { GateRunner } from '../../semantic/gateRunner';
import type { SemanticContent } from '../../semantic/types';

const frame = (id: string, slots: Record<string, unknown> = { a: 1 }) => ({
  id,
  type: 'test',
  slots,
});

describe('GateRunner', () => {
  const runner = new GateRunner();

  describe('structure gate (Gate 1)', () => {
    it('passes with valid content', async () => {
      const content: SemanticContent = {
        frames: [frame('f_001'), frame('f_002')],
        relations: [{ from: 'f_001', to: 'f_002', type: 'causes' }],
      };
      const result = await runner.run(content);
      expect(result.passed).toBe(true);
      expect(result.structure.passed).toBe(true);
      expect(result.structure.checks.schema_valid).toBe(true);
      expect(result.structure.checks.refs_intact).toBe(true);
      expect(result.structure.checks.relations_valid).toBe(true);
      expect(result.structure.checks.no_cycles).toBe(true);
      expect(result.structure.checks.no_duplicate_ids).toBe(true);
      expect(result.structure.checks.no_self_relations).toBe(true);
    });

    it('fails with broken ref in slot', async () => {
      const content: SemanticContent = {
        frames: [{ id: 'f_001', type: 'x', slots: { link: { ref: 'f_999' } } }],
        relations: [],
      };
      const result = await runner.run(content);
      expect(result.passed).toBe(false);
      expect(result.structure.passed).toBe(false);
      expect(result.structure.checks.refs_intact).toBe(false);
    });

    it('fails with broken relation', async () => {
      const content: SemanticContent = {
        frames: [frame('f_001')],
        relations: [{ from: 'f_001', to: 'f_999', type: 'causes' }],
      };
      const result = await runner.run(content);
      expect(result.passed).toBe(false);
      expect(result.structure.passed).toBe(false);
      expect(result.structure.checks.relations_valid).toBe(false);
    });

    it('fails with duplicate ids', async () => {
      const content: SemanticContent = {
        frames: [frame('f_001'), frame('f_001')],
        relations: [],
      };
      const result = await runner.run(content);
      expect(result.passed).toBe(false);
      expect(result.structure.checks.no_duplicate_ids).toBe(false);
    });

    it('fails with self-relation', async () => {
      const content: SemanticContent = {
        frames: [frame('f_001')],
        relations: [{ from: 'f_001', to: 'f_001', type: 'causes' }],
      };
      const result = await runner.run(content);
      expect(result.passed).toBe(false);
      expect(result.structure.checks.no_self_relations).toBe(false);
    });

    it('fails with cycle', async () => {
      const content: SemanticContent = {
        frames: [frame('f_001'), frame('f_002')],
        relations: [
          { from: 'f_001', to: 'f_002', type: 'causes' },
          { from: 'f_002', to: 'f_001', type: 'causes' },
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
        frames: [frame('f_001'), frame('f_002')],
        relations: [{ from: 'f_001', to: 'f_002', type: 'elaborates' }],
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
        frames: [frame('f_001')],
        relations: [],
      };
      const result = await runner.run(content, {
        turns: [{ role: 'user', content: 'hello' }],
        // no provider → Gate 2 skipped
      });
      expect(result.passed).toBe(true);
      expect(result.semantic).toBeUndefined();
    });

    it('skips Gate 3 when no business rules are given', async () => {
      const content: SemanticContent = {
        frames: [frame('f_001')],
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
        frames: [frame('f_001')],
        relations: [],
      };
      const result = await runner.run(content);

      // Check top-level shape
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('structure');
      expect(typeof result.passed).toBe('boolean');

      // Check structure shape
      expect(result.structure).toHaveProperty('passed');
      expect(result.structure).toHaveProperty('checks');
      expect(result.structure.checks).toHaveProperty('schema_valid');
      expect(result.structure.checks).toHaveProperty('refs_intact');
      expect(result.structure.checks).toHaveProperty('relations_valid');
      expect(result.structure.checks).toHaveProperty('no_cycles');
      expect(result.structure.checks).toHaveProperty('no_duplicate_ids');
      expect(result.structure.checks).toHaveProperty('no_self_relations');
    });

    it('does not run Gate 2/3 when Gate 1 fails', async () => {
      const content: SemanticContent = {
        frames: [frame('f_001'), frame('f_001')], // duplicate
        relations: [],
      };
      const result = await runner.run(content, {
        turns: [{ role: 'user', content: 'test' }],
        businessRules: [{ id: 'r1', type: 'rule', rule: 'true', severity: 'error' }],
      });
      expect(result.passed).toBe(false);
      expect(result.semantic).toBeUndefined();
      expect(result.business).toBeUndefined();
    });
  });
});
