import { describe, expect, test } from 'vitest';
import type { TurnInput } from '../../extractors/extractionPrompt';
import { verifyProposal } from '../../extractors/verifyProposal';
import type { ExtractionProposal, SemanticPoint } from '../../types/v4';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeTurn(content: string, hash = 'sha256:turn1'): TurnInput {
  return { conversation_id: 'conv_1', turn_hash: hash, role: 'assistant', content };
}

function makeProposal(
  overrides: Partial<ExtractionProposal> & { quoted_text?: string; turn_hash?: string }
): ExtractionProposal {
  const { quoted_text, turn_hash, ...rest } = overrides;
  return {
    type: 'new',
    text: 'Extracted point',
    confidence: 0.9,
    inference_type: 'direct',
    reasoning: 'test',
    evidence: [
      {
        conversation_id: 'conv_1',
        turn_hash: turn_hash ?? 'sha256:turn1',
        quoted_text: quoted_text ?? 'test quote',
        role: 'primary',
        relevance: 'direct',
      },
    ],
    ...rest,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Check 1: Target SP existence
// ═══════════════════════════════════════════════════════════════════════════

describe('Check 1: target SP existence', () => {
  test('modify proposal rejected if target SP does not exist', () => {
    const proposal = makeProposal({
      type: 'modify',
      target_sp_id: 'sp_missing',
      quoted_text: 'hello',
    });
    const turns = [makeTurn('hello world')];
    const result = verifyProposal(proposal, [], turns);
    expect(result).toBeNull();
  });

  test('modify proposal accepted if target SP exists', () => {
    const sp: SemanticPoint = {
      id: 'sp_1',
      text: 'Existing point',
      status: 'active',
      zone: 'ready',
      inference_type: 'direct',
      reasoning: 'test',
      evidence: [],
      position: 0,
      staged: true,
    };
    const proposal = makeProposal({
      type: 'modify',
      target_sp_id: 'sp_1',
      quoted_text: 'hello',
    });
    const turns = [makeTurn('hello world')];
    const result = verifyProposal(proposal, [sp], turns);
    expect(result).not.toBeNull();
  });

  test('modify proposal rejected if target SP is undone', () => {
    const sp: SemanticPoint = {
      id: 'sp_1',
      text: 'Undone point',
      status: 'undone',
      zone: 'ready',
      inference_type: 'direct',
      reasoning: 'test',
      evidence: [],
      position: 0,
      staged: false,
    };
    const proposal = makeProposal({
      type: 'modify',
      target_sp_id: 'sp_1',
      quoted_text: 'hello',
    });
    const turns = [makeTurn('hello world')];
    const result = verifyProposal(proposal, [sp], turns);
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Check 2: Evidence anchor verification
// ═══════════════════════════════════════════════════════════════════════════

describe('Check 2: evidence anchors', () => {
  test('proposal accepted when primary evidence locates in turn', () => {
    const proposal = makeProposal({ quoted_text: 'important finding' });
    const turns = [makeTurn('This is an important finding from the study.')];
    const result = verifyProposal(proposal, [], turns);
    expect(result).not.toBeNull();
    expect(result!.evidence).toHaveLength(1);
    expect(result!.evidence[0].match_score).toBe(1.0);
  });

  test('proposal rejected when primary turn is missing', () => {
    const proposal = makeProposal({ turn_hash: 'sha256:missing' });
    const turns = [makeTurn('content', 'sha256:other')];
    const result = verifyProposal(proposal, [], turns);
    expect(result).toBeNull();
  });

  test('proposal rejected when primary quote not locatable', () => {
    const proposal = makeProposal({ quoted_text: 'completely different text xyz' });
    const turns = [makeTurn('hello world')];
    const result = verifyProposal(proposal, [], turns);
    expect(result).toBeNull();
  });

  test('supporting evidence skipped if not locatable', () => {
    const proposal: ExtractionProposal = {
      type: 'new',
      text: 'Test',
      confidence: 0.9,
      inference_type: 'direct',
      reasoning: 'test',
      evidence: [
        {
          conversation_id: 'conv_1',
          turn_hash: 'sha256:turn1',
          quoted_text: 'primary text here',
          role: 'primary',
          relevance: 'direct',
        },
        {
          conversation_id: 'conv_1',
          turn_hash: 'sha256:turn1',
          quoted_text: 'nonexistent supporting quote xyz',
          role: 'supporting',
          relevance: 'indirect',
        },
      ],
    };
    const turns = [makeTurn('This contains primary text here and more.')];
    const result = verifyProposal(proposal, [], turns);
    expect(result).not.toBeNull();
    // Only primary evidence should be present (supporting was skipped)
    expect(result!.evidence).toHaveLength(1);
    expect(result!.evidence[0].role).toBe('primary');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Check 4: Coverage warning
// ═══════════════════════════════════════════════════════════════════════════

describe('Check 4: coverage warning', () => {
  test('flags low_coverage when evidence covers <60% of turn', () => {
    // Turn is 100 chars, quote is first 50 chars = 50% coverage → low
    const turnContent = 'A'.repeat(50) + 'B'.repeat(50);
    const shortQuote = 'A'.repeat(50);

    const proposal = makeProposal({ quoted_text: shortQuote });
    const turns = [makeTurn(turnContent)];

    const result = verifyProposal(proposal, [], turns);
    expect(result).not.toBeNull();
    expect(result!.low_coverage).toBe(true);
  });

  test('no low_coverage when evidence covers >=60% of turn', () => {
    // Turn is 100 chars, quote is first 70 chars = 70% coverage → fine
    const turnContent = 'X'.repeat(70) + 'Y'.repeat(30);
    const longQuote = 'X'.repeat(70);

    const proposal = makeProposal({ quoted_text: longQuote });
    const turns = [makeTurn(turnContent)];

    const result = verifyProposal(proposal, [], turns);
    expect(result).not.toBeNull();
    expect(result!.low_coverage).toBeUndefined();
  });

  test('exactly 60% coverage does not trigger warning', () => {
    const turnContent = 'Z'.repeat(60) + 'W'.repeat(40);
    const quote = 'Z'.repeat(60);

    const proposal = makeProposal({ quoted_text: quote });
    const turns = [makeTurn(turnContent)];

    const result = verifyProposal(proposal, [], turns);
    expect(result).not.toBeNull();
    expect(result!.low_coverage).toBeUndefined();
  });

  test('multiple evidence ranges are merged for coverage calculation', () => {
    // Turn: "Alpha section here. Beta section there." (40 chars)
    // Quote 1: "Alpha section here" (18 chars, pos 0-18) → primary
    // Quote 2: "Beta section there" (18 chars, pos 20-38) → supporting
    // Total coverage: 36/40 = 90% → no warning
    const turnContent = 'Alpha section here. Beta section there.';
    const proposal: ExtractionProposal = {
      type: 'new',
      text: 'Test point',
      confidence: 0.9,
      inference_type: 'direct',
      reasoning: 'test',
      evidence: [
        {
          conversation_id: 'conv_1',
          turn_hash: 'sha256:turn1',
          quoted_text: 'Alpha section here',
          role: 'primary',
          relevance: 'direct',
        },
        {
          conversation_id: 'conv_1',
          turn_hash: 'sha256:turn1',
          quoted_text: 'Beta section there',
          role: 'supporting',
          relevance: 'supporting',
        },
      ],
    };
    const turns = [makeTurn(turnContent)];

    const result = verifyProposal(proposal, [], turns);
    expect(result).not.toBeNull();
    // Two quotes covering ~90% of turn → no warning
    expect(result!.low_coverage).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Basic verified proposal structure
// ═══════════════════════════════════════════════════════════════════════════

describe('verified proposal structure', () => {
  test('returns complete VerifiedProposal with all fields', () => {
    const proposal = makeProposal({ quoted_text: 'important data' });
    const turns = [makeTurn('This has important data in it and more content for coverage')];
    const result = verifyProposal(proposal, [], turns);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('new');
    expect(result!.text).toBe('Extracted point');
    expect(result!.confidence).toBe(0.9);
    expect(result!.inference_type).toBe('direct');
    expect(result!.reasoning).toBe('test');
    expect(result!.evidence).toHaveLength(1);
  });

  test('new proposal does not need target_sp_id', () => {
    const proposal = makeProposal({ quoted_text: 'hello world' });
    const turns = [makeTurn('hello world is a classic phrase used in programming')];
    const result = verifyProposal(proposal, [], turns);
    expect(result).not.toBeNull();
    expect(result!.target_sp_id).toBeUndefined();
  });
});
