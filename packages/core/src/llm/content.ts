import type { ContentBlock, LLMPrompt } from './types';

/** Prompt image block, Anthropic-shaped so the Claude adapter can forward it unchanged. */
export interface PromptImageBlock extends ContentBlock {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
}

export type PromptPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string };

export function promptImageBlock(mediaType: string, data: string): PromptImageBlock {
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

export function isPromptImageBlock(block: ContentBlock): block is PromptImageBlock {
  const source = block.source as Record<string, unknown> | undefined;
  return (
    block.type === 'image' &&
    source?.type === 'base64' &&
    typeof source.media_type === 'string' &&
    typeof source.data === 'string'
  );
}

/**
 * Text and image parts of a message, or null when it carries any other block
 * (tool calls, tool results, provider-specific items) that the caller must map itself.
 */
export function textAndImageParts(content: string | ContentBlock[]): PromptPart[] | null {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  const parts: PromptPart[] = [];
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push({ type: 'text', text: block.text });
    } else if (isPromptImageBlock(block)) {
      parts.push({ type: 'image', mediaType: block.source.media_type, data: block.source.data });
    } else {
      return null;
    }
  }
  return parts;
}

export function imageDataUrl(part: { mediaType: string; data: string }): string {
  return `data:${part.mediaType};base64,${part.data}`;
}

/** Prompt size without inline image bytes; images are budgeted by count, not characters. */
export function promptTextLength(prompt: LLMPrompt): number {
  return JSON.stringify(prompt, (_key, value) =>
    value && typeof value === 'object' && isPromptImageBlock(value as ContentBlock)
      ? { type: 'image' }
      : value
  ).length;
}
