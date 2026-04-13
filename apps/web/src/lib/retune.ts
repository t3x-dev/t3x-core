/**
 * Re-tune helper — creates a new conversation pre-loaded with pinned assertion lessons.
 *
 * Flow: Pin assertions → Create conversation → Bind pin to conversation context.
 * All backend APIs already exist; this is pure frontend orchestration.
 */
// Cross-aggregate orchestration helper — stays at @/infrastructure for
// all three API surfaces (pin, conversation, context). Not routed through
// @/commands/* because no single aggregate owns this flow; @/commands is
// reserved for per-aggregate writes consumed by hooks/stores. If this
// grows a React-dependent concern, promote to a coordinator hook instead.
import {
  createConversation,
  createPinApi,
  updateConversationContext,
  updatePinAssertionsApi,
} from '@/infrastructure';

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

export async function createRetuneSession(params: RetuneParams): Promise<RetuneResult> {
  const { projectId, leafId, commitHash, selectedAssertionIds, existingPinId } = params;

  // 1. Pin — reuse existing or create new
  let pinId: string;
  if (existingPinId) {
    const updated = await updatePinAssertionsApi(existingPinId, selectedAssertionIds);
    pinId = updated.id;
  } else {
    const created = await createPinApi(projectId, 'leaf', leafId, selectedAssertionIds);
    pinId = created.id;
  }

  // 2. Create a new conversation branching from the leaf's commit
  const shortId = leafId.replace(/^leaf_/, '').slice(0, 8);
  const conv = await createConversation(projectId, `Re-tune: ${shortId}`, commitHash);

  // 3. Bind the pin to the new conversation's context
  await updateConversationContext(conv.conversation_id, [pinId]);

  return { pinId, conversationId: conv.conversation_id };
}
