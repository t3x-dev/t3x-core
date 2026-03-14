'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { ExtractionPanel } from '@/components/chat/ExtractionPanel';
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
      <ExtractionPanel />
    </div>
  );
}
