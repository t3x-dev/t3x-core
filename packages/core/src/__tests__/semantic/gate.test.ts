import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '../../llm/types';
import {
  buildCoveragePrompt,
  buildSemanticGatePrompt,
  parseCoverageResponse,
  parseSemanticGateResponse,
  SemanticGate,
} from '../../semantic/gate';
import type { SemanticContent } from '../../semantic/types';

// ── Fixtures ──

const sampleTurns = [
  { role: 'user', content: 'I want to build a mobile app for tracking expenses.' },
  { role: 'assistant', content: 'Great idea! What platform do you prefer — iOS or Android?' },
  { role: 'user', content: 'iOS first, budget is $50k, deadline is March 2026.' },
];

const sampleContent: SemanticContent = {
  trees: [
    {
      key: 'project_goal',
      slots: { description: 'mobile app for tracking expenses' },
      children: [],
    },
    {
      key: 'constraint',
      slots: { platform: 'iOS', budget: 50000, deadline: 'March 2026' },
      children: [],
    },
  ],
  relations: [{ from: 'project_goal', to: 'constraint', type: 'causes' }],
};

const validLLMResponse = JSON.stringify({
  dimensions: {
    completeness: { score: 0.9, details: 'All key intents captured' },
    accuracy: { score: 0.85, details: 'Slot values match original text' },
    relations: { score: 0.8, details: 'Relation types are correct' },
    granularity: { score: 0.95, details: 'Good frame granularity' },
    hallucination: { score: 0.9, details: 'No hallucinated content found' },
  },
  issues: [
    {
      severity: 'warning',
      node_path: 'constraint',
      dimension: 'accuracy',
      description: 'Budget value could be more precise',
      suggestion: 'Add currency unit to budget slot',
    },
  ],
});

// ── Tests ──

describe('buildSemanticGatePrompt', () => {
  it('returns system and user prompt with turns and content', () => {
    const { systemPrompt, userPrompt } = buildSemanticGatePrompt(sampleTurns, sampleContent);

    // System prompt should contain the reviewer instruction
    expect(systemPrompt).toContain('语义提取审查员');
    expect(systemPrompt).toContain('Completeness');
    expect(systemPrompt).toContain('Accuracy');
    expect(systemPrompt).toContain('Relations');
    expect(systemPrompt).toContain('Granularity');
    expect(systemPrompt).toContain('Hallucination');

    // User prompt should contain turns
    expect(userPrompt).toContain('[user]: I want to build a mobile app');
    expect(userPrompt).toContain('[assistant]: Great idea!');

    // User prompt should contain tree data
    expect(userPrompt).toContain('project_goal');
    expect(userPrompt).toContain('mobile app for tracking expenses');

    // User prompt should contain relations
    expect(userPrompt).toContain('project_goal --[causes]--> constraint');
  });

  it('handles empty relations', () => {
    const emptyRelContent: SemanticContent = {
      trees: [{ key: 'test', slots: { a: 1 }, children: [] }],
      relations: [],
    };
    const { userPrompt } = buildSemanticGatePrompt(sampleTurns, emptyRelContent);
    expect(userPrompt).toContain('(none)');
  });
});

