/**
 * commands/conversations — v2 §2.4 aggregate command module.
 *
 * Source policy: none.
 * Optimistic-update style: all-or-nothing (create); fire-and-forget
 *   (delete + position-update from canvas/lib paths).
 * Error surface: ConversationPersistenceError (extends CommandError).
 */

export { createConversation } from './createConversation';
export { deleteConversation } from './deleteConversation';
export { ConversationPersistenceError } from './errors';
export { type UpdateConversationInput, updateConversation } from './updateConversation';
export { updateConversationContextPins } from './updateConversationContextPins';
