/**
 * Repository-facing Generation capability.
 *
 * The compatibility wire paths remain `/v1/chat*`; this object is the neutral
 * application boundary consumed by Workspaces and other repository surfaces.
 */

import {
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type ChatStreamEvent,
  type Citation,
  type ContentBlock,
  chat,
  chatStream,
} from './chat';

export type GenerationContentBlock = ContentBlock;
export type GenerationMessage = ChatMessage;
export type GenerationRequest = ChatRequest;
export type GenerationResponse = ChatResponse;
export type GenerationStreamEvent = ChatStreamEvent;
export type GenerationCitation = Citation;

export const generationApi = Object.freeze({
  complete: chat,
  stream: chatStream,
});
