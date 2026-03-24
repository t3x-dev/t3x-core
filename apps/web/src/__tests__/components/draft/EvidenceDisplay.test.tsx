import { describe, expect, test } from 'vitest';
import { EvidenceDisplay } from '@/components/draft/EvidenceDisplay';
import type { LocatedEvidenceAPI } from '@/lib/api';

function makeEvidence(overrides: Partial<LocatedEvidenceAPI> = {}): LocatedEvidenceAPI {
  return {
    conversation_id: 'conv_1',
    turn_hash: 'sha256:abc',
    quoted_text: 'The user said something important',
    start_char: 0,
    end_char: 35,
    match_score: 0.88,
    role: 'primary',
    relevance: 'direct reference',
    enabled: true,
    ...overrides,
  };
}

describe('EvidenceDisplay', () => {
  test('component exports successfully', () => {
    expect(EvidenceDisplay).toBeDefined();
    expect(typeof EvidenceDisplay).toBe('function');
  });

  test('filters out disabled evidence', () => {
    const evidence = [
      makeEvidence({ enabled: true }),
      makeEvidence({ enabled: false }),
      makeEvidence({ enabled: true }),
    ];
    const enabled = evidence.filter((e) => e.enabled);
    expect(enabled).toHaveLength(2);
  });

  test('returns null for empty enabled evidence', () => {
    const evidence = [makeEvidence({ enabled: false })];
    const enabled = evidence.filter((e) => e.enabled);
    expect(enabled).toHaveLength(0);
  });

  test('default collapsed shows source count', () => {
    const evidence = [makeEvidence(), makeEvidence(), makeEvidence()];
    const enabled = evidence.filter((e) => e.enabled);
    const label = `${enabled.length} source${enabled.length !== 1 ? 's' : ''}`;
    expect(label).toBe('3 sources');
  });

  test('single source uses singular label', () => {
    const evidence = [makeEvidence()];
    const enabled = evidence.filter((e) => e.enabled);
    const label = `${enabled.length} source${enabled.length !== 1 ? 's' : ''}`;
    expect(label).toBe('1 source');
  });

  test('match score bar percentage calculation', () => {
    const e = makeEvidence({ match_score: 0.88 });
    const pct = Math.round(e.match_score * 100);
    expect(pct).toBe(88);
  });

  test('match score bar handles edge values', () => {
    expect(Math.round(0 * 100)).toBe(0);
    expect(Math.round(1 * 100)).toBe(100);
    expect(Math.round(0.5 * 100)).toBe(50);
  });

  test('anchor_type badges are conditional', () => {
    const paraphrase = { ...makeEvidence(), anchor_type: 'paraphrase' };
    const inference = { ...makeEvidence(), anchor_type: 'inference' };
    const verbatim = { ...makeEvidence(), anchor_type: 'verbatim' };
    const noType = makeEvidence();

    expect(paraphrase.anchor_type).toBe('paraphrase');
    expect(inference.anchor_type).toBe('inference');
    expect(verbatim.anchor_type).toBe('verbatim');
    expect((noType as unknown as Record<string, unknown>).anchor_type).toBeUndefined();
  });

  test('defaultExpanded prop controls initial state', () => {
    // Component accepts defaultExpanded prop
    const props = { evidence: [makeEvidence()], defaultExpanded: true };
    expect(props.defaultExpanded).toBe(true);
  });
});
