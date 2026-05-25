/**
 * L3 read — structured context manifest for conversation context UI.
 */

import {
  type ConversationContextManifest,
  getContextManifest,
} from '@/infrastructure/contextManifest';

export function fetchContextManifest(conversationId: string): Promise<ConversationContextManifest> {
  return getContextManifest(conversationId);
}

export type { ConversationContextManifest };
