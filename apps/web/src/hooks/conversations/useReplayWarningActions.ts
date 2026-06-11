/**
 * Actions for the replay-warning banner. Lives in hooks/ because it
 * orchestrates infrastructure (yops_log delete) + a re-hydrate via the
 * shared hydrate composite. Component (L4) only imports this hook.
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { commitOps } from '@/commands/yops/yopsService';
import { formatUserFacingError } from '@/domain/format/errors';
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

  const removeFailingOp = useCallback(async () => {
    if (!replayWarning || !conversationId || busy) return;
    const projectId = useChatStore.getState().activeProjectId;
    if (!projectId) return;
    if (!replayWarning.rowId) {
      toast.error('Could not remove op: missing yops_log row id');
      return;
    }

    const { opsLog } = useWorkspaceStore.getState();
    if (replayWarning.opIndex < 0 || replayWarning.opIndex >= opsLog.length) {
      toast.error('Could not remove op: replay warning is no longer aligned with the script');
      return;
    }

    setBusy(true);
    try {
      const repairedOps = opsLog.filter((_, index) => index !== replayWarning.opIndex);
      await commitOps(conversationId, repairedOps, {
        replaceActiveLLMDraft: false,
        repairYopsLogId: replayWarning.rowId,
      });
      await hydrateConversationToStore(projectId, conversationId);
      toast.success('Removed failing op — workspace re-replayed');
    } catch (err) {
      toast.error(formatUserFacingError(err, 'Could not remove op.'));
    } finally {
      setBusy(false);
    }
  }, [replayWarning, conversationId, busy]);

  const deleteFailingEntry = useCallback(async () => {
    if (!replayWarning || !conversationId || busy) return;
    const projectId = useChatStore.getState().activeProjectId;
    if (!projectId) return;
    setBusy(true);
    try {
      await removeYOpsEntry(conversationId, replayWarning.rowId);
      await hydrateConversationToStore(projectId, conversationId);
      toast.success('Deleted failing entry — workspace re-replayed');
    } catch (err) {
      toast.error(formatUserFacingError(err, 'Could not delete entry.'));
    } finally {
      setBusy(false);
    }
  }, [replayWarning, conversationId, busy]);

  return {
    replayWarning,
    busy,
    dismiss,
    removeFailingOp,
    deleteFailingEntry,
    deleteFailingOp: deleteFailingEntry,
  };
}
