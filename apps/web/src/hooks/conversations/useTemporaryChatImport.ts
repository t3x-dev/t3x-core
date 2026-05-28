import { useCallback } from 'react';
import { createConversation, deleteConversation } from '@/commands/conversations';
import { createTurn } from '@/infrastructure/turns';
import type { Conversation, Project } from '@/infrastructure/types';
import type { TemporaryChat } from '@/store/temporaryChatsStore';

interface ImportTemporaryChatParams {
  chat: TemporaryChat;
  project: Project;
  parentCommitHash?: string;
}

export function useTemporaryChatImport(): {
  importChat: (params: ImportTemporaryChatParams) => Promise<Conversation>;
} {
  const importChat = useCallback(
    async ({
      chat,
      project,
      parentCommitHash,
    }: ImportTemporaryChatParams): Promise<Conversation> => {
      const conversation = await createConversation(
        project.project_id,
        chat.title,
        parentCommitHash
      );

      try {
        for (const message of chat.messages) {
          await createTurn(
            project.project_id,
            conversation.conversation_id,
            message.role,
            message.content
          );
        }
      } catch (error) {
        await deleteConversation(conversation.conversation_id).catch(() => undefined);
        throw error;
      }

      return conversation;
    },
    []
  );

  return { importChat };
}
