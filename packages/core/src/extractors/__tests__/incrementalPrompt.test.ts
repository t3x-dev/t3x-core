import { describe, expect, it } from 'vitest';
import { buildIncrementalPrompt, buildStyleSeed } from '../incrementalPrompt';
import type { SemanticPoint } from '../../types/v4';
import type { TurnInput } from '../extractionPrompt';

function makeSP(id: string, text: string, status: string = 'auto_landed'): SemanticPoint {
  return {
    id,
    text,
    extraction_mode: 'llm_extracted',
    status: status as SemanticPoint['status'],
    zone: 'ready',
    evidence: [],
    confidence: 0.9,
    position: 0,
    staged: true,
  };
}

const turns: TurnInput[] = [
  { conversation_id: 'conv_1', turn_hash: 'sha256:t1', role: 'user', content: 'I like TypeScript.' },
  { conversation_id: 'conv_1', turn_hash: 'sha256:t2', role: 'assistant', content: 'TypeScript is great.' },
];

describe('buildStyleSeed', () => {
  it('returns first 5 non-undone SPs', () => {
    const sps = [
      makeSP('sp_1', 'Sentence A'),
      makeSP('sp_2', 'Sentence B', 'undone'),
      makeSP('sp_3', 'Sentence C'),
      makeSP('sp_4', 'Sentence D'),
      makeSP('sp_5', 'Sentence E'),
      makeSP('sp_6', 'Sentence F'),
      makeSP('sp_7', 'Sentence G'),
    ];
    const seed = buildStyleSeed(sps);
    expect(seed).toHaveLength(5);
    expect(seed.map((s) => s.id)).toEqual(['sp_1', 'sp_3', 'sp_4', 'sp_5', 'sp_6']);
  });

  it('returns empty array when no SPs', () => {
    expect(buildStyleSeed([])).toEqual([]);
  });
});

describe('buildIncrementalPrompt', () => {
  it('includes existing SPs in context', () => {
    const sps = [makeSP('sp_1', 'The user prefers TypeScript.')];
    const { systemPrompt } = buildIncrementalPrompt(sps, turns, []);
    expect(systemPrompt).toContain('The user prefers TypeScript.');
  });

  it('includes new turns in user prompt', () => {
    const { userPrompt } = buildIncrementalPrompt([], turns, []);
    expect(userPrompt).toContain('I like TypeScript.');
    expect(userPrompt).toContain('TypeScript is great.');
  });

  it('includes review zone items for context', () => {
    const reviewItems = [makeSP('sp_r1', 'Review item text')];
    const { systemPrompt } = buildIncrementalPrompt([], turns, reviewItems);
    expect(systemPrompt).toContain('Review item text');
  });

  it('includes style seed', () => {
    const sps = [makeSP('sp_1', 'The user values code readability.')];
    const { systemPrompt } = buildIncrementalPrompt(sps, turns, [], sps);
    expect(systemPrompt).toContain('code readability');
  });

  it('requests JSON output with ExtractionProposal format', () => {
    const { systemPrompt } = buildIncrementalPrompt([], turns, []);
    expect(systemPrompt).toContain('type');
    expect(systemPrompt).toContain('evidence');
    expect(systemPrompt).toContain('quoted_text');
  });
});
