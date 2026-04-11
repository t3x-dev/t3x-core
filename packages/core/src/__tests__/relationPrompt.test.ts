import { describe, expect, it } from 'vitest';
import { buildRelationPrompt } from '../extractors/relationPrompt';

describe('buildRelationPrompt', () => {
  const nodes = [
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
    const { systemPrompt, userPrompt } = buildRelationPrompt(nodes);
    expect(systemPrompt).toBeDefined();
    expect(userPrompt).toBeDefined();
  });

  it('system prompt includes all 5 relation types', () => {
    const { systemPrompt } = buildRelationPrompt(nodes);
    expect(systemPrompt).toContain('causes');
    expect(systemPrompt).toContain('conditions');
    expect(systemPrompt).toContain('contrasts');
    expect(systemPrompt).toContain('follows');
    expect(systemPrompt).toContain('depends');
    // Legacy types must not appear
    expect(systemPrompt).not.toContain('supports');
    expect(systemPrompt).not.toContain('temporal_follows');
    expect(systemPrompt).not.toContain('summarizes');
  });

  it('user prompt lists nodes with IDs', () => {
    const { userPrompt } = buildRelationPrompt(nodes);
    expect(userPrompt).toContain('[s_aaa]');
    expect(userPrompt).toContain('[s_bbb]');
    expect(userPrompt).toContain('[s_ccc]');
    expect(userPrompt).toContain('The user prefers dark mode for coding.');
  });

  it('system prompt requests JSON array output', () => {
    const { systemPrompt } = buildRelationPrompt(nodes);
    expect(systemPrompt).toContain('JSON array');
    expect(systemPrompt).toContain('source_id');
    expect(systemPrompt).toContain('target_id');
  });

  it('returns empty userPrompt for empty nodes', () => {
    const { userPrompt } = buildRelationPrompt([]);
    expect(userPrompt).toBe('');
  });
});
