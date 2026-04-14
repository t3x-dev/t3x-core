/**
 * useRetuneSession — view-facing API for the re-tune flow.
 *
 * Creates (or reuses) a leaf pin carrying selected assertion lessons,
 * spawns a new conversation branched from the leaf's commit, and binds
 * the pin to that conversation's context so the LLM receives the
 * lessons as system-level memory.
 *
 * Previously `lib/retune.ts` owned this as a pure async helper that
 * imported directly from @/infrastructure. Per v2 §2.6, cross-aggregate
 * orchestration belongs in hooks/ where it can freely compose commands
 * across aggregates (pins + conversations) and talk to infrastructure
 * for the conversation-context side-effect that does not yet have its
 * own commands/<agg>/ module.
 */

import { useCallback } from 'react';
import { createConversation } from '@/commands/conversations';
import { createPin, updatePinAssertions } from '@/commands/pins';
import { updateConversationContext } from '@/infrastructure';

export interface RetuneParams {
  projectId: string;
  leafId: string;
  commitHash: string;
  selectedAssertionIds: string[];
  /** If the leaf is already pinned, reuse the existing pin instead of creating a new one. */
  existingPinId?: string;
}

export interface RetuneResult {
  pinId: string;
  conversationId: string;
}

export function useRetuneSession() {
  const createSession = useCallback(async (params: RetuneParams): Promise<RetuneResult> => {
    const { projectId, leafId, commitHash, selectedAssertionIds, existingPinId } = params;

    // 1. Pin — reuse existing or create new
    let pinId: string;
    if (existingPinId) {
      const updated = await updatePinAssertions(existingPinId, selectedAssertionIds);
      pinId = updated.id;
    } else {
      const created = await createPin(projectId, 'leaf', leafId, selectedAssertionIds);
      pinId = created.id;
    }

    // 2. Create a new conversation branching from the leaf's commit
    const shortId = leafId.replace(/^leaf_/, '').slice(0, 8);
    const conv = await createConversation(projectId, `Re-tune: ${shortId}`, commitHash);

    // 3. Bind the pin to the new conversation's context
    // (no commands/context aggregate yet; infra direct call is fine
    // from a hook per v2 §2.6)
    await updateConversationContext(conv.conversation_id, [pinId]);

    return { pinId, conversationId: conv.conversation_id };
  }, []);

  return { createSession };
}
