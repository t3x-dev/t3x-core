import { useEffect, useState } from 'react';
import { getConversation } from '@/infrastructure';

export function useInheritFromCommit(conversationId: string) {
  const [inheritFromCommitHash, setInheritFromCommitHash] = useState<string | undefined>();

  useEffect(() => {
    if (conversationId && conversationId !== 'new') {
      getConversation(conversationId)
        .then((conv) => {
          if (conv?.parent_commit_hash) {
            setInheritFromCommitHash(conv.parent_commit_hash);
          }
        })
        .catch(() => {});
    }
  }, [conversationId]);

  const clearInherit = () => setInheritFromCommitHash(undefined);

  return { inheritFromCommitHash, clearInherit };
}
