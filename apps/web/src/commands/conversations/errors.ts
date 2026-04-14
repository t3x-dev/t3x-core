/**
 * L3 — typed errors for the conversations aggregate (v2 §2.4 contract).
 *
 * Source policy: NONE for the conversation envelope itself. Per-turn
 * provenance lives on individual turn records (turn_hash chain), not
 * here. Conversation-context binding (`updateConversationContext`) is
 * a separate cross-aggregate flow handled by hooks/useRetuneSession
 * (infra direct, since no commands/context/ module exists yet).
 *
 * Optimistic-update style: all-or-nothing, mostly fire-and-forget on
 * the canvas slice paths:
 *   - createConversation: hook awaits server response, then appends
 *     a node + edge to canvas state.
 *   - deleteConversation: canvas slice removes nodes locally first
 *     (sync), then this command's call is fire-and-forget through
 *     useCanvasDeletionWiring's handler — failures are silently
 *     swallowed so the canvas stays clean.
 *   - updateConversation: lib/nodePositionSaver fires-and-forgets
 *     position writes; UI already reflects the drag.
 */

import { CommandError } from '../CommandError';

export class ConversationPersistenceError extends CommandError {
  constructor(message: string, cause?: unknown) {
    super('conversation_persistence', message, cause);
    this.name = 'ConversationPersistenceError';
  }
}
