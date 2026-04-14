/**
 * L3 — imperative read helpers for chat-init orchestration.
 *
 * useChatInit does a few one-shot fetches during mount/conversation-switch
 * (parent commit for inheritance, conversation metadata, topic list). These
 * are thin wrappers over the `@/infrastructure/*` L1 adapters so that
 * `useChatInit` never imports infrastructure directly.
 */

import { type ApiCommit, getApiCommit } from '@/infrastructure/commits';
import { getConversation } from '@/infrastructure/conversations';
import { listTopics, type Topic } from '@/infrastructure/topics';
import type { Conversation } from '@/infrastructure/types';

export async function fetchCommitForInheritance(hash: string): Promise<ApiCommit> {
  return getApiCommit(hash);
}

export async function fetchConversationMeta(convId: string): Promise<Conversation | null> {
  try {
    return await getConversation(convId);
  } catch {
    return null;
  }
}

export async function fetchConversationTopics(convId: string): Promise<Topic[]> {
  try {
    return await listTopics(convId);
  } catch {
    return [];
  }
}
