/**
 * Proposal Verifier
 *
 * Verifies an ExtractionProposal against source data:
 * 1. Check turn existence (turn_hash lookup)
 * 2. Check quote location (fuzzyLocate)
 * 3. For modify proposals, check target SP exists
 *
 * Returns verified proposal with LocatedEvidence[] or null if rejected.
 */

import type { ExtractionProposal, LocatedEvidence, SemanticPoint } from '../types/v4';
import type { TurnInput } from './extractionPrompt';
import { fuzzyLocate } from './fuzzyLocate';

export interface VerifiedProposal {
  type: ExtractionProposal['type'];
  target_sp_id?: string;
  text: string;
  confidence: number;
  inference_type: ExtractionProposal['inference_type'];
  reasoning: string;
  evidence: LocatedEvidence[];
}

export function verifyProposal(
  proposal: ExtractionProposal,
  existingSPs: SemanticPoint[],
  turns: TurnInput[]
): VerifiedProposal | null {
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
    const turn = turnMap.get(anchor.turn_hash);
    if (!turn) {
      // Turn not found — if primary, reject entire proposal
      if (anchor.role === 'primary') return null;
      continue; // Skip missing supporting evidence
    }

    // Locate quote in turn content
    const location = fuzzyLocate(turn.content, anchor.quoted_text);
    if (!location) {
      // Quote not locatable — if primary, reject
      if (anchor.role === 'primary') return null;
      continue; // Skip unlocatable supporting evidence
    }

    verifiedEvidence.push({
      conversation_id: anchor.conversation_id,
      turn_hash: anchor.turn_hash,
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

  return {
    type: proposal.type,
    target_sp_id: proposal.target_sp_id,
    text: proposal.text,
    confidence: proposal.confidence,
    inference_type: proposal.inference_type,
    reasoning: proposal.reasoning,
    evidence: verifiedEvidence,
  };
}
