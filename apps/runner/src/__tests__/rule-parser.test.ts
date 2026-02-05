import { describe, expect, it, vi } from 'vitest';

vi.mock('pino', () => {
  const noop = () => {};
  const logger = { debug: noop, info: noop, warn: noop, error: noop };
  return { default: () => logger };
});

const {
  DEFAULT_RULES,
  parseRulesFromJson,
  parseRulesFromYaml,
  validateRules,
  parseRulesFromLeaf,
  loadDefaultRules,
} = await import('../evaluator/rule-parser.js');

describe('rule-parser', () => {
  // =========================================================================
  // parseRulesFromJson
  // =========================================================================
  describe('parseRulesFromJson', () => {
    it('parses valid JSON rules', () => {
      const json = JSON.stringify({
        version: '1.0',
        rules: [{ id: 'r1', target: 'output', check: 'exists', weight: 0.5 }],
        pass_threshold: 0.8,
      });
      const rules = parseRulesFromJson(json);
      expect(rules.version).toBe('1.0');
      expect(rules.rules).toHaveLength(1);
      expect(rules.pass_threshold).toBe(0.8);
    });

    it('throws on invalid JSON string', () => {
      expect(() => parseRulesFromJson('not-json')).toThrow();
    });

    it('throws on valid JSON but invalid schema', () => {
      const json = JSON.stringify({ version: '1.0', rules: [] });
      expect(() => parseRulesFromJson(json)).toThrow();
    });

    it('applies defaults for optional fields', () => {
      const json = JSON.stringify({
        version: '1.0',
        rules: [{ id: 'r1', target: 'output', check: 'exists', weight: 0.5 }],
        pass_threshold: 0.5,
      });
      const rules = parseRulesFromJson(json);
      expect(rules.rules[0].type).toBe('basic');
      expect(rules.rules[0].severity).toBe('error');
    });
  });

  // =========================================================================
  // parseRulesFromYaml
  // =========================================================================
  describe('parseRulesFromYaml', () => {
    it('parses valid YAML rules', () => {
      const yaml = `
version: "2.0"
rules:
  - id: r1
    target: output
    check: exists
    weight: 0.5
pass_threshold: 0.8
`;
      const rules = parseRulesFromYaml(yaml);
      expect(rules.version).toBe('2.0');
      expect(rules.rules).toHaveLength(1);
    });

    it('throws on invalid YAML', () => {
      expect(() => parseRulesFromYaml('{ invalid: yaml: :')).toThrow();
    });

    it('throws on valid YAML but invalid schema', () => {
      const yaml = `
version: "1.0"
rules: []
pass_threshold: 0.5
`;
      expect(() => parseRulesFromYaml(yaml)).toThrow();
    });
  });

  // =========================================================================
  // validateRules
  // =========================================================================
  describe('validateRules', () => {
    it('returns true for valid rules', () => {
      const rules = {
        version: '1.0',
        rules: [{ id: 'r1', target: 'output', check: 'exists', weight: 0.5 }],
        pass_threshold: 0.8,
      };
      expect(validateRules(rules)).toBe(true);
    });

    it('throws for invalid rules', () => {
      expect(() => validateRules({ version: '1.0' })).toThrow();
    });

    it('throws for empty rules array', () => {
      expect(() => validateRules({ version: '1.0', rules: [], pass_threshold: 0.5 })).toThrow();
    });
  });

  // =========================================================================
  // DEFAULT_RULES
  // =========================================================================
  describe('DEFAULT_RULES', () => {
    it('has valid structure', () => {
      expect(DEFAULT_RULES.version).toBe('1.0');
      expect(DEFAULT_RULES.rules.length).toBeGreaterThan(0);
      expect(DEFAULT_RULES.pass_threshold).toBeGreaterThan(0);
    });

    it('includes output_exists rule', () => {
      const rule = DEFAULT_RULES.rules.find((r) => r.id === 'output_exists');
      expect(rule).toBeDefined();
      expect(rule!.check).toBe('exists');
    });

    it('includes no_errors rule', () => {
      const rule = DEFAULT_RULES.rules.find((r) => r.id === 'no_errors');
      expect(rule).toBeDefined();
      expect(rule!.check).toBe('all');
    });
  });

  // =========================================================================
  // parseRulesFromLeaf
  // =========================================================================
  describe('parseRulesFromLeaf', () => {
    it('returns default rules when no leaf provided', () => {
      const rules = parseRulesFromLeaf();
      expect(rules.rules.length).toBeGreaterThan(0);
    });

    it('returns default rules when leaf has no rules_ref', () => {
      const rules = parseRulesFromLeaf({ content: 'some prompt' });
      expect(rules.rules.length).toBeGreaterThan(0);
    });

    it('falls back to defaults when rules_ref file not found', () => {
      const rules = parseRulesFromLeaf({ rules_ref: 'nonexistent-rules-file' });
      expect(rules.rules.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // loadDefaultRules
  // =========================================================================
  describe('loadDefaultRules', () => {
    it('returns rules with valid structure', () => {
      const rules = loadDefaultRules();
      expect(rules.version).toBeTruthy();
      expect(rules.rules.length).toBeGreaterThan(0);
      expect(rules.pass_threshold).toBeGreaterThanOrEqual(0);
      expect(rules.pass_threshold).toBeLessThanOrEqual(1);
    });
  });
});
