import { expect, it } from 'vitest';
import { createExtractionFailure } from '../failures';
import { buildTargetedReaskPrompt } from '../pipeline';

it('feeds the exact JSON parser error and malformed output back for repair', () => {
  const raw = '{"children":[{"key":"weather","children":[]}],"relations":[]}]}';
  let syntaxError = '';
  try {
    JSON.parse(raw);
  } catch (error) {
    syntaxError = (error as Error).message;
  }
  const prompt = {
    system: 'Return the required schema',
    messages: [{ role: 'user' as const, content: '生成卡片' }],
  };
  const repaired = buildTargetedReaskPrompt(
    prompt,
    createExtractionFailure('draft_parse', 'Invalid JSON', {
      details: { rawText: raw },
    }),
    {},
    'ProposalGenerationDraft'
  );
  expect(syntaxError).not.toBe('');
  expect(repaired.messages[1]).toEqual({ role: 'assistant', content: raw });
  expect(repaired.messages[2].content).toContain(syntaxError);
  expect(repaired.messages[2].content).toContain('matching bracket');
  expect(repaired.system).toBe(prompt.system);
});
