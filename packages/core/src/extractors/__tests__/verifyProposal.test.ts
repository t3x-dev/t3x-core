import { describe, expect, it } from 'vitest';
import { verifyProposal } from '../verifyProposal';
import type { ExtractionProposal, SemanticPoint } from '../../types/v4';
import type { TurnInput } from '../extractionPrompt';

const turns: TurnInput[] = [
  {
    conversation_id: 'conv_1',
    turn_hash: 'sha256:turn1',
    role: 'user',
    content: 'I really love dark mode for coding. It helps my eyes.',
  },
  {
    conversation_id: 'conv_1',
    turn_hash: 'sha256:turn2',
    role: 'assistant',
    content: 'Dark mode is great for reducing eye strain during long sessions.',
  },
];

const existingSPs: SemanticPoint[] = [];

function makeProposal(overrides: Partial<ExtractionProposal> = {}): ExtractionProposal {
  return {
    type: 'new',
    text: 'The user prefers dark mode for coding.',
    confidence: 0.9,
    inference_type: 'direct',
    reasoning: 'User explicitly stated preference',
    evidence: [{
      conversation_id: 'conv_1',
      turn_hash: 'sha256:turn1',
      quoted_text: 'love dark mode for coding',
      role: 'primary',
      relevance: 'directly stated',
    }],
    ...overrides,
  };
}

describe('verifyProposal', () => {
  it('passes valid proposal with locatable quote', () => {
    const result = verifyProposal(makeProposal(), existingSPs, turns);
    expect(result).not.toBeNull();
    expect(result!.evidence[0].match_score).toBeGreaterThan(0);
    expect(result!.evidence[0].start_char).toBeGreaterThanOrEqual(0);
  });

  it('rejects proposal with non-existent turn_hash', () => {
    const result = verifyProposal(
      makeProposal({
        evidence: [{
          conversation_id: 'conv_1',
          turn_hash: 'sha256:nonexistent',
          quoted_text: 'dark mode',
          role: 'primary',
          relevance: 'stated',
        }],
      }),
      existingSPs,
      turns
    );
    expect(result).toBeNull();
  });

  it('rejects proposal with unlocatable quote', () => {
    const result = verifyProposal(
      makeProposal({
        evidence: [{
          conversation_id: 'conv_1',
          turn_hash: 'sha256:turn1',
          quoted_text: 'this text does not exist anywhere in the conversation at all',
          role: 'primary',
          relevance: 'stated',
        }],
      }),
      existingSPs,
      turns
    );
    expect(result).toBeNull();
  });

  it('keeps supporting evidence even if only primary is needed', () => {
    const result = verifyProposal(
      makeProposal({
        evidence: [
          {
            conversation_id: 'conv_1',
            turn_hash: 'sha256:turn1',
            quoted_text: 'love dark mode',
            role: 'primary',
            relevance: 'stated',
          },
          {
            conversation_id: 'conv_1',
            turn_hash: 'sha256:turn2',
            quoted_text: 'reducing eye strain',
            role: 'supporting',
            relevance: 'confirms',
          },
        ],
      }),
      existingSPs,
      turns
    );
    expect(result).not.toBeNull();
    expect(result!.evidence).toHaveLength(2);
  });

  it('passes modify proposal with valid target', () => {
    const sps: SemanticPoint[] = [{
      id: 'sp_existing1',
      text: 'User likes dark mode.',
      extraction_mode: 'llm_extracted',
      status: 'auto_landed',
      zone: 'ready',
      evidence: [],
      confidence: 0.9,
      position: 0,
      staged: true,
    }];

    const result = verifyProposal(
      makeProposal({ type: 'modify', target_sp_id: 'sp_existing1' }),
      sps,
      turns
    );
    expect(result).not.toBeNull();
  });

  it('rejects modify proposal with missing target', () => {
    const result = verifyProposal(
      makeProposal({ type: 'modify', target_sp_id: 'sp_nonexistent' }),
      existingSPs,
      turns
    );
    expect(result).toBeNull();
  });
});
