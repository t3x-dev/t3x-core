/**
 * Actions for the replay-warning banner. Lives in hooks/ because it
 * orchestrates infrastructure (yops_log delete) + a re-hydrate via the
 * shared hydrate composite. Component (L4) only imports this hook.
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { hydrateConversationToStore } from '@/hooks/conversations/hydrateConversationToStore';
import { removeYOpsEntry } from '@/infrastructure/yopsLog';
import { useChatStore } from '@/store/chatStore';
import { useWorkspaceStore } from '@/store/workspaceStore';

export function useReplayWarningActions() {
  const replayWarning = useWorkspaceStore((s) => s.replayWarning);
  const conversationId = useWorkspaceStore((s) => s.conversationId);
  const setReplayWarning = useWorkspaceStore((s) => s.setReplayWarning);
  const [busy, setBusy] = useState(false);

  const dismiss = useCallback(() => {
    setReplayWarning(null);
  }, [setReplayWarning]);

  const deleteFailingOp = useCallback(async () => {
    if (!replayWarning || !conversationId || busy) return;
    const projectId = useChatStore.getState().activeProjectId;
    if (!projectId) return;
    setBusy(true);
    try {
      await removeYOpsEntry(conversationId, replayWarning.rowId);
      await hydrateConversationToStore(projectId, conversationId);
      toast.success('Deleted failing op — workspace re-replayed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not delete op: ${msg}`);
    } finally {
      setBusy(false);
    }
  }, [replayWarning, conversationId, busy]);

  return {
    replayWarning,
    busy,
    dismiss,
    deleteFailingOp,
  };
}
