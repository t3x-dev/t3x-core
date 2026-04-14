/**
 * useConversationContextExport — imperative trigger for exporting a
 * conversation's context as a downloadable JSON or Markdown file.
 *
 * Used by ContextPanel which previously called `fetch()` directly.
 */

import { useCallback } from 'react';
import { exportConversationContext } from '@/infrastructure/conversations';

export function useConversationContextExport() {
  const exportContext = useCallback(
    async (conversationId: string, format: 'json' | 'markdown') =>
      exportConversationContext(conversationId, format),
    []
  );
  return { exportContext };
}
