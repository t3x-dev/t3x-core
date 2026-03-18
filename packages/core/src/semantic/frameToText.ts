/**
 * Frame-to-Text Converter
 *
 * Converts SemanticContent frames into text representations
 * for use in LLM prompts, context builders, and other text-consuming functions.
 *
 * This is the bridge between V5 frame-based commits and functions
 * that expect text input (leaf generation, context building, etc.).
 */

import type { Frame, SemanticContent, SlotValue } from './types';

/**
 * A text segment extracted from a frame, compatible with sentence-consuming APIs.
 */
export interface FrameTextSegment {
  /** Frame ID (e.g., "f_001") */
  id: string;
  /** Human-readable text representation of the frame */
  text: string;
}

/**
 * Convert a single SlotValue to a readable string.
 */
function slotValueToString(value: SlotValue, depth = 0): string {
  if (depth > 5) return '...';

  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((v) => slotValueToString(v, depth + 1)).join(', ');

  if (typeof value === 'object' && value !== null) {
    // SlotRef
    if ('ref' in value) return `→${(value as { ref: string }).ref}`;
    // InlineFrame
    if ('type' in value && 'slots' in value) {
      const inline = value as { type: string; slots: Record<string, SlotValue> };
      const parts = Object.entries(inline.slots)
        .map(([k, v]) => `${k}: ${slotValueToString(v, depth + 1)}`)
        .join(', ');
      return `[${inline.type}] ${parts}`;
    }
  }

  return String(value);
}

/**
 * Convert a single frame to a text segment.
 */
export function frameToText(frame: Frame): FrameTextSegment {
  const slotParts = Object.entries(frame.slots)
    .map(([key, value]) => `${key}: ${slotValueToString(value)}`)
    .join('; ');

  return {
    id: frame.id,
    text: `[${frame.type}] ${slotParts}`,
  };
}

/**
 * Convert all frames in a SemanticContent to text segments.
 */
export function framesToTextSegments(content: SemanticContent): FrameTextSegment[] {
  return content.frames.map(frameToText);
}

/**
 * Convert SemanticContent to a numbered text list (like sentence display).
 * Compatible with buildLeafPrompt's sentenceTexts format.
 */
export function framesToNumberedText(content: SemanticContent): string {
  return content.frames.map((frame, i) => `${i + 1}. ${frameToText(frame).text}`).join('\n');
}