describe('parseSemanticGateResponse', () => {
  it('parses valid JSON into correct result', () => {
    const result = parseSemanticGateResponse(validLLMResponse);

    expect(result.passed).toBe(true);
    expect(result.score).toBeCloseTo(0.88, 1);
    expect(result.dimensions.completeness.score).toBe(0.9);
    expect(result.dimensions.accuracy.score).toBe(0.85);
    expect(result.dimensions.relations.score).toBe(0.8);
    expect(result.dimensions.granularity.score).toBe(0.95);
    expect(result.dimensions.hallucination.score).toBe(0.9);
    expect(result.dimensions.completeness.details).toBe('All key intents captured');

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('warning');
    expect(result.issues[0].node_path).toBe('constraint');
    expect(result.issues[0].dimension).toBe('accuracy');
    expect(result.issues[0].description).toBe('Budget value could be more precise');
    expect(result.issues[0].suggestion).toBe('Add currency unit to budget slot');
  });

  it('parses JSON wrapped in markdown code block', () => {
    const wrapped = `Here is the review:\n\n\`\`\`json\n${validLLMResponse}\n\`\`\``;
    const result = parseSemanticGateResponse(wrapped);

    expect(result.passed).toBe(true);
    expect(result.score).toBeCloseTo(0.88, 1);
    expect(result.dimensions.completeness.score).toBe(0.9);
  });

  it('returns degraded result for invalid JSON', () => {
    const result = parseSemanticGateResponse('this is not json at all');

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].description).toContain('Failed to parse');
  });

  it('returns degraded result when dimensions missing', () => {
    const result = parseSemanticGateResponse(JSON.stringify({ issues: [] }));

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0].description).toContain('Missing dimensions');
  });

  it('fills defaults for partial scores', () => {
    const partial = JSON.stringify({
      dimensions: {
        completeness: { score: 0.9, details: 'Good' },
        accuracy: { score: 0.8, details: 'OK' },
      },
      issues: [],
    });
    const result = parseSemanticGateResponse(partial);

    expect(result.dimensions.completeness.score).toBe(0.9);
    expect(result.dimensions.accuracy.score).toBe(0.8);
    expect(result.dimensions.relations.score).toBe(0);
    expect(result.dimensions.granularity.score).toBe(0);
    expect(result.dimensions.hallucination.score).toBe(0);
    expect(result.score).toBeCloseTo(0.34, 1);
    expect(result.passed).toBe(false);
  });

  it('clamps scores to 0-1 range', () => {
    const outOfRange = JSON.stringify({
      dimensions: {
        completeness: { score: 1.5, details: 'Too high' },
        accuracy: { score: -0.3, details: 'Too low' },
        relations: { score: 0.8, details: 'OK' },
        granularity: { score: 0.9, details: 'OK' },
        hallucination: { score: 0.85, details: 'OK' },
      },
      issues: [],
    });
    const result = parseSemanticGateResponse(outOfRange);
    expect(result.dimensions.completeness.score).toBe(1);
    expect(result.dimensions.accuracy.score).toBe(0);
  });

  it('parses JSON with surrounding Chinese text (no code block)', () => {
    const withText = `好的，以下是我的评审结果：\n\n${validLLMResponse}\n\n以上是评审结论。`;
    const result = parseSemanticGateResponse(withText);

    expect(result.passed).toBe(true);
    expect(result.score).toBeCloseTo(0.88, 1);
    expect(result.dimensions.completeness.score).toBe(0.9);
  });

  it('parses JSON with leading text and no code block', () => {
    const withLeadingText = `Here is my analysis:\n${validLLMResponse}`;
    const result = parseSemanticGateResponse(withLeadingText);

    expect(result.passed).toBe(true);
    expect(result.dimensions.accuracy.score).toBe(0.85);
  });

  it('normalizes invalid severity to warning', () => {
    const badSeverity = JSON.stringify({
      dimensions: {
        completeness: { score: 0.9, details: '' },
        accuracy: { score: 0.9, details: '' },
        relations: { score: 0.9, details: '' },
        granularity: { score: 0.9, details: '' },
        hallucination: { score: 0.9, details: '' },
      },
      issues: [{ severity: 'critical', dimension: 'accuracy', description: 'Bad issue' }],
    });
    const result = parseSemanticGateResponse(badSeverity);
    expect(result.issues[0].severity).toBe('warning');
  });

  it('normalizes invalid dimension to accuracy', () => {
    const badDimension = JSON.stringify({
      dimensions: {
        completeness: { score: 0.9, details: '' },
        accuracy: { score: 0.9, details: '' },
        relations: { score: 0.9, details: '' },
        granularity: { score: 0.9, details: '' },
        hallucination: { score: 0.9, details: '' },
      },
      issues: [{ severity: 'warning', dimension: 'unknown_dim', description: 'Some issue' }],
    });
    const result = parseSemanticGateResponse(badDimension);
    expect(result.issues[0].dimension).toBe('accuracy');
  });
});

