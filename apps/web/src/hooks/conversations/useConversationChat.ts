'use client';

// Compatibility exports for the retiring Chat workbench. Repository-owned
// surfaces import the Source Thread capability directly.
export {
  type SourceThreadMessage as ChatMessage,
  type UseSourceThreadGenerationOptions as UseConversationChatOptions,
  type UseSourceThreadGenerationReturn as UseConversationChatReturn,
  useSourceThreadGeneration as useConversationChat,
} from '@/hooks/sourceThreads/useSourceThreadGeneration';
