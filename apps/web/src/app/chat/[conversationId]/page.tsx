'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

export default function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const searchParams = useSearchParams();
  const firstMessage = searchParams.get('firstMessage');

  return (
    <div className="flex h-full">
      <ChatWorkspace
        conversationId={conversationId}
        firstMessage={firstMessage ?? undefined}
        className="flex-1"
      />
      {/* ExtractionPanel will be added in Task 8 */}
    </div>
  );
}
