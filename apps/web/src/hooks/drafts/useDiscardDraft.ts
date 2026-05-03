/**
 * useDiscardDraft — shared discard-the-draft action.
 *
 * Plan PR 6 wants Apply and Discard colocated in the workspace header
 * next to the proposal count. Discard's logic was previously locked
 * inside AfterPanel.handleDiscard; this hook hoists it so the header
 * (and future surfaces) can call the same path without duplicating
 * the "clear local draft + hydrate from server" sequence.
 *
 * Behavior:
 *   1. Clear the local draft (`clearDraft` routes through the
 *      single-writer; editor override is nulled in the same set).
 *   2. Re-hydrate the conversation so opsLog / tree / source index
 *      reflect what's actually on the server.
 *   3. Clear selection and reset mode.
 *   4. Toast success.
 *
 * Returns `null` when no conversation/project is active OR a commit is
 * in flight — caller renders the button disabled. Otherwise returns
 * the discard callback.
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function useDiscardDraft(): () => Promise<void> {
  return useCallback(async () => {
    const projectId = useChatStore.getState().activeProjectId;
    const convId = useWorkspaceStore.getState().conversationId;
    if (!projectId || !convId) return;
    const store = useWorkspaceStore.getState();
    if (store.mode === 'committing') return;
    store.clearDraft();
    await hydrateConversationToStore(projectId, convId);
    useWorkspaceStore.getState().clearSelection();
    useWorkspaceStore.getState().setMode('idle');
    toast.success('Workspace reverted to last commit');
  }, []);
}
