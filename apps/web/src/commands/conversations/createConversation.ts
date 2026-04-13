/**
 * L3 command — create a conversation under a project.
 */

import { createConversation as createConversationInfra } from '@/infrastructure/conversations';
import type { Conversation } from '@/infrastructure/types';
import { ConversationPersistenceError } from './errors';

export async function createConversation(
  projectId: string,
  title?: string,
  parentCommitHash?: string,
  position?: { x: number; y: number },
  metadata?: Record<string, unknown>
): Promise<Conversation> {
  try {
    return await createConversationInfra(projectId, title, parentCommitHash, position, metadata);
  } catch (cause) {
    throw new ConversationPersistenceError(
      cause instanceof Error ? cause.message : 'createConversation failed',
      cause
    );
  }
}
