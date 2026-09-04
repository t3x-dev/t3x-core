'use client';

import { GenerationModelSelector } from '@/components/generation/GenerationModelSelector';

interface ChatModelSelectorProps {
  conversationId: string | null;
  selectedProvider?: string;
  selectedModel: string;
  onModelChange: (provider: string, model: string) => void;
}

// Compatibility component for the retiring Chat workbench.
export function ChatModelSelector({
  conversationId: _conversationId,
  ...props
}: ChatModelSelectorProps) {
  return <GenerationModelSelector {...props} />;
}
