import { describe, expect, it, vi } from 'vitest';
import type { EmbeddingProvider } from '../../providers/embedding/base';
import type { ExtractionProposal, SemanticPoint } from '../../types/v4';
import type { TurnInput } from '../extractionPrompt';
import { verifyProposal } from '../verifyProposal';

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
    evidence: [
      {
        conversation_id: 'conv_1',
        turn_hash: 'sha256:turn1',
        quoted_text: 'love dark mode for coding',
        role: 'primary',
        relevance: 'directly stated',
      },
    ],
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

  it('recovers via cross-turn fallback when turn_hash is wrong but quote exists', () => {
    const result = verifyProposal(
      makeProposal({
        evidence: [
          {
            conversation_id: 'conv_1',
            turn_hash: 'sha256:nonexistent',
            quoted_text: 'dark mode',
            role: 'primary',
            relevance: 'stated',
          },
        ],
      }),
      existingSPs,
      turns
    );
    // Cross-turn fallback finds "dark mode" in turn1
    expect(result).not.toBeNull();
    expect(result!.evidence[0].turn_hash).toBe('sha256:turn1');
  });

  it('rejects proposal when turn_hash wrong AND quote not in any turn', () => {
    const result = verifyProposal(
      makeProposal({
        evidence: [
          {
            conversation_id: 'conv_1',
            turn_hash: 'sha256:nonexistent',
            quoted_text: 'this text does not exist in any turn content at all',
            role: 'primary',
            relevance: 'stated',
          },
        ],
      }),
      existingSPs,
      turns
    );
    expect(result).toBeNull();
  });

  it('rejects proposal with unlocatable quote', () => {
    const result = verifyProposal(
      makeProposal({
        evidence: [
          {
            conversation_id: 'conv_1',
            turn_hash: 'sha256:turn1',
            quoted_text: 'this text does not exist anywhere in the conversation at all',
            role: 'primary',
            relevance: 'stated',
          },
        ],
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
    const sps: SemanticPoint[] = [
      {
        id: 'sp_existing1',
        text: 'User likes dark mode.',
        extraction_mode: 'llm_extracted',
        status: 'auto_landed',
        zone: 'ready',
        evidence: [],
        confidence: 0.9,
        position: 0,
        staged: true,
      },
    ];

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

  describe('cross-turn fallback', () => {
    it('finds quote in another turn when turn_hash is wrong', () => {
      const result = verifyProposal(
        makeProposal({
          evidence: [
            {
              conversation_id: 'conv_1',
              turn_hash: 'sha256:hallucinated_hash',
              quoted_text: 'love dark mode for coding',
              role: 'primary',
              relevance: 'stated',
            },
          ],
        }),
        existingSPs,
        turns
      );
      expect(result).not.toBeNull();
      // Should have resolved to the actual turn
      expect(result!.evidence[0].turn_hash).toBe('sha256:turn1');
      expect(result!.evidence[0].conversation_id).toBe('conv_1');
    });

    it('still rejects when quote is not in any turn', () => {
      const result = verifyProposal(
        makeProposal({
          evidence: [
            {
              conversation_id: 'conv_1',
              turn_hash: 'sha256:hallucinated_hash',
              quoted_text: 'this text is nowhere to be found in any turn content',
              role: 'primary',
              relevance: 'stated',
            },
          ],
        }),
        existingSPs,
        turns
      );
      expect(result).toBeNull();
    });

    it('uses correct conversation_id from fallback turn', () => {
      const multiConvTurns: TurnInput[] = [
        ...turns,
        {
          conversation_id: 'conv_2',
          turn_hash: 'sha256:turn3',
          role: 'user',
          content: 'I need a REST API endpoint for authentication.',
        },
      ];
      const result = verifyProposal(
        makeProposal({
          evidence: [
            {
              conversation_id: 'conv_1',
              turn_hash: 'sha256:wrong_hash',
              quoted_text: 'REST API endpoint for authentication',
              role: 'primary',
              relevance: 'stated',
            },
          ],
        }),
        existingSPs,
        multiConvTurns
      );
      expect(result).not.toBeNull();
      expect(result!.evidence[0].turn_hash).toBe('sha256:turn3');
      expect(result!.evidence[0].conversation_id).toBe('conv_2');
    });
  });
});

describe('overlap detection (L2)', () => {
  // Vectors: identical → cosine 1.0, orthogonal → cosine 0.0
  const vecA = [1, 0, 0];
  const _vecSimilar = [0.98, 0.1, 0.1]; // cosine ~0.97
  const _vecModerate = [0.7, 0.7, 0.1]; // cosine ~0.70
  const vecDifferent = [0, 0, 1]; // cosine 0.0

  function makeMockEmbedder(returnVec: number[]): EmbeddingProvider {
    return {
      id: 'mock:test',
      dim: 3,
      encode: vi.fn().mockResolvedValue([returnVec]),
      similarity: (a, b) => {
        let dot = 0,
          na = 0,
          nb = 0;
        for (let i = 0; i < a.length; i++) {
          dot += a[i] * b[i];
          na += a[i] * a[i];
          nb += b[i] * b[i];
        }
        const d = Math.sqrt(na) * Math.sqrt(nb);
        return d === 0 ? 0 : dot / d;
      },
    };
  }

  const spsWithEmbedding: SemanticPoint[] = [
    {
      id: 'sp_existing',
      text: 'User likes dark mode.',
      extraction_mode: 'llm_extracted',
      status: 'auto_landed',
      zone: 'ready',
      evidence: [],
      confidence: 0.9,
      position: 0,
      staged: true,
    },
  ];

  it('returns duplicate when cosine >= 0.95', async () => {
    const embedder = makeMockEmbedder(vecA);
    const result = await verifyProposal(makeProposal(), spsWithEmbedding, turns, {
      embedder,
      existingEmbeddings: new Map([['sp_existing', vecA]]),
    });
    expect(result).not.toBeNull();
    expect(result!.overlap).toBeDefined();
    expect(result!.overlap!.status).toBe('duplicate');
    expect(result!.overlap!.matched_sp_id).toBe('sp_existing');
  });

  it('returns potential_conflict for cosine in [0.85, 0.95)', async () => {
    // vecForConflict embedded against vecA: cosine ~0.90
    const vecForConflict = [0.9, 0.4, 0.1];
    const embedder = makeMockEmbedder(vecForConflict);
    const result = await verifyProposal(makeProposal(), spsWithEmbedding, turns, {
      embedder,
      existingEmbeddings: new Map([['sp_existing', vecA]]),
    });
    expect(result).not.toBeNull();
    expect(result!.overlap).toBeDefined();
    expect(result!.overlap!.status).toBe('potential_conflict');
    expect(result!.overlap!.cosine).toBeGreaterThanOrEqual(0.85);
    expect(result!.overlap!.cosine).toBeLessThan(0.95);
  });

  it('returns unique for cosine < 0.85', async () => {
    const embedder = makeMockEmbedder(vecDifferent);
    const result = await verifyProposal(makeProposal(), spsWithEmbedding, turns, {
      embedder,
      existingEmbeddings: new Map([['sp_existing', vecA]]),
    });
    expect(result).not.toBeNull();
    expect(result!.overlap).toBeDefined();
    expect(result!.overlap!.status).toBe('unique');
  });

  it('skips overlap when no embedder provided', () => {
    const result = verifyProposal(makeProposal(), existingSPs, turns);
    expect(result).not.toBeNull();
    expect(result!.overlap).toBeUndefined();
  });

  it('skips overlap when existingEmbeddings is empty', async () => {
    const embedder = makeMockEmbedder(vecA);
    const result = await verifyProposal(makeProposal(), existingSPs, turns, {
      embedder,
      existingEmbeddings: new Map(),
    });
    expect(result).not.toBeNull();
    expect(result!.overlap).toBeUndefined();
  });
});
