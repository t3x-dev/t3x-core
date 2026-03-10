import { describe, expect, it } from 'vitest';
import type { SemanticPoint } from '../../types/v4';
import type { AdaptiveConfig } from '../adaptiveThresholds';
import type { TurnInput } from '../extractionPrompt';
import { buildAdaptiveSection, buildIncrementalPrompt, buildStyleSeed } from '../incrementalPrompt';

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
  {
    conversation_id: 'conv_1',
    turn_hash: 'sha256:t1',
    role: 'user',
    content: 'I like TypeScript.',
  },
  {
    conversation_id: 'conv_1',
    turn_hash: 'sha256:t2',
    role: 'assistant',
    content: 'TypeScript is great.',
  },
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

  it('includes adaptive section when config has suppressed types', () => {
    const adaptiveConfig: AdaptiveConfig = {
      confidenceMultipliers: { implicit: 0, direct: 1.0 },
      suppressedTypes: ['implicit'],
      cosineThresholdDelta: 0,
    };
    const { systemPrompt } = buildIncrementalPrompt([], turns, [], undefined, adaptiveConfig);
    expect(systemPrompt).toContain('Adaptive Feedback Constraints');
    expect(systemPrompt).toContain('Do NOT generate proposals with these inference types');
    expect(systemPrompt).toContain('implicit');
  });

  it('includes reduced confidence instructions when multiplier < 1.0', () => {
    const adaptiveConfig: AdaptiveConfig = {
      confidenceMultipliers: { paraphrase: 0.7, direct: 1.0 },
      suppressedTypes: [],
      cosineThresholdDelta: 0,
    };
    const { systemPrompt } = buildIncrementalPrompt([], turns, [], undefined, adaptiveConfig);
    expect(systemPrompt).toContain('Adaptive Feedback Constraints');
    expect(systemPrompt).toContain('paraphrase');
    expect(systemPrompt).toContain('reduce confidence');
  });

  it('does not include adaptive section when config is undefined', () => {
    const { systemPrompt } = buildIncrementalPrompt([], turns, []);
    expect(systemPrompt).not.toContain('Adaptive Feedback Constraints');
  });

  it('does not include adaptive section when config is empty', () => {
    const adaptiveConfig: AdaptiveConfig = {
      confidenceMultipliers: { direct: 1.0 },
      suppressedTypes: [],
      cosineThresholdDelta: 0,
    };
    const { systemPrompt } = buildIncrementalPrompt([], turns, [], undefined, adaptiveConfig);
    expect(systemPrompt).not.toContain('Adaptive Feedback Constraints');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildAdaptiveSection
// ═══════════════════════════════════════════════════════════════════════════

describe('buildAdaptiveSection', () => {
  it('returns empty string when no suppressions and no reduced multipliers', () => {
    const config: AdaptiveConfig = {
      confidenceMultipliers: { direct: 1.0, paraphrase: 1.0 },
      suppressedTypes: [],
      cosineThresholdDelta: 0,
    };
    expect(buildAdaptiveSection(config)).toBe('');
  });

  it('lists suppressed types', () => {
    const config: AdaptiveConfig = {
      confidenceMultipliers: { implicit: 0, cross_turn: 0 },
      suppressedTypes: ['implicit', 'cross_turn'],
      cosineThresholdDelta: 0,
    };
    const section = buildAdaptiveSection(config);
    expect(section).toContain('implicit');
    expect(section).toContain('cross_turn');
    expect(section).toContain('Do NOT generate proposals');
  });

  it('lists reduced multiplier types but not suppressed ones', () => {
    const config: AdaptiveConfig = {
      confidenceMultipliers: { implicit: 0, paraphrase: 0.7 },
      suppressedTypes: ['implicit'],
      cosineThresholdDelta: -0.02,
    };
    const section = buildAdaptiveSection(config);
    // paraphrase should appear in reduced section
    expect(section).toContain('paraphrase');
    expect(section).toContain('reduce confidence');
    // implicit should only appear in suppressed section, not reduced
    const reducedIndex = section.indexOf('Assign LOWER');
    if (reducedIndex !== -1) {
      const afterReduced = section.slice(reducedIndex);
      expect(afterReduced).not.toContain('implicit');
    }
  });
});
