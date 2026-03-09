/**
 * Proposal Verifier
 *
 * Verifies an ExtractionProposal against source data:
 * 1. For modify proposals, check target SP exists
 * 2. Check evidence anchors (turn existence + quote location via fuzzyLocate)
 * 3. (Optional) L2 semantic overlap detection via embeddings
 * 4. Coverage warning: flag if evidence covers <60% of primary turn content
 *
 * Returns verified proposal with LocatedEvidence[] or null if rejected.
 */

import type { EmbeddingProvider } from '../providers/embedding/base';
import type { ExtractionProposal, LocatedEvidence, SemanticPoint } from '../types/v4';
import type { TurnInput } from './extractionPrompt';
import { fuzzyLocate } from './fuzzyLocate';

export type OverlapStatus = 'duplicate' | 'potential_conflict' | 'unique';

export interface OverlapResult {
  status: OverlapStatus;
  matched_sp_id: string;
  cosine: number;
}

export interface VerifiedProposal {
  type: ExtractionProposal['type'];
  target_sp_id?: string;
  text: string;
  confidence: number;
  inference_type: ExtractionProposal['inference_type'];
  reasoning: string;
  evidence: LocatedEvidence[];
  overlap?: OverlapResult;
  /** Check 4: true when evidence covers <60% of primary turn content */
  low_coverage?: boolean;
}

export interface VerifyOptions {
  embedder?: EmbeddingProvider;
  existingEmbeddings?: Map<string, number[]>;
}

export function verifyProposal(
  proposal: ExtractionProposal,
  existingSPs: SemanticPoint[],
  turns: TurnInput[]
): VerifiedProposal | null;
export function verifyProposal(
  proposal: ExtractionProposal,
  existingSPs: SemanticPoint[],
  turns: TurnInput[],
  options: VerifyOptions
): Promise<VerifiedProposal | null>;
export function verifyProposal(
  proposal: ExtractionProposal,
  existingSPs: SemanticPoint[],
  turns: TurnInput[],
  options?: VerifyOptions
): Promise<VerifiedProposal | null> | VerifiedProposal | null {
  // Check 1: For modify/reinforce proposals, target must exist
  if ((proposal.type === 'modify' || proposal.type === 'reinforce') && proposal.target_sp_id) {
    const targetExists = existingSPs.some(
      (sp) => sp.id === proposal.target_sp_id && sp.status !== 'undone'
    );
    if (!targetExists) return null;
  }

  // Build turn lookup
  const turnMap = new Map<string, TurnInput>();
  for (const turn of turns) {
    turnMap.set(turn.turn_hash, turn);
  }

  // Check 2: Verify each evidence anchor
  const verifiedEvidence: LocatedEvidence[] = [];
  let hasPrimary = false;

  for (const anchor of proposal.evidence) {
    let turn = turnMap.get(anchor.turn_hash);
    if (!turn) {
      // Cross-turn fallback: LLM may have hallucinated the turn_hash,
      // so search all turns for the quoted text before rejecting.
      // Pick the turn with the highest match score.
      let bestScore = 0;
      for (const candidateTurn of turns) {
        const loc = fuzzyLocate(candidateTurn.content, anchor.quoted_text);
        if (loc && loc.score > bestScore) {
          bestScore = loc.score;
          turn = candidateTurn;
        }
      }
      if (!turn) {
        if (anchor.role === 'primary') return null;
        continue;
      }
    }

    // Locate quote in turn content
    const location = fuzzyLocate(turn.content, anchor.quoted_text);
    if (!location) {
      // Quote not locatable — if primary, reject
      if (anchor.role === 'primary') return null;
      continue; // Skip unlocatable supporting evidence
    }

    verifiedEvidence.push({
      conversation_id: turn.conversation_id,
      turn_hash: turn.turn_hash,
      quoted_text: anchor.quoted_text,
      start_char: location.start,
      end_char: location.end,
      match_score: location.score,
      role: anchor.role,
      relevance: anchor.relevance,
      enabled: true,
    });

    if (anchor.role === 'primary') hasPrimary = true;
  }

  // Must have at least one primary evidence
  if (!hasPrimary) return null;

  // Check 4: Coverage warning (non-blocking)
  // If evidence quotes cover <60% of the primary turn content, flag it
  const COVERAGE_THRESHOLD = 0.6;
  let lowCoverage: boolean | undefined;

  const primaryTurnHashes = new Set(
    verifiedEvidence.filter((e) => e.role === 'primary').map((e) => e.turn_hash)
  );
  if (primaryTurnHashes.size > 0) {
    let totalTurnChars = 0;
    let coveredChars = 0;
    for (const hash of primaryTurnHashes) {
      const turn = turnMap.get(hash);
      if (turn) {
        totalTurnChars += turn.content.length;
        const ranges = verifiedEvidence
          .filter((e) => e.turn_hash === hash)
          .map((e) => ({ start: e.start_char, end: e.end_char }));
        coveredChars += mergeAndCountRanges(ranges);
      }
    }
    if (totalTurnChars > 0 && coveredChars / totalTurnChars < COVERAGE_THRESHOLD) {
      lowCoverage = true;
    }
  }

  const base: VerifiedProposal = {
    type: proposal.type,
    target_sp_id: proposal.target_sp_id,
    text: proposal.text,
    confidence: proposal.confidence,
    inference_type: proposal.inference_type,
    reasoning: proposal.reasoning,
    evidence: verifiedEvidence,
    ...(lowCoverage ? { low_coverage: true } : {}),
  };

  // Check 3 (Optional): L2 semantic overlap detection
  if (options?.embedder && options.existingEmbeddings && options.existingEmbeddings.size > 0) {
    return detectOverlap(base, options.embedder, options.existingEmbeddings);
  }

  return base;
}

/**
 * Merge overlapping character ranges and return total covered length.
 */
function mergeAndCountRanges(ranges: Array<{ start: number; end: number }>): number {
  if (ranges.length === 0) return 0;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= curEnd) {
      curEnd = Math.max(curEnd, sorted[i].end);
    } else {
      total += curEnd - curStart;
      curStart = sorted[i].start;
      curEnd = sorted[i].end;
    }
  }
  total += curEnd - curStart;
  return total;
}

async function detectOverlap(
  proposal: VerifiedProposal,
  embedder: EmbeddingProvider,
  existingEmbeddings: Map<string, number[]>
): Promise<VerifiedProposal> {
  const [proposalVec] = await embedder.encode([proposal.text]);

  let bestCosine = -1;
  let bestSpId = '';

  for (const [spId, vec] of existingEmbeddings) {
    const cosine = embedder.similarity(proposalVec, vec);
    if (cosine > bestCosine) {
      bestCosine = cosine;
      bestSpId = spId;
    }
  }

  if (bestCosine < 0 || bestSpId === '') return proposal;

  let status: OverlapStatus;
  if (bestCosine >= 0.95) {
    status = 'duplicate';
  } else if (bestCosine >= 0.85) {
    status = 'potential_conflict';
  } else {
    status = 'unique';
  }

  return {
    ...proposal,
    overlap: { status, matched_sp_id: bestSpId, cosine: bestCosine },
  };
}