describe('SemanticGate', () => {
  it('review() calls provider and returns parsed result', async () => {
    const mockProvider: LLMProvider = {
      id: 'mock',
      generate: vi
        .fn()
        .mockResolvedValue({ text: validLLMResponse, usage: { inputTokens: 10, outputTokens: 5 } }),
      resolveConflict: vi.fn(),
    };

    const gate = new SemanticGate(mockProvider);
    const result = await gate.review(sampleTurns, sampleContent);

    expect(mockProvider.generate).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(mockProvider.generate).mock.calls[0];
    expect(callArgs[0]).toContain('语义提取审查员');
    expect(callArgs[0]).toContain('project_goal');
    expect(callArgs[1]).toEqual({ temperature: 0.1, maxTokens: 2000 });

    expect(result.passed).toBe(true);
    expect(result.score).toBeCloseTo(0.88, 1);
    expect(result.issues).toHaveLength(1);
  });

  it('review() returns degraded result when provider throws', async () => {
    const mockProvider: LLMProvider = {
      id: 'mock',
      generate: vi.fn().mockRejectedValue(new Error('API timeout')),
      resolveConflict: vi.fn(),
    };

    const gate = new SemanticGate(mockProvider);
    const result = await gate.review(sampleTurns, sampleContent);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0].description).toContain('LLM provider call failed');
  });
});

// ── Coverage Fixtures ──

const validCoverageResponse = JSON.stringify({
  coverage_ratio: 0.85,
  uncovered_segments: ['Budget is $50k'],
});

// ── Coverage Tests ──

describe('buildCoveragePrompt', () => {
  it('returns system and user prompt with turns and trees', () => {
    const { systemPrompt, userPrompt } = buildCoveragePrompt(sampleTurns, sampleContent);

    expect(systemPrompt).toContain('覆盖度');
    expect(userPrompt).toContain('[user]: I want to build a mobile app');
    expect(userPrompt).toContain('project_goal');
  });
});

describe('parseCoverageResponse', () => {
  it('parses valid JSON', () => {
    const result = parseCoverageResponse(validCoverageResponse);
    expect(result.coverage_ratio).toBe(0.85);
    expect(result.uncovered_segments).toEqual(['Budget is $50k']);
  });

  it('parses markdown-wrapped JSON', () => {
    const wrapped = `\`\`\`json\n${validCoverageResponse}\n\`\`\``;
    const result = parseCoverageResponse(wrapped);
    expect(result.coverage_ratio).toBe(0.85);
  });

  it('returns zero coverage for garbage input', () => {
    const result = parseCoverageResponse('not json');
    expect(result.coverage_ratio).toBe(0);
    expect(result.uncovered_segments).toEqual([]);
  });

  it('clamps coverage_ratio to 0-1', () => {
    const high = JSON.stringify({ coverage_ratio: 1.5, uncovered_segments: [] });
    expect(parseCoverageResponse(high).coverage_ratio).toBe(1);

    const low = JSON.stringify({ coverage_ratio: -0.3, uncovered_segments: [] });
    expect(parseCoverageResponse(low).coverage_ratio).toBe(0);
  });

  it('defaults uncovered_segments to [] if missing', () => {
    const noSegments = JSON.stringify({ coverage_ratio: 0.9 });
    const result = parseCoverageResponse(noSegments);
    expect(result.uncovered_segments).toEqual([]);
  });
});

describe('SemanticGate.checkCoverage', () => {
  it('calls provider and returns parsed result', async () => {
    const mockProvider: LLMProvider = {
      id: 'mock',
      generate: vi.fn().mockResolvedValue({
        text: validCoverageResponse,
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
      resolveConflict: vi.fn(),
    };

    const gate = new SemanticGate(mockProvider);
    const result = await gate.checkCoverage(sampleTurns, sampleContent);

    expect(mockProvider.generate).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(mockProvider.generate).mock.calls[0];
    expect(callArgs[0]).toContain('覆盖度');
    expect(callArgs[0]).toContain('project_goal');
    expect(callArgs[1]).toEqual({ temperature: 0.1, maxTokens: 1500 });

    expect(result.coverage_ratio).toBe(0.85);
    expect(result.uncovered_segments).toEqual(['Budget is $50k']);
  });

  it('returns zero coverage when provider throws', async () => {
    const mockProvider: LLMProvider = {
      id: 'mock',
      generate: vi.fn().mockRejectedValue(new Error('timeout')),
      resolveConflict: vi.fn(),
    };

    const gate = new SemanticGate(mockProvider);
    const result = await gate.checkCoverage(sampleTurns, sampleContent);

    expect(result.coverage_ratio).toBe(0);
    expect(result.uncovered_segments).toEqual([]);
  });
});
