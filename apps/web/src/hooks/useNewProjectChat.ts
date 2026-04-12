/**
 * useNewProjectChat — creates a new conversation under a project, threading
 * the latest commit hash as the parent so the new chat inherits from the
 * project's current tip.
 *
 * Wraps the two L1 calls (listCommits + createConversation) so ChatSidebar
 * stops dynamically importing from `@/lib/api/*`.
 */

import { useCallback } from 'react';
import { listCommits } from '@/lib/api/commits';
import { createConversation } from '@/lib/api/conversations';

export function useNewProjectChat(): {
  start: (projectId: string) => Promise<string | null>;
} {
  const start = useCallback(async (projectId: string): Promise<string | null> => {
    try {
      const commits = await listCommits(projectId, undefined, 1);
      const parentHash = commits.length > 0 ? commits[0].hash : undefined;
      const conv = await createConversation(projectId, 'New Chat', parentHash);
      return conv.conversation_id;
    } catch {
      return null;
    }
  }, []);
  return { start };
}
