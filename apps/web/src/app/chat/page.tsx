'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

export default function ChatLandingPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');

  const handleSend = async () => {
    if (!message.trim()) return;
    // TODO: Wire to createConversation API in Task 7
    // For now, navigate to a placeholder conversation
    router.push(`/chat/new?firstMessage=${encodeURIComponent(message)}`);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="max-w-2xl w-full px-4">
        <h1 className="text-2xl font-bold text-center mb-2">T3X</h1>
        <p className="text-muted-foreground text-center mb-8 text-sm">
          Git for Meaning
        </p>
        <div className="relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Start a conversation..."
            className="w-full rounded-xl border border-[var(--stroke-default)] bg-[var(--hover-bg)] px-4 py-3 pr-12 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-commit)] min-h-[48px] max-h-[200px]"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            size="icon"
            className="absolute right-2 bottom-2 h-8 w-8 rounded-lg"
            onClick={handleSend}
            disabled={!message.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
