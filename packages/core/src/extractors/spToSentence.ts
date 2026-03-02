/**
 * SemanticPoint → SentenceV5 Converter
 *
 * Converts a SemanticPoint to a SentenceV5 for commit.
 * - Primary evidence → source_ref
 * - Supporting evidence → supporting_refs
 * - inference_type → anchor_type mapping
 */

import { nanoid } from 'nanoid';
import type { SemanticPoint, SentenceSourceRef, SentenceV5 } from '../types/v4';

const INFERENCE_TO_ANCHOR: Record<string, SentenceV5['anchor_type']> = {
  direct: 'verbatim',
  paraphrase: 'paraphrase',
  cross_turn: 'inference',
  implicit: 'inference',
};

export function spToSentence(sp: SemanticPoint): SentenceV5 {
  const enabledEvidence = sp.evidence.filter((e) => e.enabled);
  const primary = enabledEvidence.find((e) => e.role === 'primary');
  const supporting = enabledEvidence.filter((e) => e.role === 'supporting');

  const sourceRef: SentenceSourceRef | undefined = primary
    ? {
        conversation_id: primary.conversation_id,
        turn_hash: primary.turn_hash,
        start_char: primary.start_char,
        end_char: primary.end_char,
      }
    : undefined;

  const supportingRefs: SentenceSourceRef[] = supporting.map((e) => ({
    conversation_id: e.conversation_id,
    turn_hash: e.turn_hash,
    start_char: e.start_char,
    end_char: e.end_char,
  }));

  return {
    id: `s_${nanoid(12)}`,
    text: sp.text,
    confidence: sp.confidence,
    source_ref: sourceRef,
    supporting_refs: supportingRefs,
    anchor_type: sp.inference_type ? INFERENCE_TO_ANCHOR[sp.inference_type] : undefined,
  };
}
