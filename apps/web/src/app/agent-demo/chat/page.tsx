'use client';

import { Bot, Send, Settings2, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { type ChatMessage, useAgentDemoStore } from '@/store/agentDemoStore';

// Star rating component
function StarRating({
  rating,
  onRate,
  disabled = false,
}: {
  rating?: number;
  onRate: (rating: number) => void;
  disabled?: boolean;
}) {
  const [hoverRating, setHoverRating] = useState(0);

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className={cn(
            'p-0.5 text-muted-foreground transition-colors hover:text-amber-500',
            (hoverRating || rating || 0) >= star && 'text-amber-500'
          )}
          onClick={() => !disabled && onRate(star)}
          onMouseEnter={() => !disabled && setHoverRating(star)}
          onMouseLeave={() => setHoverRating(0)}
          disabled={disabled}
          type="button"
          aria-label={`Rate ${star} stars`}
        >
          <Star
            className="h-4 w-4"
            fill={(hoverRating || rating || 0) >= star ? 'currentColor' : 'none'}
          />
        </button>
      ))}
      {rating && <span className="ml-2 text-xs text-green-600">Feedback recorded</span>}
    </div>
  );
}

// Chat message row component
function ChatMessageRow({
  message,
  onRate,
}: {
  message: ChatMessage;
  onRate: (rating: number) => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('border-b py-4', isUser ? 'bg-muted/30' : 'bg-background')}>
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-2 flex items-center justify-between">
          <span className={cn('text-sm font-medium', isUser ? 'text-foreground' : 'text-primary')}>
            {isUser ? 'You' : 'Bot'}
          </span>
          <span className="text-xs text-muted-foreground">{message.timestamp}</span>
        </div>
        <p className="text-sm leading-relaxed">{message.content}</p>
        {!isUser && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rate:</span>
            <StarRating rating={message.rating} onRate={onRate} disabled={!!message.rating} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentDemoChatPage() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    agentName,
    deployedVersion,
    deployedCommitHash,
    messages,
    isTyping,
    sendMessage,
    rateMessage,
  } = useAgentDemoStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (inputValue.trim()) {
      sendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header Section */}
      <header className="flex shrink-0 items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">{agentName}</h2>
        </div>
        <Badge variant="secondary" className="text-xs">
          Deployed: v{deployedVersion} ({deployedCommitHash})
        </Badge>
        <Button variant="outline" size="sm" onClick={() => router.push('/agent-demo/optimiser')}>
          <Settings2 className="h-4 w-4" />
          Agent Optimiser
        </Button>
      </header>

      {/* Messages Section */}
      <section className="flex-1 overflow-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-muted-foreground">
            <Bot className="h-10 w-10" />
            <div>
              <h3 className="font-medium text-foreground">Start a conversation</h3>
              <p className="text-sm">
                Test the agent&apos;s responses. Your ratings help improve it.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessageRow
                key={message.id}
                message={message}
                onRate={(rating) => rateMessage(message.id, rating)}
              />
            ))}
            {isTyping && (
              <div className="border-b bg-background py-4">
                <div className="mx-auto max-w-3xl px-4">
                  <div className="mb-2">
                    <span className="text-sm font-medium text-primary">Bot</span>
                  </div>
                  <div className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </section>

      {/* Input Section */}
      <footer className="shrink-0 border-t bg-background p-4">
        <div className="mx-auto flex max-w-3xl gap-3">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={2}
            className="resize-none"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isTyping}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </footer>
    </div>
  );
}
