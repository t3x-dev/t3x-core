/**
 * Extraction Pipeline Latency Benchmarks (S13)
 *
 * Measures the performance of the three core extraction pipeline functions:
 * - buildIncrementalPrompt: prompt construction from SPs + turns
 * - parseIncrementalResponse: JSON parsing + validation of LLM output
 * - verifyProposal: evidence verification + fuzzy quote location (sync, no embeddings)
 */

import { bench, describe } from 'vitest';
import type { TurnInput } from '../../extractors/extractionPrompt';
import { parseIncrementalResponse } from '../../extractors/incrementalParser';
import { buildIncrementalPrompt } from '../../extractors/incrementalPrompt';
import { verifyProposal } from '../../extractors/verifyProposal';
import type { ExtractionProposal, SemanticPoint } from '../../types/v4';

// ═══════════════════════════════════════════════════════════════════════════
// Test Data Generators
// ═══════════════════════════════════════════════════════════════════════════

function makeTurn(i: number): TurnInput {
  return {
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `This is turn ${i}. It contains some information about topic ${i % 5}. The user discussed preferences regarding item ${i * 3} and mentioned constraints about ${i % 7 === 0 ? 'important' : 'regular'} things.`,
    turn_hash: `sha256:turn_${i.toString().padStart(4, '0')}`,
    conversation_id: 'conv_bench',
  };
}

function makeSP(i: number): SemanticPoint {
  return {
    id: `sp_${i}`,
    text: `Semantic point ${i}: The user prefers ${i % 2 === 0 ? 'option A' : 'option B'} for category ${i % 5}.`,
    extraction_mode: 'llm_extracted',
    status: 'reviewed',
    zone: 'ready',
    evidence: [
      {
        conversation_id: 'conv_bench',
        turn_hash: `sha256:turn_${i}`,
        quoted_text: `prefers ${i % 2 === 0 ? 'option A' : 'option B'}`,
        start_char: 0,
        end_char: 20,
        match_score: 1.0,
        role: 'primary',
        relevance: 'Direct statement of preference',
        enabled: true,
      },
    ],
    confidence: 0.85 + (i % 10) * 0.01,
    position: i,
    staged: true,
  };
}

/** Build a mock LLM JSON response containing `count` proposals. */
function makeLLMResponse(count: number): string {
  const inferenceTypes = ['direct', 'paraphrase', 'cross_turn', 'implicit'];
  const proposals = Array.from({ length: count }, (_, i) => ({
    type: 'new',
    text: `Extracted point ${i}: user wants feature ${i}`,
    confidence: 0.8 + Math.random() * 0.2,
    inference_type: inferenceTypes[i % 4],
    reasoning: `Turn ${i} explicitly states this preference`,
    evidence: [
      {
        conversation_id: 'conv_bench',
        turn_hash: `sha256:turn_${i.toString().padStart(4, '0')}`,
        quoted_text: `wants feature ${i}`,
        role: 'primary',
        relevance: 'Direct statement of feature request',
      },
    ],
  }));
  return JSON.stringify(proposals);
}

// ═══════════════════════════════════════════════════════════════════════════
// Benchmarks: buildIncrementalPrompt
// ═══════════════════════════════════════════════════════════════════════════

describe('buildIncrementalPrompt', () => {
  const turns10 = Array.from({ length: 10 }, (_, i) => makeTurn(i));
  const turns50 = Array.from({ length: 50 }, (_, i) => makeTurn(i));
  const turns100 = Array.from({ length: 100 }, (_, i) => makeTurn(i));

  const sps10 = Array.from({ length: 10 }, (_, i) => makeSP(i));
  const sps50 = Array.from({ length: 50 }, (_, i) => makeSP(i));
  const sps100 = Array.from({ length: 100 }, (_, i) => makeSP(i));

  bench('10-round conversation', () => {
    buildIncrementalPrompt(sps10, turns10, []);
  });

  bench('50-round conversation', () => {
    buildIncrementalPrompt(sps50, turns50, []);
  });

  bench('100-round conversation', () => {
    buildIncrementalPrompt(sps100, turns100, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Benchmarks: parseIncrementalResponse
// ═══════════════════════════════════════════════════════════════════════════

describe('parseIncrementalResponse', () => {
  const response5 = makeLLMResponse(5);
  const response20 = makeLLMResponse(20);
  const response50 = makeLLMResponse(50);

  bench('5 proposals', () => {
    parseIncrementalResponse(response5);
  });

  bench('20 proposals', () => {
    parseIncrementalResponse(response20);
  });

  bench('50 proposals', () => {
    parseIncrementalResponse(response50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Benchmarks: verifyProposal (sync, no embeddings)
// ═══════════════════════════════════════════════════════════════════════════

describe('verifyProposal (sync, no embeddings)', () => {
  const turns = Array.from({ length: 50 }, (_, i) => makeTurn(i));
  const sps = Array.from({ length: 50 }, (_, i) => makeSP(i));
  const proposal: ExtractionProposal = {
    type: 'new',
    text: 'User prefers option A for category 3.',
    confidence: 0.9,
    inference_type: 'direct',
    reasoning: 'Direct statement in turn 6',
    evidence: [
      {
        conversation_id: 'conv_bench',
        turn_hash: 'sha256:turn_0006',
        quoted_text: 'preferences regarding item 18',
        role: 'primary',
        relevance: 'Turn 6 explicitly states the preference',
      },
    ],
  };

  bench('single proposal against 50 SPs', () => {
    verifyProposal(proposal, sps, turns);
  });
});
