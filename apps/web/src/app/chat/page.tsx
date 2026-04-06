'use client';

import { ClipboardList, Lightbulb, Send, Target } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const STARTER_CARDS = [
  {
    icon: ClipboardList,
    title: 'Capture meeting notes',
    description: 'Summarize key decisions',
    prompt: 'I just had a meeting about... Here are my notes:',
  },
  {
    icon: Target,
    title: 'Analyze product strategy',
    description: 'Break down your thinking',
    prompt: 'I want to analyze our approach to...',
  },
  {
    icon: Lightbulb,
    title: 'Explore a new idea',
    description: 'Think through possibilities',
    prompt: "I'm exploring an idea about...",
  },
] as const;

export default function ChatLandingPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');

  const handleSend = async () => {
    if (!message.trim()) return;
    // Future: wire createConversation API
    router.push(`/chat/new?firstMessage=${encodeURIComponent(message)}`);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="max-w-2xl w-full px-4">
        <h1 className="text-2xl font-bold text-center mb-2">T3X</h1>
        <p className="text-muted-foreground text-center mb-8 text-sm">Git for Meaning</p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {STARTER_CARDS.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => setMessage(card.prompt)}
              className="flex flex-col items-start gap-2 rounded-xl border border-[var(--stroke-default)] px-4 py-3.5 text-left transition-colors hover:bg-[var(--hover-bg)] hover:border-[var(--accent-commit)]/40"
            >
              <card.icon className="h-4 w-4 text-[var(--text-tertiary)]" />
              <div>
                <div className="text-sm font-medium">{card.title}</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{card.description}</div>
              </div>
            </button>
          ))}
        </div>

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
