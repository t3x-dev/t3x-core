/**
 * Durable Source Thread capability for repository surfaces.
 *
 * A Source Thread owns metadata, immutable turns, and server-assembled context.
 * It does not own proposals, validation, decisions, or commits.
 */

import { createConversation, updateConversation } from './conversations';
import { ApiError } from './core';
import { getConversationMemory } from './pins';
import { createSourceChatDraftReply } from './sourceChatDraftReplies';
import { createTurn, listTurns } from './turns';

export const sourceThreadApi = Object.freeze({
  create: createConversation,
  update: updateConversation,
  listTurns,
  appendTurn: createTurn,
  memory: getConversationMemory,
  draftReply: createSourceChatDraftReply,
});

export function isSourceThreadRequestAborted(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ABORTED';
}
