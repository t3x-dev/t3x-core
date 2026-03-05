/**
 * Multimodal content blocks for turns.
 *
 * All functions are pure — no DB, no IO, no side effects.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ImageBlock {
  type: 'image';
  url: string;
  alt?: string;
  ocr_text?: string;
  mime_type?: string;
}

export interface AudioBlock {
  type: 'audio';
  url: string;
  transcript?: string;
  duration_ms?: number;
  mime_type?: string;
}

export interface FileBlock {
  type: 'file';
  url: string;
  filename: string;
  mime_type: string;
}

export type ContentBlock = TextBlock | ImageBlock | AudioBlock | FileBlock;

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Extract plain text from ContentBlock[].
 * Used to populate the `content` TEXT column for backward compatibility,
 * search, and extraction pipelines.
 */
export function textFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'text':
          return block.text;
        case 'image':
          return block.ocr_text
            ? `[Image: ${block.alt ?? 'image'}] ${block.ocr_text}`
            : `[Image: ${block.alt ?? 'image'}]`;
        case 'audio':
          return block.transcript
            ? `[Audio] ${block.transcript}`
            : `[Audio: ${block.duration_ms ?? 0}ms]`;
        case 'file':
          return `[File: ${block.filename}]`;
        default: {
          const _exhaustive: never = block;
          return '';
        }
      }
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Convert a plain text string to a single TextBlock array.
 */
export function textToBlocks(text: string): ContentBlock[] {
  return [{ type: 'text', text }];
}

/**
 * Check if blocks contain only a single text block (text-only turn).
 */
export function isTextOnly(blocks: ContentBlock[]): boolean {
  return blocks.length === 1 && blocks[0].type === 'text';
}
