'use client';

import {
  GenerationComposer,
  type GenerationComposerProps,
} from '@/components/generation/GenerationComposer';

export interface ChatInputProps extends GenerationComposerProps {
  conversationId?: string | null;
}

// Compatibility component for the retiring Chat workbench. Conversation
// identity never affected composer behavior, so it is intentionally omitted
// from the repository-owned capability.
export function ChatInput({ conversationId: _conversationId, ...props }: ChatInputProps) {
  return <GenerationComposer {...props} />;
}

export type { AttachedImage } from '@/types/generation';
