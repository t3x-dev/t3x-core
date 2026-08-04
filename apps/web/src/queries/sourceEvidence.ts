/** L3 read boundary for repository source/evidence views. */

import { getConversationSourceEvidence } from '@/infrastructure/sourceEvidence';
import type { ConversationSourceEvidence } from '@/types/sourceEvidence';

export function fetchConversationSourceEvidence(
  projectId: string,
  conversationId: string,
  options: { limit?: number; offset?: number; signal?: AbortSignal } = {}
): Promise<ConversationSourceEvidence> {
  return getConversationSourceEvidence(projectId, conversationId, options);
}
