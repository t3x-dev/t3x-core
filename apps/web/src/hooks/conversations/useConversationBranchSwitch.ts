import type { SemanticContent } from '@t3x-dev/core';
import { useCallback } from 'react';
import { updateConversation } from '@/commands/conversations';
import { getConversation } from '@/infrastructure/conversations';
import { fetchCommits } from '@/queries/commits';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useCommitActions } from '../commits/useCommitActions';

interface SwitchConversationBranchInput {
  projectId: string;
  conversationId?: string | null;
  branch: string;
}

export function useConversationBranchSwitch() {
  const setActiveBranch = useChatStore((s) => s.setActiveBranch);
  const setCommitBranch = useCommitStore((s) => s.setCommitBranch);
  const { init: initCommitState } = useCommitActions();

  return useCallback(
    async ({ projectId, conversationId, branch }: SwitchConversationBranchInput) => {
      const head = (await fetchCommits(projectId, branch, 1))[0] ?? null;
      const parentCommitHash = head?.hash ?? null;
      const baseline = (head?.content ?? { trees: [], relations: [] }) as SemanticContent;

      if (conversationId && conversationId !== 'new') {
        const conversation = await getConversation(conversationId);
        await updateConversation(conversationId, {
          parent_commit_hash: parentCommitHash,
          metadata: {
            ...(conversation.metadata ?? {}),
            target_branch: branch,
          },
        });
      }

      setActiveBranch(branch);
      setCommitBranch(branch);
      useWorkspaceStore.getState().setDerived({
        tree: baseline,
        sourceIndex: new Map(),
        opsLog: [],
        rowsById: {},
        opOrigins: [],
        baselineCommitHash: parentCommitHash,
        hasConversationChanges: false,
      });
      await initCommitState(projectId, branch);
    },
    [initCommitState, setActiveBranch, setCommitBranch]
  );
}
