import type { SemanticContent, SlotValue } from '@t3x-dev/core';

interface Sentence {
  id: string;
  text: string;
  confidence: number;
  source_ref?: {
    conversation_id?: string;
    turn_hash?: string;
    start_char?: number;
    end_char?: number;
  };
}

function slotValueToString(value: SlotValue): string {
  if (Array.isArray(value)) return value.map(slotValueToString).join(', ');
  if (typeof value === 'object' && value !== null) {
    if ('ref' in value) return String(value.ref);
    if ('type' in value && 'slots' in value) {
      const inlineFrame = value as { type: string; slots: Record<string, SlotValue> };
      return Object.values(inlineFrame.slots).map(slotValueToString).join(', ');
    }
  }
  return String(value);
}

/** Convert SemanticContent frames into Sentence[] for CommitV4 content */
export function framesToSentences(content: SemanticContent, conversationId?: string): Sentence[] {
  return content.frames.map((frame) => {
    // Combine slot values into a natural-language sentence
    const slotParts = Object.entries(frame.slots).map(([key, value]) => {
      return `${key}: ${slotValueToString(value)}`;
    });

    const text = `[${frame.type}] ${slotParts.join('; ')}`;
    const id = `s_${frame.id.replace('f_', '')}`;

    let source_ref: Sentence['source_ref'] | undefined;
    if (frame.slot_sources) {
      const firstSource = Object.values(frame.slot_sources)[0];
      if (firstSource) {
        source_ref = {
          conversation_id: conversationId,
          turn_hash: firstSource.turn_hash ?? firstSource.turn,
          start_char: firstSource.start_char,
          end_char: firstSource.end_char,
        };
      }
    } else if (frame.source) {
      source_ref = {
        conversation_id: conversationId,
        turn_hash: frame.source,
      };
    }

    return {
      id,
      text,
      confidence: frame.confidence ?? 1.0,
      source_ref,
    };
  });
}
