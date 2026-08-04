import { useCallback } from 'react';
import { fetchConversationSourceEvidence } from '@/queries/sourceEvidence';

export function useSourceEvidenceReader() {
  return useCallback(fetchConversationSourceEvidence, []);
}
