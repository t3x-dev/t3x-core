'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Legacy conversation page — redirects to /chat/[conversationId].
 * The chat-first UI (/chat) is now the primary conversation interface.
 */
export default function ConversationRedirect() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.conversationId as string;

  useEffect(() => {
    router.replace(`/chat/${conversationId}`);
  }, [router, conversationId]);

  return null;
}
