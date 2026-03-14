'use client';

import { useParams, useSearchParams } from 'next/navigation';

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const searchParams = useSearchParams();
  const firstMessage = searchParams.get('firstMessage');

  return (
    <div className="flex h-full">
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Conversation: {conversationId}
        {firstMessage && <span className="ml-2">(first message pending)</span>}
      </div>
    </div>
  );
}
