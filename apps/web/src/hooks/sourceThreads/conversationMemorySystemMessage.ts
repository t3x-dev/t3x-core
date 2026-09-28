import type { GenerationMessage } from '@/infrastructure/generation';

/**
 * The only memory field generation may send. `token_estimate` and `sources`
 * stay on the memory object and are not repository state.
 */
export function conversationMemorySystemMessage(memory: {
  text: string;
  token_estimate?: number;
  sources?: ReadonlyArray<{ type: string; id: string; title?: string }>;
}): GenerationMessage | null {
  const content = memory.text.trim();
  if (!content) return null;
  return {
    role: 'system',
    content,
  };
}
