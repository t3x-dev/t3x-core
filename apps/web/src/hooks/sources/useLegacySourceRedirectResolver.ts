import { useCallback } from 'react';
import { fetchConversationForSourceRedirect } from '@/queries/conversations';

export function useLegacySourceRedirectResolver() {
  return useCallback(fetchConversationForSourceRedirect, []);
}
