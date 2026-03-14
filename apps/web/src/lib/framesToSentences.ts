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
export function framesToSentences(content: SemanticContent): Sentence[] {
  return content.frames.map((frame) => {
    // Combine slot values into a natural-language sentence
    const slotParts = Object.entries(frame.slots).map(([key, value]) => {
      return `${key}: ${slotValueToString(value)}`;
    });

    const text = `[${frame.type}] ${slotParts.join('; ')}`;
    const id = `s_${frame.id.replace('f_', '')}`;

    return {
      id,
      text,
      confidence: frame.confidence ?? 1.0,
      source_ref: frame.source ? { turn_hash: frame.source } : undefined,
    };
  });
}
