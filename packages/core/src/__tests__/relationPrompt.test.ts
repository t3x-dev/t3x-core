import { describe, expect, it } from 'vitest';
import { buildRelationPrompt } from '../extractors/relationPrompt';

describe('buildRelationPrompt', () => {
  const sentences = [
    { id: 's_aaa', text: 'The user prefers dark mode for coding.' },
    {
      id: 's_bbb',
      text: 'Because dark mode reduces eye strain during long sessions.',
    },
    {
      id: 's_ccc',
      text: 'However, light mode is better for readability in bright environments.',
    },
  ];

  it('returns systemPrompt and userPrompt', () => {
    const { systemPrompt, userPrompt } = buildRelationPrompt(sentences);
    expect(systemPrompt).toBeDefined();
    expect(userPrompt).toBeDefined();
  });

  it('system prompt includes all 7 relation types', () => {
    const { systemPrompt } = buildRelationPrompt(sentences);
    expect(systemPrompt).toContain('supports');
    expect(systemPrompt).toContain('contrasts');
    expect(systemPrompt).toContain('causes');
    expect(systemPrompt).toContain('elaborates');
    expect(systemPrompt).toContain('temporal_follows');
    expect(systemPrompt).toContain('conditions');
    expect(systemPrompt).toContain('summarizes');
  });

  it('user prompt lists sentences with IDs', () => {
    const { userPrompt } = buildRelationPrompt(sentences);
    expect(userPrompt).toContain('[s_aaa]');
    expect(userPrompt).toContain('[s_bbb]');
    expect(userPrompt).toContain('[s_ccc]');
    expect(userPrompt).toContain('The user prefers dark mode for coding.');
  });

  it('system prompt requests JSON array output', () => {
    const { systemPrompt } = buildRelationPrompt(sentences);
    expect(systemPrompt).toContain('JSON array');
    expect(systemPrompt).toContain('source_id');
    expect(systemPrompt).toContain('target_id');
  });

  it('returns empty userPrompt for empty sentences', () => {
    const { userPrompt } = buildRelationPrompt([]);
    expect(userPrompt).toBe('');
  });
});
