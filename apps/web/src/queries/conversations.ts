/**
 * L3 — conversation list reader (read-only per v2 §2.3).
 *
 * Writes (create, delete, update) live in @/commands/conversations
 * per v2 §2.4.
 */

import { listConversations } from '@/infrastructure/conversations';
import type { ConversationListData } from '@/infrastructure/types';

export function fetchConversations(
  projectId: string,
  limit = 100,
  offset = 0
): Promise<ConversationListData> {
  return listConversations(projectId, limit, offset);
}
