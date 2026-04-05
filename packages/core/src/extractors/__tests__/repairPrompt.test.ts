import { describe, expect, it } from 'vitest';
import { buildRepairPrompt } from '../repairPrompt';

const fakeTurns = [
  { role: 'user', content: 'I want to plan a trip to Tokyo' },
  { role: 'assistant', content: 'Great! Let me help you plan your Tokyo trip.' },
  { role: 'user', content: 'Budget is around 200k yen' },
  { role: 'assistant', content: 'That sounds like a good budget for Tokyo.' },
];

describe('buildRepairPrompt', () => {
  describe('yaml_parse mode', () => {
    const result = buildRepairPrompt({
      kind: 'yaml_parse',
      rawOutput: 'trip:\n  destination: Tokyo\n  budget 200k',
      errorMessage: 'bad indentation of a mapping entry (3:3)',
      turns: fakeTurns,
    });

    it('returns systemPrompt and userPrompt', () => {
      expect(result.systemPrompt).toBeDefined();
      expect(result.userPrompt).toBeDefined();
    });

    it('system prompt mentions YAML syntax repair', () => {
      expect(result.systemPrompt).toContain('syntax');
    });

    it('user prompt includes the error message', () => {
      expect(result.userPrompt).toContain('bad indentation of a mapping entry');
    });

    it('user prompt includes the raw LLM output', () => {
      expect(result.userPrompt).toContain('budget 200k');
    });

    it('user prompt includes only last 3 turns', () => {
      expect(result.userPrompt).toContain('Budget is around 200k yen');
      expect(result.userPrompt).not.toContain('I want to plan a trip to Tokyo');
    });

    it('system prompt instructs valid YAML output', () => {
      expect(result.systemPrompt).toContain('yops:');
    });
  });

  describe('yops_apply mode', () => {
    const rawYops = `yops:
- set:
    path: trip/budget
    value: "200k yen"
    source: "200k yen"
    from: T3`;

    const result = buildRepairPrompt({
      kind: 'yops_apply',
      rawOutput: rawYops,
      errorMessage: "NODE_NOT_FOUND: Node 'trip/budget' does not exist",
      turns: fakeTurns,
    });

    it('system prompt mentions tree operation repair', () => {
      expect(result.systemPrompt).toContain('tree');
    });

    it('user prompt includes the error code and message', () => {
      expect(result.userPrompt).toContain('NODE_NOT_FOUND');
      expect(result.userPrompt).toContain('does not exist');
    });

    it('user prompt includes the raw YOps output', () => {
      expect(result.userPrompt).toContain('trip/budget');
    });

    it('system prompt mentions common fixes', () => {
      expect(result.systemPrompt).toContain('define');
    });
  });

  describe('turn truncation', () => {
    it('includes at most 3 turns', () => {
      const manyTurns = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Turn ${i + 1} content`,
      }));

      const result = buildRepairPrompt({
        kind: 'yaml_parse',
        rawOutput: 'bad: yaml',
        errorMessage: 'parse error',
        turns: manyTurns,
      });

      expect(result.userPrompt).toContain('Turn 10 content');
      expect(result.userPrompt).toContain('Turn 9 content');
      expect(result.userPrompt).toContain('Turn 8 content');
      expect(result.userPrompt).not.toContain('Turn 7 content');
    });

    it('handles fewer than 3 turns', () => {
      const result = buildRepairPrompt({
        kind: 'yaml_parse',
        rawOutput: 'bad: yaml',
        errorMessage: 'parse error',
        turns: [{ role: 'user', content: 'only turn' }],
      });

      expect(result.userPrompt).toContain('only turn');
    });
  });
});
