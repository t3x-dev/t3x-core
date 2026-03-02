import { describe, expect, it } from 'vitest';
import type { ExtractionProposal, ProjectExtractionConfig } from '../../types/v4';
import { routeProposal } from '../routeProposal';

function makeProposal(overrides: Partial<ExtractionProposal> = {}): ExtractionProposal {
  return {
    type: 'new',
    text: 'Test sentence',
    confidence: 0.9,
    inference_type: 'direct',
    reasoning: 'test',
    evidence: [
      {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:abc',
        quoted_text: 'test quote',
        role: 'primary',
        relevance: 'directly stated',
      },
    ],
    ...overrides,
  };
}

describe('routeProposal', () => {
  it('routes high-confidence direct proposal to ready', () => {
    const result = routeProposal(makeProposal({ confidence: 0.9, inference_type: 'direct' }));
    expect(result.zone).toBe('ready');
  });

  it('routes modify proposals to review', () => {
    const result = routeProposal(makeProposal({ type: 'modify', target_sp_id: 'sp_123' }));
    expect(result.zone).toBe('review');
    expect(result.reason).toContain('modify');
  });

  it('routes reinforce proposals to review', () => {
    const result = routeProposal(makeProposal({ type: 'reinforce', target_sp_id: 'sp_123' }));
    expect(result.zone).toBe('review');
    expect(result.reason).toContain('reinforce');
  });

  it('routes implicit inference to review', () => {
    const result = routeProposal(makeProposal({ inference_type: 'implicit' }));
    expect(result.zone).toBe('review');
    expect(result.reason).toContain('implicit');
  });

  it('routes below-threshold direct to review', () => {
    const result = routeProposal(makeProposal({ confidence: 0.8, inference_type: 'direct' }));
    expect(result.zone).toBe('review');
  });

  it('routes at-threshold direct to ready', () => {
    const result = routeProposal(makeProposal({ confidence: 0.85, inference_type: 'direct' }));
    expect(result.zone).toBe('ready');
  });

  it('uses paraphrase threshold (0.80)', () => {
    const result = routeProposal(makeProposal({ confidence: 0.8, inference_type: 'paraphrase' }));
    expect(result.zone).toBe('ready');
  });

  it('uses cross_turn threshold (0.75)', () => {
    const result = routeProposal(makeProposal({ confidence: 0.75, inference_type: 'cross_turn' }));
    expect(result.zone).toBe('ready');
  });

  it('respects custom thresholds from config', () => {
    const config: ProjectExtractionConfig = {
      auto_landing_enabled: true,
      confidence_thresholds: { direct: 0.95 },
    };
    const result = routeProposal(
      makeProposal({ confidence: 0.9, inference_type: 'direct' }),
      config
    );
    expect(result.zone).toBe('review');
  });

  it('routes all to review when auto_landing_enabled = false', () => {
    const config: ProjectExtractionConfig = { auto_landing_enabled: false };
    const result = routeProposal(
      makeProposal({ confidence: 0.99, inference_type: 'direct' }),
      config
    );
    expect(result.zone).toBe('review');
  });

  it('routes proposals with no evidence to review', () => {
    const result = routeProposal(makeProposal({ evidence: [] }));
    expect(result.zone).toBe('review');
    expect(result.reason).toContain('evidence');
  });
});
